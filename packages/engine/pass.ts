/**
 * `runAnalysisPass` — the engine's first PRODUCTION entry point.
 *
 * Until this file, `packages/engine` was ten well-tested components with no
 * assembly: the only place Stages 1→6 were chained was
 * `e2e.sso-flow.fixture.test.ts`, which stopped at Stage 6 and never called
 * Stage 7/8 at all. `computeEffectiveTier` and `recordIntervention` had zero
 * callers outside their own fixture test, and `AggregationRecord` had never
 * been constructed anywhere — every mention of it in this package was a
 * comment in `stage5-6.ts` explaining why it could not yet be produced.
 *
 * This file changes none of that behaviour. It is a WIRING exercise: every
 * stage function it calls is unchanged, and the four committed fixtures
 * produce byte-identical scores and tiers through it. What is new is that
 * they can now be reached by something other than a test.
 *
 * ────────────────────────────────────────────────────────────────────────
 * STAGE ORDER IS FROZEN (§4.1, "SHALL NOT reorder these stages"). The
 * sequence below is 1→2→3→4→5/6→7→8 exactly as `docs/pipeline-design-note.md`
 * tabulates it. An implementation that reorders it is non-conformant by
 * definition, not merely unconventional — so the order here is load-bearing,
 * not stylistic.
 * ────────────────────────────────────────────────────────────────────────
 *
 * WHY `ruleSet` AND `storeReader` ARE PARAMETERS. §12.1: the rule set is "a
 * versioned data artifact, external to the engine" and "Weights SHALL NOT be
 * hard-coded" — an engine function that read `rulesets/*.json` off disk would
 * bake a path into the engine and put filesystem access inside a package CI
 * gate G-3 keeps free of host APIs. §2.2: store access is interface-only, so
 * `packages/engine` must never construct an `AuthStoreReader`. Both stay
 * injected, matching `evaluateAllModules`'s existing signature.
 *
 * STORE ACCESS, precisely. Stages 2–8 need no store. Stage 1 always MIGHT:
 * `evaluateModule`'s `authContext` branch calls `storeReader.lookup(...)`
 * whenever `loginInterface.fingerprint` is `present`. Every committed fixture
 * has it `notCollected`, so `authContext` returns `unevaluable` before the
 * call and a throwing reader is never invoked — but a reader must still be
 * SUPPLIED, and real evidence carrying a fingerprint will reach it. That is
 * A1.3's dependency, unchanged by this file and unrelated to `prior`.
 *
 * `prior === null` is the first pass of a Session and requires no persistence
 * of any kind: §11.3 imposes no floor when no intervention has been
 * presented, so `effectiveTier === rawTier` and both flags are false.
 */

import type { SecurityEvidence } from '../contracts/evidence.contract.v1';
import type { EvaluationSet } from '../contracts/evaluation.contract.v1';
import type { RuleSet } from '../contracts/ruleset.format.v1';
import type { AuthStoreReader } from '../contracts/boundary.interfaces.v1';
import type {
  AggregationRecord, CorrelationFinding, ScoringEntry, SuppressionApplication,
} from '../contracts/passresult.contract.v1';

import { assembleEvaluationSet, evaluateAllModules } from './orchestrator.ts';
import { matchAllRules } from './stage2.ts';
import type { RuleMatchResult } from './stage2.ts';
import { generateCorrelationFindings } from './stage3.ts';
import { generateSuppressionApplications } from './stage4.ts';
import { computeScoringAndAggregation } from './stage5-6.ts';
import { computeEffectiveTier } from './stage7-8.ts';
import type { PriorPassState } from './stage7-8.ts';

/**
 * One pass's complete output.
 *
 * Deliberately NOT just `AggregationRecord`: that would discard the findings,
 * suppression applications and scoring entries, which `AnalysisPassResult`
 * needs to be committed atomically (P-11 — "A partially aggregated score
 * SHALL NEVER reach CurrentSecurityState"). Recovering them would mean a
 * second full run.
 *
 * This is NOT an `AnalysisPassResult` and does not pretend to be one. That
 * record additionally carries `evaluatedOn`, `advisory`, `capability`, and a
 * complete `ruleOutcomes: RuleOutcome[]` — and `RuleOutcome`'s three-state
 * form is still blocked by DEFECT-21's `RuleMatchResult` surface. What is
 * returned here is `RuleMatchResult[]`, the engine's own narrower type.
 */
export interface AnalysisPassOutcome {
  /** Stage 1. Exactly one SecurityEvaluation per module (E-8). */
  readonly evaluations: EvaluationSet;
  /** Stage 2. One result per rule in the active rule set. */
  readonly ruleOutcomes: readonly RuleMatchResult[];
  /** Stage 3. One finding per matched rule. */
  readonly findings: readonly CorrelationFinding[];
  /** Stage 4. Every evaluated pair, applied or not (§6.1, non-destructive). */
  readonly suppressions: readonly SuppressionApplication[];
  /** Stage 5+6. One entry per finding (P-3). */
  readonly scoring: readonly ScoringEntry[];
  /** Stages 6+7+8. All ten fields — constructible for the first time. */
  readonly aggregation: AggregationRecord;
}

export async function runAnalysisPass(
  evidence: SecurityEvidence,
  ruleSet: RuleSet,
  storeReader: AuthStoreReader,
  prior: PriorPassState | null,
): Promise<AnalysisPassOutcome> {
  // ── Stage 1 — Module Evaluation ────────────────────────────────────────
  // ONE dispatch, threaded into everything downstream (DEFECT-30, resolved).
  //
  // This previously ran Stage 1 twice — `assembleEvaluationSet` dispatched
  // internally for the envelopes, and `evaluateAllModules` dispatched again
  // for Stages 2-4 — minting two disjoint sets of ten `evaluationId`s for one
  // logical pass. Now the dispatch happens exactly once and both consumers
  // read the same results.
  //
  // Both are still needed, for different things: Stages 2-4 consume
  // `ModuleDispatchResult` (DEC-15's Stage 2 dependency check — `FindingPath`
  // "MUST resolve against D0.2's FindingsByModule", never the surrounding
  // envelope), while the envelopes are E-8's unit and what a persisted
  // AnalysisPassResult references. The difference is that they are now two
  // VIEWS of one dispatch rather than two dispatches.
  //
  // E-8 ("Exactly one evaluation per module per pass. Never zero, never two.")
  // is therefore satisfied BY CONSTRUCTION here, not by coincidence: a single
  // `evaluateAllModules` call produces exactly one `ModuleDispatchResult` per
  // ModuleId, and `assembleEvaluationSet` maps over those one-to-one. There is
  // no code path in this function that could produce a second evaluation for
  // any module.
  const dispatch = await evaluateAllModules(evidence, storeReader);
  const evaluations = assembleEvaluationSet(evidence, dispatch);

  // ── Stage 2 — Predicate Matching ───────────────────────────────────────
  const ruleOutcomes = matchAllRules(dispatch, ruleSet);

  // ── Stage 3 — Correlation Finding Generation ───────────────────────────
  const findings = generateCorrelationFindings(evidence, dispatch, ruleOutcomes, ruleSet);

  // ── Stage 4 — Contextual Suppression ───────────────────────────────────
  const suppressions = generateSuppressionApplications(findings, dispatch, ruleSet);

  // ── Stages 5 + 6 — Effective Weight, then Aggregation ──────────────────
  // Canonical ordering (DEFECT-26/27) lives inside this function; nothing
  // here re-sorts or otherwise disturbs it.
  const { scoring, aggregation } = computeScoringAndAggregation(findings, suppressions, ruleSet);

  // ── Stages 7 + 8 — Threshold Evaluation, then Monotonic Escalation ─────
  // `aggregation.rawTier` is Stage 7's output, already computed by
  // `computeRawTier` inside Stage 6's function. Stage 8 applies §11.3's floor.
  const escalation = computeEffectiveTier(aggregation.rawTier, prior);

  return {
    evaluations,
    ruleOutcomes,
    findings,
    suppressions,
    scoring,
    // The complete AggregationRecord: Stage 6's seven fields plus Stage 8's
    // three. Assembled here, not inside stage5-6.ts, because the three
    // Stage-8 fields need the prior-pass state that only a caller owning the
    // Session can supply — the boundary stage5-6.ts's header already drew.
    aggregation: {
      ruleSetVersion: aggregation.ruleSetVersion,
      subsumptionApplied: aggregation.subsumptionApplied,
      primarySum: aggregation.primarySum,
      aggravatorSum: aggregation.aggravatorSum,
      score: aggregation.score,
      thresholds: aggregation.thresholds,
      rawTier: escalation.rawTier,
      effectiveTier: escalation.effectiveTier,
      monotonicFloorApplied: escalation.monotonicFloorApplied,
      interventionLocked: escalation.interventionLocked,
    },
  };
}
