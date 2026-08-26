/**
 * Stage 4 — Contextual Suppression (§4.1, §4.2, §6). "Suppressions (§6)
 * are tested against each candidate finding. A suppression records a
 * reduction factor against a finding. It does not delete the finding."
 * (§4.2)
 *
 * DEPENDENCY, CONFIRMED BEFORE WRITING ANY OF THIS — see DECISIONS.md,
 * the Stage 4 dependency-check addendum (commit `bb0edb7`). Re-read
 * §6.1-§6.3 again for this implementation pass, specifically for
 * mechanics rather than just the dependency conclusion.
 *
 * MECHANICS, FROM §6.1 — FROZEN:
 *   - **Guarded.** "Every suppression SHALL declare guard conditions
 *     under which it does not apply." `SuppressionDefinition.guards`'s
 *     own doc comment resolves the apparent tension in that sentence:
 *     "ALL guards must hold for the suppression to apply" — guards are
 *     positive conditions, not a denylist (`blockedBy` is the denylist).
 *     Guards are `Predicate`s — the exact same AST `stage2.ts` already
 *     evaluates for rules. Reused via `matchPredicate` directly, not
 *     reimplemented — this file contains zero predicate-evaluation
 *     logic of its own.
 *   - **`blockedBy`.** `ruleset.format.v1.ts`'s own comment: "Negative
 *     guards: if ANY holds, the suppression does NOT apply." §6.3's
 *     prose is more specific for S-02 — "CRED-03 has not fired against
 *     the action domain" — but `blockedBy: readonly RuleId[]` is typed
 *     as bare rule IDs with no domain-scoping mechanism, and
 *     `CorrelationFinding` carries no per-finding domain field to scope
 *     against. Implemented as the coarser, type-supported check — did
 *     the named rule fire AT ALL this pass — matching
 *     `ruleset.format.v1.ts`'s own simpler framing exactly. This is a
 *     real narrowing of §6.3's domain-scoped prose, the same shape as
 *     S-01's own self-documented narrowing of §6.2 (DEC-17) — not
 *     invented here, not silently glossed over either.
 *   - **Non-destructive, always recorded.** Every finding-suppression
 *     pair where the suppression's `targets` names the finding's rule
 *     produces a `SuppressionApplication`, whether or not it ends up
 *     `applied`. "Did not apply" is a recorded outcome, never silence —
 *     `guardEvaluations` records every guard's individual result (not
 *     just whether they all held), so a human debugging a false negative
 *     can see exactly which guard failed.
 *   - **Maximum, not product** — across suppressions, not within one.
 *     `max_reduction(f) = max{ reduction(s) : s applicable to f, guards
 *     satisfied }`. This file's `generateSuppressionApplications`
 *     produces the raw per-pair records (§4.2's literal Stage 4 output);
 *     `maxAppliedReduction`, below, is a small, separately-testable
 *     helper implementing exactly the `max_reduction(f)` term of §6.1's
 *     formula over those records — provided here because the task asked
 *     for max-not-product to be verified, not because Stage 4 owns the
 *     full formula. `effective_weight(f) = base_weight(f) × (1 −
 *     max_reduction(f))` — the OTHER half of the formula, needing
 *     `baseWeight` — is §4.2's Stage 5 ("Effective Weight Calculation"),
 *     not built here.
 *
 * A-01 (§6.4, User-Trusted Origin) is NOT built here — DEC-16 (open):
 * zero guards exist in `rulesets/rules-v0.1.0.json`'s `suppressions`
 * array, so there is nothing to evaluate. This file makes no
 * A-01-specific accommodation; it iterates whatever `ruleSet.suppressions`
 * actually contains (today: S-01, S-02) and would pick up A-01
 * automatically if a future rule-set version added it — no
 * special-casing which suppressions to check, per instruction.
 *
 * S-01's guard is NOT extended with a third condition here — DEC-17
 * (open): the live rule set's `guards` array already reflects the
 * self-documented narrowing (2 of §6.2's 3 conditions); this file
 * evaluates exactly what `guards` contains, nothing invented on top.
 */

import { matchPredicate } from './stage2.ts';
import type { EvaluationSetForMatching } from './stage2';
import type { CorrelationFinding, SuppressionApplication, GuardEvaluation } from '../contracts/passresult.contract.v1';
import type { RuleSet } from '../contracts/ruleset.format.v1';

/**
 * One `SuppressionApplication` per (finding, suppression) pair where the
 * suppression's `targets` names the finding's rule. `evaluations` MUST be
 * the same evaluation set `findings` was produced against (the same
 * `evaluateAllModules` call that fed Stage 2/3) — guards read the same
 * Findings data rules do, "against the recorded AuthContext Evaluation,
 * never by querying the store directly" (§6.2), which `matchPredicate`
 * already guarantees (it never touches a store reader).
 */
export function generateSuppressionApplications(
  findings: readonly CorrelationFinding[],
  evaluations: EvaluationSetForMatching,
  ruleSet: RuleSet,
): readonly SuppressionApplication[] {
  // "CRED-03 has not fired" (§6.3) means fired THIS PASS — derived from
  // which rules actually produced a finding, not from any broader history.
  const firedRuleIds = new Set(findings.map((f) => f.ruleId));

  const applications: SuppressionApplication[] = [];

  for (const finding of findings) {
    for (const suppression of ruleSet.suppressions) {
      const target = suppression.targets.find((t) => t.ruleId === finding.ruleId);
      // This suppression doesn't target this finding's rule at all —
      // not an "evaluated pair" per §6.1, nothing to record.
      if (target === undefined) continue;

      // Every guard evaluated and recorded individually — not short-
      // circuited — so guardEvaluations reflects each guard's own
      // outcome, not just whether they collectively held.
      const guardEvaluations: readonly GuardEvaluation[] = suppression.guards.map((guard, guardIndex) => ({
        guardIndex,
        held: matchPredicate(guard, evaluations, ruleSet, suppression.id),
      }));
      const allGuardsHeld = guardEvaluations.every((g) => g.held);

      const blockedByRuleId = suppression.blockedBy.find((ruleId) => firedRuleIds.has(ruleId)) ?? null;

      applications.push({
        suppressionId: suppression.id,
        targetFindingId: finding.findingId,
        targetRuleId: finding.ruleId,
        guardEvaluations,
        blockedByRuleId,
        applied: allGuardsHeld && blockedByRuleId === null,
        // Recorded even when not applied (§6.1) — target.reduction is
        // this suppression's declared reduction for this rule, looked up
        // above regardless of whether it ends up applying.
        declaredReduction: target.reduction,
      });
    }
  }

  return applications;
}

/**
 * `max_reduction(f)` from §6.1's formula, over one finding's applied
 * SuppressionApplications: the maximum `declaredReduction` among the
 * ones that actually `applied`, or 0 if none applied — "commutative and
 * associative, [so] the order... cannot affect the outcome" (§6.1),
 * which `Math.max` over an unordered filter already guarantees. NOT
 * `effective_weight` — that needs `baseWeight` too (Stage 5, not here).
 */
export function maxAppliedReduction(findingId: string, applications: readonly SuppressionApplication[]): number {
  const applied = applications.filter((a) => a.targetFindingId === findingId && a.applied);
  if (applied.length === 0) return 0;
  return Math.max(...applied.map((a) => a.declaredReduction));
}
