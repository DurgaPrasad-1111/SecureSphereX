/**
 * Stage 7 — Threshold Evaluation, and the pure computational half of
 * Stage 8 — Current Security State Update (§11.3, §11.4).
 *
 * STAGE BOUNDARY, per `docs/pipeline-design-note.md`'s stage table (§4.1,
 * "SHALL NOT reorder these stages"): Stage 7 maps a score to a Low/Medium/
 * High tier and does nothing else. Monotonic escalation belongs to Stage 8,
 * NOT Stage 7 — a distinction worth stating because the commit history
 * around Stage 5/6 reads as though tiering and escalation were one step.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THE FLOOR IS THE INTERVENED TIER, NOT THE PRIOR TIER.
 *
 * §11.3 verbatim: "Within one Analysis Session, the tier SHALL NOT be
 * lowered below any tier that has already produced a user-facing
 * intervention."
 *
 * Read precisely: the floor is the tier THAT INTERVENED, not whatever tier
 * the previous pass happened to reach. Those differ routinely, because most
 * passes cannot intervene at all — §3.2's tier table gives "May intervene"
 * as No / No / Yes for collection Tiers 0 / 1 / 2, and §3.2 again: "Tier 0
 * and Tier 1 SHALL NOT interrupt the user... Only a Tier 2 gate SHALL
 * produce a modal warning or a block." A Session routinely contains Tier 0
 * and Tier 1 passes that compute a real RiskTier — possibly High — while
 * being structurally incapable of producing an intervention. For those
 * passes §11.3 imposes no floor whatsoever.
 *
 * §20.6's state machine states it a third time: "A Session that has entered
 * INTERVENED SHALL NOT reach IDLE in a state representing a lower tier than
 * THE ONE THAT PRODUCED THE INTERVENTION (§11.3, §11.4)."
 *
 * Flooring on the prior pass's tier instead would OVER-floor: it would lock
 * a Session at a tier that never interrupted anyone, permanently suppressing
 * the de-escalation §11.3 explicitly permits ("A later pass MAY raise the
 * tier freely. Escalation is unconstrained; de-escalation past an
 * intervention is prohibited" — past an INTERVENTION, nothing else).
 * ────────────────────────────────────────────────────────────────────────
 *
 * WHY THE PRIOR PASS IS A PARAMETER AND NOT A STORE READ. Whether an
 * intervention was actually presented is not derivable here:
 * `boundary.interfaces.v1.ts:245-259` says so directly — "§11.4's
 * intervention lock and §20.6's guard G-02 are both properties the engine
 * must know but only the client can observe. Without this path the engine
 * cannot set `interventionLocked`". `InterventionReporter.
 * reportInterventionPresented(sessionId, response, tier)` is the client's
 * path for supplying it, carrying the intervened `tier` explicitly.
 *
 * Taking it as a plain value keeps both functions pure and testable with no
 * store and no fake — simpler than `authContext.ts`'s `AuthStoreReader`
 * injection, which needs an interface. What defers to A1.3 is PERSISTING
 * this state across navigation events and service-worker restarts; the
 * computation does not.
 */

import type { RiskTier, ScoringEntry } from '../contracts/passresult.contract.v1';
import type { RuleSet } from '../contracts/ruleset.format.v1';

/**
 * Total order over `RiskTier`. Local to this file — `RiskTier` is a string
 * union with no intrinsic ordering, and every comparison in §11.3 is an
 * ordering comparison.
 */
const TIER_RANK: Readonly<Record<RiskTier, number>> = { Low: 0, Medium: 1, High: 2 };

/** Exported for tests; not part of any contract. */
export function tierRank(tier: RiskTier): number {
  return TIER_RANK[tier];
}

/**
 * What Stage 8 needs to know about the Session so far.
 *
 * Deliberately NOT an `AnalysisPassResult` — that would drag the whole D0.4
 * record in for two fields. Deliberately does NOT carry the prior pass's
 * `effectiveTier` either: it has no role in the floor computation (see this
 * file's header), and holding it here would invite exactly the over-flooring
 * mistake that reading §11.3 loosely produces.
 */
export interface PriorPassState {
  /**
   * The HIGHEST RiskTier at which an intervention has been presented in this
   * Session, or `null` if none ever has. §11.3's "any tier that has already
   * produced a user-facing intervention" is a maximum over the Session, not
   * the most recent value — maintained by `recordIntervention`.
   */
  readonly highestInterventionTier: RiskTier | null;
  /**
   * §11.4: "that intervention SHALL be recorded as final for the Session."
   * Monotonic — once true, never false again within a Session. Reported
   * through, not used in the floor math.
   */
  readonly interventionPresented: boolean;
  /**
   * Option C (priorFindingActive, Architecture-Owner ruling 2026-09-03): true
   * once ANY prior COMMITTED pass in this Session produced a primary finding
   * with non-zero effective weight. This is the value DL-01's
   * `priorFindingActive` predicate reads (threaded into Stage 2). Monotonic OR
   * over committed passes, exactly like `highestInterventionTier` is a maximum.
   *
   * Maintained by `recordCommittedPass` at the PASS-COMMIT boundary — NOT by
   * `recordIntervention`. That distinction is load-bearing: a primary finding
   * with non-zero weight can occur on a pass that presents no intervention (a
   * Tier 0/1 pass, or a Low/Medium result), which would never call
   * `recordIntervention`. Folding this into `recordIntervention` would silently
   * miss every such finding — the exact bug the binding requirement forbids.
   */
  readonly anyPriorPrimaryFindingActive: boolean;
}

export interface TierEscalation {
  readonly rawTier: RiskTier;
  readonly effectiveTier: RiskTier;
  readonly monotonicFloorApplied: boolean;
  readonly interventionLocked: boolean;
}

/**
 * STAGE 7 — Threshold Evaluation. Score to tier, nothing else.
 *
 * §9.4: Low < medium; Medium in [medium, high); High >= high. Extracted from
 * `stage5-6.ts`, which computed it inline while documenting that tiering is
 * a separate stage.
 */
export function computeRawTier(score: number, thresholds: { readonly medium: number; readonly high: number }): RiskTier {
  return score >= thresholds.high ? 'High' : score >= thresholds.medium ? 'Medium' : 'Low';
}

/** Reads `threshold_medium` / `threshold_high` from a rule set (§13.2). */
export function thresholdsFrom(ruleSet: RuleSet): { readonly medium: number; readonly high: number } {
  const medium = ruleSet.parameters.find((p) => p.id === 'threshold_medium')?.value;
  const high = ruleSet.parameters.find((p) => p.id === 'threshold_high')?.value;
  if (medium === undefined || high === undefined) {
    // Defensive only — V-4 (validate-ruleset.py) already guarantees both
    // parameters are registered in a real rule set.
    throw new Error('threshold_medium/threshold_high must both be registered in the rule set (V-4 should have caught this).');
  }
  return { medium, high };
}

/**
 * STAGE 8 (computational half) — §11.3's monotonic floor.
 *
 * `prior === null` is the first pass of a Session: no floor, no lock,
 * `effectiveTier === rawTier`. That case needs no persistence at all.
 */
export function computeEffectiveTier(rawTier: RiskTier, prior: PriorPassState | null): TierEscalation {
  const floor = prior?.highestInterventionTier ?? null;

  // No intervention has ever been presented -> §11.3 imposes no floor. This
  // is the ordinary case for a Session of Tier 0/1 passes, which cannot
  // intervene by construction (§3.2).
  const effectiveTier: RiskTier =
    floor === null || tierRank(rawTier) >= tierRank(floor) ? rawTier : floor;

  return {
    rawTier,
    effectiveTier,
    monotonicFloorApplied: tierRank(effectiveTier) > tierRank(rawTier),
    // §11.4's lock is reported, not used above: the floor comes from the
    // intervened TIER, while this flag only records THAT one occurred.
    interventionLocked: prior?.interventionPresented === true,
  };
}

/**
 * STAGE 8 (computational half) — maintains §11.3's running maximum across a
 * Session. Called by the client each time an intervention is actually
 * presented, with the tier it was presented at.
 *
 * A MAXIMUM, NOT LAST-WRITE-WINS. §11.3 floors at "ANY tier that has already
 * produced a user-facing intervention" — so once a Session has warned at
 * High, a later warning at Medium cannot lower the floor. Under well-behaved
 * input the two implementations coincide, because §11.4 permits only
 * escalation ("Subsequent passes MAY escalate it. They SHALL NOT withdraw
 * it") — which is precisely why this is written and tested as a maximum
 * rather than assumed correct from the happy path. A caller that violated
 * the escalation-only rule would otherwise silently lower the floor.
 *
 * `interventionPresented` is set true unconditionally and never reset: §11.4,
 * "that intervention SHALL be recorded as final for the Session." A new
 * navigation starts a new Session with `prior === null`, which is how the
 * lock is released — §11.4: "A new navigation creates a new Session and is
 * unaffected by a prior Session's lock."
 *
 * REAL NOW, not deferred: pure, no store, no I/O. What A1.3 defers is
 * PERSISTING the returned value across navigation events and service-worker
 * restarts — not computing it.
 */
export function recordIntervention(prior: PriorPassState | null, newlyPresentedTier: RiskTier): PriorPassState {
  const previousHighest = prior?.highestInterventionTier ?? null;

  const highestInterventionTier: RiskTier =
    previousHighest === null || tierRank(newlyPresentedTier) > tierRank(previousHighest)
      ? newlyPresentedTier
      : previousHighest;

  // Carry `anyPriorPrimaryFindingActive` through unchanged — it is owned by
  // `recordCommittedPass`, not this function. Dropping it here would reset a
  // committed prior finding every time an intervention is recorded.
  return {
    highestInterventionTier,
    interventionPresented: true,
    anyPriorPrimaryFindingActive: prior?.anyPriorPrimaryFindingActive ?? false,
  };
}

/**
 * Option C pass-commit reducer (Architecture-Owner ruling 2026-09-03). Folds
 * one just-COMMITTED pass into `PriorPassState.anyPriorPrimaryFindingActive`,
 * for the NEXT pass's `priorFindingActive` to read.
 *
 * BINDING REQUIREMENT — this runs at the pass-commit boundary UNCONDITIONALLY,
 * on every committed pass, never inside `recordIntervention`. A primary finding
 * with non-zero effective weight sets the flag even when the pass presented no
 * intervention (Tier 0/1, or a Low/Medium result); `recordIntervention` fires
 * only on an intervention and would miss those.
 *
 * Monotonic OR: once true within a Session it stays true. Reduces over
 * `ScoringEntry` (one per finding, P-3), which already carries both the
 * `ruleType` and the suppression-adjusted `effectiveWeight` — the exact filter
 * the ruling specifies (`ruleType === 'primary' && effectiveWeight > 0`). No
 * `subsumed` / `countedInScore` filter is applied: the predicate's criterion is
 * effective weight, not score inclusion.
 *
 * Pure, no store, no I/O — same class as `recordIntervention`; A1.3 defers only
 * PERSISTING the returned value across navigation / service-worker restarts.
 * The other two fields carry through unchanged (this reducer owns only the
 * boolean), so it composes with `recordIntervention` in either order.
 */
export function recordCommittedPass(
  prior: PriorPassState | null,
  scoring: readonly ScoringEntry[],
): PriorPassState {
  const thisPassHasPrimaryFinding = scoring.some(
    (entry) => entry.ruleType === 'primary' && entry.effectiveWeight > 0,
  );
  return {
    highestInterventionTier: prior?.highestInterventionTier ?? null,
    interventionPresented: prior?.interventionPresented ?? false,
    anyPriorPrimaryFindingActive:
      (prior?.anyPriorPrimaryFindingActive ?? false) || thisPassHasPrimaryFinding,
  };
}
