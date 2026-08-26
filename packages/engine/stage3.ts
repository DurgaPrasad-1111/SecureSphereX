/**
 * Stage 3 — Correlation Finding Generation (§4.1, §4.2, §7). "Every
 * matched predicate produces one Correlation Finding, referencing the
 * Security Evaluations that satisfied it, and carrying its base weight
 * from the rule set" (§4.2) — except the "carrying its base weight" part:
 * `CorrelationFinding` (`passresult.contract.v1.ts`) has NO weight field
 * by design (§2.4: "a finding does NOT carry its own weight — weight is a
 * property of a rule-set evaluation, not of the finding"). Weight belongs
 * to `ScoringEntry`, a Stage 5 concern, not built here.
 *
 * DEPENDENCY, CONFIRMED BEFORE WRITING ANY OF THIS — see DECISIONS.md,
 * the Stage 3 dependency-check addendum (2026-08-26) and its `findingId`
 * resolution. Re-read §7.1 (Rule Table) and §7.2 (Rule Detail, all eleven
 * rules) in full for this implementation, not just reused the dependency
 * conclusion — implementation needs the rule-by-rule detail.
 *
 * WHAT §7.2's RULE-BY-RULE DETAIL ACTUALLY REQUIRES, per rule: nothing
 * rule-specific. Every rule's `CorrelationFinding` needs exactly the same
 * five real fields (`findingId`, `evaluationRefs`, `ruleId`,
 * `correlationContext`, plus the passthrough identity/version fields) —
 * weight, tier, explanation, and false-positive/limitation text (the
 * parts of §7.2 that DO vary per rule) belong to later stages or to
 * documentation, never to `CorrelationFinding`. This is why one generic
 * function handles all eleven rules; no per-rule special-casing exists
 * because §7.2, read in full, never asks `CorrelationFinding` itself to
 * vary per rule.
 *
 * `evaluationRefs: readonly string[]` — "the evaluations this finding was
 * derived from" (§8.4.5). Built from `RuleDefinition.requiredModules`,
 * each module's already-real `evaluationId` (`orchestrator.ts`'s
 * `ModuleDispatchResult`, minted once per dispatch regardless of whether
 * that module ended up `evaluated` or `unevaluable`). `requiredModules`
 * is the rule set's own authoritative declaration of "modules whose
 * evaluations the predicate reads" (its own doc comment,
 * `ruleset.format.v1.ts:176-183`) — corrected via DEFECT-16 specifically
 * to be complete across every branch of a rule's predicate, including
 * branches an `or` didn't need to satisfy THIS particular match (PM-01 is
 * the one rule with a cross-module `or` — redirect vs. permissionContext
 * page-age — and `requiredModules` names both regardless of which arm
 * matched). Using the declared set uniformly, not a per-match dynamic
 * trace, is therefore the established, non-arbitrary reading, not a
 * guess.
 *
 * `correlationContext.constituentConjunction: readonly RuleId[] | null` —
 * ALWAYS `null` for all eleven rules today: §10.4 states the subsumption
 * table is "intentionally empty at rules-v0.1," confirmed directly
 * against `rulesets/rules-v0.1.0.json` (`subsumption: []`), so no
 * composite rule exists to ever populate this with. Not a guessed
 * default — the frozen rule set has zero composites, so `null` is the
 * only value any rule could honestly report.
 *
 * `matched`/`unmatched`/`blocked` → finding/no finding/no finding: per
 * §5.6's precedent (non-matching is not suppression, and by the same
 * principle, not a fabricated match) — `blocked` (today, DL-01 only,
 * `PriorFindingActiveUnavailableError`) produces no finding, exactly like
 * `unmatched`, never a guessed one.
 *
 * A GENUINE GAP FOUND WHILE RE-READING, NOT FIXED HERE — logged as
 * DEFECT-21 (docs/DEFECTS.md), which is the authoritative record; not
 * repeated in full here. Short version: `stage2.ts`'s `RuleMatchResult`
 * doesn't yet distinguish "a required module was unevaluable" from "the
 * predicate was fully evaluated and didn't match" (both surface as
 * `'unmatched'`), when §15.2 requires them to be different `RuleOutcome`
 * variants. Confirmed in DEFECT-21 that this does NOT affect
 * `CorrelationFinding` generation below — a `matched` result can only
 * occur when every conjunct was genuinely evaluated (§5.6) — it only
 * affects the not-yet-built `RuleOutcome`/`AnalysisPassResult`.
 */

import { mintFindingId } from './id.ts';
import { PASS_RESULT_CONTRACT_VERSION } from '../contracts/passresult.contract.v1.ts';
import type { CorrelationFinding } from '../contracts/passresult.contract.v1';
import type { SecurityEvidence } from '../contracts/evidence.contract.v1';
import type { ModuleId } from '../contracts/evaluation.contract.v1';
import type { RuleSet } from '../contracts/ruleset.format.v1';
import type { ModuleDispatchResult } from './orchestrator';
import type { RuleMatchResult } from './stage2';

/**
 * Generates one CorrelationFinding per matched rule. `evaluations` MUST be
 * the same evaluation set `matchResults` was produced against (the same
 * `evaluateAllModules` call) — mixing evaluation sets would attach the
 * wrong evaluationIds to a finding's `evaluationRefs`.
 */
export function generateCorrelationFindings(
  evidence: SecurityEvidence,
  evaluations: Readonly<Record<ModuleId, ModuleDispatchResult>>,
  matchResults: readonly RuleMatchResult[],
  ruleSet: RuleSet,
): readonly CorrelationFinding[] {
  const findings: CorrelationFinding[] = [];

  for (const matchResult of matchResults) {
    // §5.6 precedent: unmatched and blocked both produce no finding —
    // never a guessed one.
    if (matchResult.status !== 'matched') continue;

    const rule = ruleSet.rules.find((r) => r.id === matchResult.ruleId);
    if (rule === undefined) {
      // Defensive only — matchResult.ruleId always comes from iterating
      // ruleSet.rules in stage2.ts's matchAllRules; a real caller can't
      // reach this.
      throw new Error(`Matched rule "${matchResult.ruleId}" not found in the rule set it was matched against.`);
    }

    const finding: CorrelationFinding = {
      findingId: mintFindingId(),
      contractVersion: PASS_RESULT_CONTRACT_VERSION,
      targetResourceId: evidence.targetResourceId,
      analysisSessionId: evidence.analysisSessionId,
      passOrdinal: evidence.collectionContext.passOrdinal,
      ruleId: rule.id,
      evaluationRefs: rule.requiredModules.map((moduleId) => evaluations[moduleId].evaluationId),
      correlationContext: {
        emergedInPass: evidence.collectionContext.passOrdinal,
        // §10.4: subsumption table is empty at rules-v0.1 — confirmed
        // directly against rulesets/rules-v0.1.0.json — so no composite
        // rule exists for any finding to be one of. Always null today.
        constituentConjunction: null,
      },
    };
    findings.push(finding);
  }

  return findings;
}
