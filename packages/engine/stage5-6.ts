/**
 * Stage 5 — Effective Weight Calculation, and Stage 6 — Aggregation
 * (§4.1, §4.2, §9, §10), implemented TOGETHER. `ScoringEntry`
 * (`passresult.contract.v1.ts`) is the shared output type — 8 of its 11
 * fields are Stage 5's own (`findingId`, `ruleId`, `ruleType`,
 * `parentRuleId`, `baseWeight`, `suppressionsApplied`, `maxReduction`,
 * `effectiveWeight`), 3 are explicitly Stage 6's (`subsumed` §10.3,
 * `parentQualified` §9.3, `countedInScore`) — all three need the
 * COMPLETE finding set of the pass, which is exactly what §9.1 already
 * requires Stage 6 to operate over ("a pure function over the complete
 * finding set... SHALL NOT be implemented as an incremental
 * accumulator"). Combining the two stages is what makes a complete,
 * honest `ScoringEntry` possible at all — confirmed in the Stage 5
 * dependency check (DECISIONS.md) before this file was written.
 *
 * DEPENDENCY, CONFIRMED BEFORE WRITING ANY OF THIS — DEC-15's four open
 * fields (`moduleVersion`/`indicators`/`consistency`/`summary`) were
 * already confirmed unused by Stage 5 in that same dependency check.
 * Re-confirmed here by construction: this file never reads a
 * `SecurityEvaluation` or `Findings` value at all — only
 * `CorrelationFinding` (Stage 3), `SuppressionApplication` (Stage 4, via
 * `stage4.ts`'s `maxAppliedReduction`, reused directly — not
 * reimplemented), and `RuleDefinition`/`RuleSet.subsumption` (static rule-
 * set data).
 *
 * §9.2's SCORING FUNCTION, implemented literally, term by term:
 * ```
 * score(F, R) = Σ effective_weight(f)      for f primary, f ∉ subsumed
 *             + Σ aggravator_weight(a)     for a aggravator,
 *                                              parent(a) ∈ F,
 *                                              parent(a) ∉ subsumed,
 *                                              effective_weight(parent(a)) > 0
 * ```
 * Two things worth being explicit about, because a careless reading
 * conflates them: `ScoringEntry.effectiveWeight` is computed identically
 * for EVERY finding, primary or aggravator — `baseWeight × (1 −
 * maxReduction)` — because that field's own doc comment is unconditional.
 * But the SCORE SUM for an aggravator uses `aggravator_weight(a)`
 * literally — the RAW `baseWeight`, not `effectiveWeight(a)` — per §9.2's
 * own notation, which deliberately writes a different term for the
 * aggravator sum than for the primary sum. `aggravator_weight` is never
 * separately defined anywhere in the document (grepped: appears exactly
 * once, in this formula) — the only sourceable reading is "the weight
 * value associated with this rule as an aggravator," i.e. `baseWeight`,
 * the same field §7.1's table shows for both primaries and aggravators
 * alike. Today these two readings (`aggravator_weight` vs.
 * `effective_weight`) are unobservably different in practice — no
 * suppression currently targets either aggravator rule (`CRED-A1`,
 * `DL-02`) — but the distinction is implemented as literally specified,
 * not collapsed to "whichever is simpler."
 *
 * A GENUINE RULE-SET NARROWING FOUND WHILE IMPLEMENTING, NOT INVENTED OR
 * RESOLVED HERE: `CRED-A1`'s own `rationale` field in
 * `rulesets/rules-v0.1.0.json` states, verbatim: "INTERPRETIVE CHOICE,
 * FLAGGED FOR REVIEW: §7.2 states this aggravator's parent requirement as
 * 'CRED-01 or CRED-02' (two possible parents), but RuleDefinition.parent
 * is singular... CRED-01 was chosen as the sole parent — not derived from
 * spec text, an explicit judgment call pending architect ruling." This
 * file implements `parentQualified` against exactly the single `parent`
 * value the live rule set already declares (mechanical — the rule set's
 * own choice is unambiguous even though flagged for review), the same
 * posture already taken toward S-01's narrowed guards and `blockedBy`'s
 * coarse check. Not formalized as its own DEC entry in this pass — not
 * asked for here — but is the same shape of gap as DEC-16/17/18 and
 * should probably become one.
 *
 * WHAT THIS FILE DOES NOT PRODUCE — `AggregationRecord`
 * (`passresult.contract.v1.ts:171-192`), the natural pass-level
 * counterpart to `ScoringEntry`, ALSO straddles more than Stage 6: 7 of
 * its 10 fields are Stage 6's own (`ruleSetVersion`, `subsumptionApplied`,
 * `primarySum`, `aggravatorSum`, `score`, `thresholds`, `rawTier`) — this
 * file produces exactly those, as `AggregationResult` below, NOT the
 * `AggregationRecord` type itself, because the remaining 3 fields
 * (`effectiveTier`, `monotonicFloorApplied`, `interventionLocked`) are
 * §11.3/§11.4 concerns — "the tier after the monotonic floor" against
 * Current Security State, and whether an intervention already presented
 * cannot be withdrawn. Both require reading PRIOR pass / Current Security
 * State data this file has no access to and was not asked to build
 * (Stage 8, "Current Security State Update" — a different stage, not in
 * scope here). Producing a fabricated `AggregationRecord` with those
 * three fields guessed would violate the same rule this whole session has
 * held to for `SecurityEvaluation`'s blocked fields — isolated and
 * reported instead, not guessed.
 */

import { maxAppliedReduction } from './stage4.ts';
import type { CorrelationFinding, SuppressionApplication, ScoringEntry } from '../contracts/passresult.contract.v1';
import type { RiskTier } from '../contracts/passresult.contract.v1';
import type { RuleSet, RuleId } from '../contracts/ruleset.format.v1';

/**
 * Everything `AggregationRecord` needs EXCEPT the 3 Stage-8-owned fields
 * — see the header comment. Deliberately a separate, narrower type, not
 * a partial `AggregationRecord`, so nothing here can be mistaken for the
 * complete pass-level record.
 */
export interface AggregationResult {
  readonly ruleSetVersion: string;
  readonly subsumptionApplied: readonly { readonly composite: RuleId; readonly subsumed: readonly RuleId[] }[];
  readonly primarySum: number;
  readonly aggravatorSum: number;
  readonly score: number;
  readonly thresholds: { readonly medium: number; readonly high: number };
  readonly rawTier: RiskTier;
}

export interface ScoringAndAggregation {
  readonly scoring: readonly ScoringEntry[];
  readonly aggregation: AggregationResult;
}

/**
 * §9.1: a pure function over the complete finding set, recomputed in
 * full every time — no accumulator, no mutation, no dependency on call
 * order. `findings` and `suppressionApplications` MUST both come from
 * the same pass (the same Stage 3/4 run) as each other.
 */
export function computeScoringAndAggregation(
  findings: readonly CorrelationFinding[],
  suppressionApplications: readonly SuppressionApplication[],
  ruleSet: RuleSet,
): ScoringAndAggregation {
  const firedRuleIds = new Set(findings.map((f) => f.ruleId));

  // §10.3: a finding is subsumed when SOME composite rule that actually
  // fired this pass declares it as a constituent. With
  // rulesets/rules-v0.1.0.json's subsumption table genuinely empty
  // (confirmed: subsumption: []), this is always false today — a real
  // computed answer from an empty table, not a hardcoded placeholder;
  // a future rule-set version adding composites needs no change here.
  function isSubsumed(ruleId: RuleId): boolean {
    return ruleSet.subsumption.some((entry) => firedRuleIds.has(entry.composite) && entry.subsumes.includes(ruleId));
  }

  function ruleDefinitionFor(ruleId: RuleId) {
    const rule = ruleSet.rules.find((r) => r.id === ruleId);
    if (rule === undefined) {
      // Defensive only — every finding.ruleId came from stage3.ts
      // matching a rule that exists in this exact ruleSet; a real
      // caller passing a mismatched ruleSet could reach this.
      throw new Error(`Finding references rule "${ruleId}", not present in the given rule set.`);
    }
    return rule;
  }

  // Pass 1: baseWeight / maxReduction / effectiveWeight for every
  // finding. Order-independent, so safe to compute before pass 2, which
  // needs to look up ANY finding's effectiveWeight (an aggravator's
  // parent may appear later in `findings` than the aggravator itself).
  const weights = new Map<string, { readonly baseWeight: number; readonly maxReduction: number; readonly effectiveWeight: number }>();
  for (const finding of findings) {
    const rule = ruleDefinitionFor(finding.ruleId);
    const maxReduction = maxAppliedReduction(finding.findingId, suppressionApplications);
    weights.set(finding.findingId, {
      baseWeight: rule.baseWeight,
      maxReduction,
      effectiveWeight: rule.baseWeight * (1 - maxReduction),
    });
  }

  // Pass 2: subsumed / parentQualified / countedInScore, plus the full
  // ScoringEntry — needs pass 1's effectiveWeight values (for a parent
  // lookup) to already exist for every finding, regardless of order.
  const scoring: ScoringEntry[] = [];
  let primarySum = 0;
  let aggravatorSum = 0;

  for (const finding of findings) {
    const rule = ruleDefinitionFor(finding.ruleId);
    const { baseWeight, maxReduction, effectiveWeight } = weights.get(finding.findingId)!;
    const subsumed = isSubsumed(finding.ruleId);
    const suppressionsApplied = suppressionApplications
      .filter((a) => a.targetFindingId === finding.findingId && a.applied)
      .map((a) => a.suppressionId);

    let parentQualified: boolean | null = null;
    let countedInScore: boolean;

    if (rule.type === 'aggravator') {
      // §9.3: present, unsubsumed, and the PARENT's own effective weight
      // is non-zero. The aggravator's OWN subsumption status is not part
      // of §9.2's aggravator conjuncts — implemented literally, not
      // extended with a check the formula doesn't ask for.
      const parentRuleId = rule.parent;
      const parentFinding = parentRuleId === null ? undefined : findings.find((f) => f.ruleId === parentRuleId);
      const parentWeights = parentFinding === undefined ? undefined : weights.get(parentFinding.findingId);
      parentQualified = parentFinding !== undefined
        && !isSubsumed(parentFinding.ruleId)
        && parentWeights !== undefined
        && parentWeights.effectiveWeight > 0;
      countedInScore = parentQualified;
      if (countedInScore) {
        // §9.2: aggravator_weight(a) — the RAW baseWeight, not this
        // aggravator's own effectiveWeight. See the header comment.
        aggravatorSum += baseWeight;
      }
    } else {
      countedInScore = !subsumed;
      if (countedInScore) {
        primarySum += effectiveWeight;
      }
    }

    scoring.push({
      findingId: finding.findingId,
      ruleId: finding.ruleId,
      ruleType: rule.type,
      parentRuleId: rule.parent,
      baseWeight,
      suppressionsApplied,
      maxReduction,
      effectiveWeight,
      subsumed,
      parentQualified,
      countedInScore,
    });
  }

  const score = primarySum + aggravatorSum;

  const thresholdMedium = ruleSet.parameters.find((p) => p.id === 'threshold_medium')?.value;
  const thresholdHigh = ruleSet.parameters.find((p) => p.id === 'threshold_high')?.value;
  if (thresholdMedium === undefined || thresholdHigh === undefined) {
    // Defensive only — V-4 (validate-ruleset.py) already guarantees both
    // parameters are registered in a real rule set.
    throw new Error('threshold_medium/threshold_high must both be registered in the rule set (V-4 should have caught this).');
  }

  // §9.4: Low < medium; Medium in [medium, high); High >= high.
  const rawTier: RiskTier = score >= thresholdHigh ? 'High' : score >= thresholdMedium ? 'Medium' : 'Low';

  const subsumptionApplied = ruleSet.subsumption
    .filter((entry) => firedRuleIds.has(entry.composite))
    .map((entry) => ({ composite: entry.composite, subsumed: entry.subsumes }));

  return {
    scoring,
    aggregation: {
      ruleSetVersion: ruleSet.ruleSetVersion,
      subsumptionApplied,
      primarySum,
      aggravatorSum,
      score,
      thresholds: { medium: thresholdMedium, high: thresholdHigh },
      rawTier,
    },
  };
}
