/**
 * SecureSphere X — Analysis Pass Result Contract v1  (D0.4)
 *
 * Conforms to: Specification v0.7 §9.5 (recorded outputs), §15.2 (capability
 *              set), §15.4 (atomicity), §11 (Current Security State),
 *              §10 (subsumption), §6.1 (non-destructive suppression),
 *              §2.4 (scoring is not intrinsic to a finding)
 * Package:     packages/contracts
 * Owner:       Role B
 * Consumers:   Role A (UI, enforcement), persistence (Analysis Session),
 *              replay harness, Role C (metrics extraction)
 *
 * This is the ONE artifact that makes a decision explainable to a user,
 * reproducible by a developer, and auditable by an examiner. Everything
 * needed to reconstruct WHY a tier was reached lives here.
 *
 * STATUS: FROZEN at Stage 0.
 */
import type { AnalysisSessionId, TargetResourceId, PassResultId, FindingId, DayStamp } from './evidence.contract.v1';
import type { ModuleId, UnevaluableReason } from './evaluation.contract.v1';
import type { RuleId, SuppressionId, Tier } from './ruleset.format.v1';

export const PASS_RESULT_CONTRACT_VERSION = '1.0.0' as const;

/* ────────────────────────────────────────────────────────────────────────
 * 1. CORRELATION FINDING
 *
 * §10.1: a finding references EVALUATIONS, never other findings. §2.4: a
 * finding does NOT carry its own weight — weight is a property of a
 * rule-set evaluation, not of the finding. That separation is what allows
 * a historical finding to be re-scored under a later rule set without
 * violating immutability.
 * ──────────────────────────────────────────────────────────────────────── */

export interface CorrelationContext {
  /** Pass ordinal in which this finding emerged. */
  readonly emergedInPass: number;
  /** Composites only (§10.2). Null for all rules at rules-v0.1. */
  readonly constituentConjunction: readonly RuleId[] | null;
}

export interface CorrelationFinding {
  readonly findingId: FindingId;
  readonly contractVersion: typeof PASS_RESULT_CONTRACT_VERSION;

  readonly targetResourceId: TargetResourceId;
  readonly analysisSessionId: AnalysisSessionId;
  readonly passOrdinal: number;

  readonly ruleId: RuleId;

  /** §8.4.5: the evaluations this finding was derived from. Composites
   *  reference the UNION of their constituents' evaluations (§10.1). */
  readonly evaluationRefs: readonly string[];

  readonly correlationContext: CorrelationContext;

  /** NO weight field. See §2.4 and the ScoringEntry below. */
}

/* ────────────────────────────────────────────────────────────────────────
 * 2. RULE OUTCOMES
 *
 * Every rule in the active rule set produces exactly one outcome per pass.
 * Never zero. `unevaluable` is an OUTCOME, not an absence — §15.2's whole
 * mechanism depends on distinguishing "tested, no match" from "could not
 * test".
 * ──────────────────────────────────────────────────────────────────────── */

export type RuleOutcome =
  | { readonly ruleId: RuleId; readonly outcome: 'matched';
      readonly findingId: FindingId }
  | { readonly ruleId: RuleId; readonly outcome: 'notMatched' }
  | { readonly ruleId: RuleId; readonly outcome: 'unevaluable';
      readonly reason: UnevaluableReason;
      /** Which required modules were unevaluable. */
      readonly unevaluableModules: readonly ModuleId[] };

/* ────────────────────────────────────────────────────────────────────────
 * 3. SUPPRESSION RECORD
 *
 * §6.1: suppression is NON-DESTRUCTIVE. A suppressed finding remains
 * recorded together with the suppression that applied AND its guard
 * evaluation. When debugging a false negative, this record is where the
 * answer is.
 * ──────────────────────────────────────────────────────────────────────── */

export interface GuardEvaluation {
  readonly guardIndex: number;
  readonly held: boolean;
}

export interface SuppressionApplication {
  readonly suppressionId: SuppressionId;
  readonly targetFindingId: string;
  readonly targetRuleId: RuleId;

  readonly guardEvaluations: readonly GuardEvaluation[];
  /** Set when a `blockedBy` rule fired, preventing application (§6.3). */
  readonly blockedByRuleId: RuleId | null;

  readonly applied: boolean;
  /** Declared reduction. Recorded even when `applied` is false. */
  readonly declaredReduction: number;
}

/* ────────────────────────────────────────────────────────────────────────
 * 4. SCORING ENTRY
 *
 * §6.1: multiple suppressions take the MAXIMUM reduction, never the
 * product. Maximum is commutative and associative, so the order in which
 * suppressions are considered cannot affect the outcome — which is what
 * keeps §4.3's determinism guarantee true.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ScoringEntry {
  readonly findingId: FindingId;
  readonly ruleId: RuleId;
  readonly ruleType: 'primary' | 'aggravator';
  readonly parentRuleId: RuleId | null;

  readonly baseWeight: number;
  readonly suppressionsApplied: readonly SuppressionId[];
  /** max over applied suppressions; 0 where none applied. */
  readonly maxReduction: number;
  /** baseWeight × (1 − maxReduction) */
  readonly effectiveWeight: number;

  /** §10.3: subsumed findings remain recorded but are excluded from the sum. */
  readonly subsumed: boolean;
  /** §9.3: an aggravator contributes only where its parent is present,
   *  unsubsumed, and has non-zero effective weight. */
  readonly parentQualified: boolean | null;

  readonly countedInScore: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
 * 5. CAPABILITY SET   (§15.2)
 *
 * "Degraded capability SHALL be recorded, never silent." A rule that could
 * not be evaluated produces no finding, which at the output is otherwise
 * indistinguishable from a rule that evaluated and found nothing.
 * ──────────────────────────────────────────────────────────────────────── */

export interface CapabilitySet {
  readonly evaluableRules: readonly RuleId[];
  readonly unevaluableRules: readonly {
    readonly ruleId: RuleId;
    readonly reason: UnevaluableReason;
  }[];
  readonly unevaluableModules: readonly {
    readonly moduleId: ModuleId;
    readonly reason: UnevaluableReason;
  }[];

  /**
   * §15.2: set where ANY CRED-family rule is unevaluable. When true, the
   * user-facing indicator SHALL NOT present an unqualified safe state.
   */
  readonly degraded: boolean;
  readonly degradedReason: string | null;
}

/* ────────────────────────────────────────────────────────────────────────
 * 6. AGGREGATION RECORD   (§9)
 * ──────────────────────────────────────────────────────────────────────── */

export type RiskTier = 'Low' | 'Medium' | 'High';

export interface AggregationRecord {
  readonly ruleSetVersion: string;
  readonly subsumptionApplied: readonly {
    readonly composite: RuleId;
    readonly subsumed: readonly RuleId[];
  }[];

  readonly primarySum: number;
  readonly aggravatorSum: number;
  readonly score: number;

  readonly thresholds: { readonly medium: number; readonly high: number };

  /** Tier from score alone, BEFORE §11.3 monotonic escalation. */
  readonly rawTier: RiskTier;
  /** Tier after the monotonic floor. This is the operative tier. */
  readonly effectiveTier: RiskTier;
  /** True where §11.3 raised the tier above `rawTier`. */
  readonly monotonicFloorApplied: boolean;
  /** §11.4: an intervention already presented cannot be withdrawn. */
  readonly interventionLocked: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
 * 7. ADVISORY REFERENCE   (Phase II, §1.4)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AdvisoryReference {
  readonly advisoryFindingId: string;
  /** §1.4: always attributed as AI-generated wherever surfaced. */
  readonly attributedAsAiGenerated: true;
  /** §1.4: invoking input and returned output persisted with the Session. */
  readonly invocationRecordId: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * 8. ANALYSIS PASS RESULT
 * ──────────────────────────────────────────────────────────────────────── */

export type PassTrigger =
  | 'navigation_commit'        // Tier 0
  | 'dom_ready'                // Tier 1
  | 'gate_credential_submit'   // Tier 2
  | 'gate_download_initiate'   // Tier 2
  | 'gate_permission_request'  // Tier 2
  | 'advisory_reevaluation';   // Tier 2, Phase II second forward pass

export interface AnalysisPassResult {
  readonly passResultId: PassResultId;
  readonly contractVersion: typeof PASS_RESULT_CONTRACT_VERSION;

  readonly targetResourceId: TargetResourceId;
  readonly analysisSessionId: AnalysisSessionId;
  readonly passOrdinal: number;          // 1-based
  readonly tier: Tier;
  readonly trigger: PassTrigger;

  /** Day granularity (§20.3). */
  readonly evaluatedOn: DayStamp;

  /** Traceability: the Stage 1 output this pass consumed. */
  readonly evaluationRefs: readonly string[];
  readonly advisory: AdvisoryReference | null;

  /** COMPLETE outcome set — one per rule in the active rule set. */
  readonly ruleOutcomes: readonly RuleOutcome[];
  /** COMPLETE finding set, including findings later suppressed or subsumed. */
  readonly findings: readonly CorrelationFinding[];
  readonly suppressions: readonly SuppressionApplication[];
  readonly scoring: readonly ScoringEntry[];

  readonly capability: CapabilitySet;
  readonly aggregation: AggregationRecord;
}

/* ────────────────────────────────────────────────────────────────────────
 * 9. CURRENT SECURITY STATE   (§11.1)
 *
 * Replaced wholesale on every pass; never incrementally adjusted, never
 * retroactively edited. Full detail is resolved through the referenced
 * Pass Result.
 * ──────────────────────────────────────────────────────────────────────── */

export interface CurrentSecurityState {
  readonly analysisSessionId: AnalysisSessionId;
  readonly targetResourceId: TargetResourceId;
  readonly score: number;
  readonly tier: RiskTier;
  readonly ruleSetVersion: string;
  readonly degraded: boolean;
  readonly sourcePassResultId: string;
  readonly passOrdinal: number;
}

/* ────────────────────────────────────────────────────────────────────────
 * 10. INVARIANTS
 *
 * P-1  Exactly one RuleOutcome per rule in the active rule set. Never zero,
 *      never two. A rule absent from `ruleOutcomes` is a defect, not a
 *      non-match.
 * P-2  Every `matched` outcome has a corresponding CorrelationFinding.
 * P-3  Every finding has exactly one ScoringEntry.
 * P-4  effectiveWeight === baseWeight × (1 − maxReduction), exactly.
 * P-5  maxReduction === max(applied reductions), NOT the product (§6.1).
 * P-6  A subsumed finding remains in `findings` with countedInScore === false.
 * P-7  A suppressed finding remains in `findings`; its SuppressionApplication
 *      is recorded with full guard evaluation, applied or not (§6.1).
 * P-8  score === Σ effectiveWeight over entries with countedInScore === true.
 * P-9  effectiveTier is never lower than any tier that produced an
 *      intervention earlier in this Session (§11.3, §11.4).
 * P-10 `degraded` is true whenever any CRED-family rule is unevaluable (§15.2).
 * P-11 A Pass Result is committed ATOMICALLY or not at all (§15.4). A
 *      partially aggregated score SHALL NEVER reach CurrentSecurityState.
 * P-12 Immutable once committed (§2.2).
 * P-13 Replay of a Pass Result under its recorded ruleSetVersion, against
 *      its referenced evaluations, MUST reproduce identical scoring,
 *      identical findings, and an identical effectiveTier (§12.4, §17.2).
 * P-14 No CorrelationFinding references another CorrelationFinding (§10.1).
 * ──────────────────────────────────────────────────────────────────────── */
