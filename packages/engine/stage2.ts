/**
 * Stage 2 — Predicate Matching (§4.1, §4.2, §5). Evaluates a rule's
 * `Predicate` AST (`ruleset.format.v1.ts`) against Stage 1's output.
 *
 * SCOPE, DELIBERATELY NARROW — this is predicate matching only, not the
 * rest of the pipeline. Stage 3 (Correlation Finding Generation), Stage 4
 * (Contextual Suppression), Stage 5 (Effective Weight), Stage 6
 * (Aggregation), Stage 7 (Threshold), and Stage 8 (State Update) are not
 * implemented here and were not asked for in this pass.
 *
 * DEPENDENCY, CONFIRMED BEFORE WRITING ANY OF THIS — see DECISIONS.md,
 * the addendum to DEC-15 dated 2026-08-26 ("Stage 2 dependency check").
 * `ruleset.format.v1.ts`'s own doc comment on `FindingPath` (lines 20-28):
 * "A predicate reads typed fields from the EvaluationSet. Paths are
 * `<moduleId>.<field>` and MUST resolve against D0.2's FindingsByModule.
 * A static check validates every path at release (§8, V-2)." Confirmed by
 * reading the full `Predicate` type operator by operator: every operand
 * resolves exclusively through `ValuePath` (`FindingPath | ItemPath`) —
 * `FindingsByModule`, never the surrounding `SecurityEvaluation<M>`
 * envelope. This module therefore needs only `ModuleId` + the
 * `Evaluability<FindingsByModule[M]>` each module already produces —
 * exactly `packages/engine/orchestrator.ts`'s `ModuleDispatchResult`,
 * already real today. `moduleVersion`/`indicators`/`consistency`/`summary`
 * (DEC-15, still open) and `evaluationId`/`evidenceRefs`/`moduleId`/
 * `passOrdinal`/`contractVersion`/`targetResourceId`/`analysisSessionId`/
 * `collectionContext` (the rest of the envelope) are never read here —
 * confirmed by direct scan, zero of the ten `*Findings` interfaces in
 * `evaluation.contract.v1.ts` contain a field with any of those names.
 *
 * ONE GENUINE, SEPARATE BLOCKER — `priorFindingActive` (DL-01 only) reads
 * "a PRIOR COMMITTED PASS of the current Analysis Session"
 * (`ruleset.format.v1.ts` lines 140-151), which requires Analysis
 * History / the Authentication History Store. The store does not exist
 * until week 4 (`docs/How-To-Start-Coding.md`) — not a DEC-15 matter, a
 * different, already-known dependency. `matchPredicate` throws a typed
 * `PriorFindingActiveUnavailableError` rather than fabricate a
 * true/false default; `matchAllRules` isolates it per-rule so the other
 * ten rules still get a real answer.
 *
 * §5.6, "Non-Matching Is Not Suppression": "Where the evidence required by
 * a predicate is absent, the predicate simply does not match and no
 * finding is generated." Implemented uniformly here: any `ValuePath` that
 * resolves against an `unevaluable` module (or, for `sameSite`/
 * `notSameSite`, against a `null` registrable domain — DEFECT-19's own
 * finding that `notSameSite(null, null)` must NOT match, consistent with
 * that entry's conclusion that CRED-04 is structurally unable to fire)
 * makes the containing check false, not an error and not a guessed
 * default.
 */

import type { ModuleId } from '../contracts/evaluation.contract.v1';
import type {
  Predicate, ValuePath, ParameterId, RefinementSetId, RuleDefinition, RuleSet,
} from '../contracts/ruleset.format.v1';
import type { ModuleDispatchResult } from './orchestrator';

export type EvaluationSetForMatching = Readonly<Record<ModuleId, ModuleDispatchResult>>;

export class PriorFindingActiveUnavailableError extends Error {
  constructor(ruleId: string) {
    super(
      `Rule "${ruleId}"'s predicate uses priorFindingActive, which reads Analysis History ` +
      `from the Authentication History Store — the store does not exist yet ` +
      `(docs/How-To-Start-Coding.md: "the store does not exist until week 4"). Not fabricated.`,
    );
    this.name = 'PriorFindingActiveUnavailableError';
  }
}

/** Sentinel distinguishing "this module was unevaluable, nothing to read"
 * from a genuine `null` Findings value (e.g. `registrableDomain: null`,
 * which IS a real, evaluable answer, not absent evidence — §5.6 only
 * excuses genuinely absent evidence from matching, not a confirmed
 * negative finding). */
const UNEVALUABLE = Symbol('unevaluable');

function resolveFindingPath(
  path: string,
  evaluations: EvaluationSetForMatching,
): unknown {
  const dot = path.indexOf('.');
  const moduleId = path.slice(0, dot) as ModuleId;
  const field = path.slice(dot + 1);
  const dispatch = evaluations[moduleId];
  if (dispatch.result.status !== 'evaluated') return UNEVALUABLE;
  // `field` is a runtime string parsed out of a FindingPath — TS cannot
  // statically verify dynamic property access against a closed union of
  // ten differently-shaped Findings interfaces. Not an Origin cast (G-2
  // is unaffected); V-2 (validate-ruleset.py) is what actually guarantees
  // this resolves to a real field for every path in a released rule set.
  const findings = dispatch.result.findings as unknown as Record<string, unknown>;
  return findings[field];
}

function resolveItemPath(path: string, boundItem: unknown): unknown {
  if (path === '$') return boundItem;
  // '$.field'
  const field = path.slice(2);
  return (boundItem as Record<string, unknown>)[field];
}

function resolveValuePath(
  path: ValuePath,
  evaluations: EvaluationSetForMatching,
  boundItem: unknown,
): unknown {
  return path.startsWith('$') ? resolveItemPath(path, boundItem) : resolveFindingPath(path, evaluations);
}

function resolveParam(param: ParameterId, ruleSet: RuleSet): number {
  const found = ruleSet.parameters.find((p) => p.id === param);
  if (found === undefined) {
    // Defensive only — V-4 (validate-ruleset.py) already guarantees every
    // referenced ParameterId is registered; a real rule set can't reach here.
    throw new Error(`Parameter "${param}" is not registered in this rule set (V-4 should have caught this).`);
  }
  return found.value;
}

function resolveSet(set: RefinementSetId, ruleSet: RuleSet): readonly string[] {
  const found = ruleSet.refinementSets.find((s) => s.id === set);
  if (found === undefined) {
    // Defensive only — same V-4 guarantee as resolveParam.
    throw new Error(`Refinement set "${set}" is not registered in this rule set (V-4 should have caught this).`);
  }
  return found.members;
}

/**
 * Evaluates one `Predicate` node. `boundItem` is only meaningful inside an
 * `exists.where` subtree (§ItemPath); `undefined` everywhere else, matching
 * `ItemPath`'s own contract note that it's "Valid ONLY inside an
 * `exists.where` subtree."
 */
export function matchPredicate(
  predicate: Predicate,
  evaluations: EvaluationSetForMatching,
  ruleSet: RuleSet,
  ruleId: string,
  boundItem: unknown = undefined,
): boolean {
  switch (predicate.op) {
    case 'is': {
      const value = resolveValuePath(predicate.path, evaluations, boundItem);
      return value === true;
    }
    case 'not':
      return !matchPredicate(predicate.operand, evaluations, ruleSet, ruleId, boundItem);
    case 'and':
      return predicate.operands.every((op) => matchPredicate(op, evaluations, ruleSet, ruleId, boundItem));
    case 'or':
      return predicate.operands.some((op) => matchPredicate(op, evaluations, ruleSet, ruleId, boundItem));
    case 'gte':
    case 'lte':
    case 'gt':
    case 'lt': {
      const value = resolveValuePath(predicate.path, evaluations, boundItem);
      if (typeof value !== 'number') return false;
      const paramValue = resolveParam(predicate.param, ruleSet);
      if (predicate.op === 'gte') return value >= paramValue;
      if (predicate.op === 'lte') return value <= paramValue;
      if (predicate.op === 'gt') return value > paramValue;
      return value < paramValue;
    }
    case 'eq':
    case 'neq': {
      const value = resolveValuePath(predicate.path, evaluations, boundItem);
      if (value === UNEVALUABLE) return false;
      return predicate.op === 'eq' ? value === predicate.value : value !== predicate.value;
    }
    case 'sameSite':
    case 'notSameSite': {
      const left = resolveValuePath(predicate.left, evaluations, boundItem);
      const right = resolveValuePath(predicate.right, evaluations, boundItem);
      // Both sides must be known, non-null strings — R-01 compares two
      // registrable domains, and "unknown compared to unknown" answers
      // neither "same" nor "not same" honestly. See the header comment
      // and DEFECT-19 for why notSameSite(null, null) is NOT a match.
      if (typeof left !== 'string' || typeof right !== 'string') return false;
      return predicate.op === 'sameSite' ? left === right : left !== right;
    }
    case 'inSet': {
      const value = resolveValuePath(predicate.path, evaluations, boundItem);
      if (typeof value !== 'string') return false;
      return resolveSet(predicate.set, ruleSet).includes(value);
    }
    case 'exists': {
      const collection = resolveFindingPath(predicate.collection, evaluations);
      if (!Array.isArray(collection)) return false;
      return collection.some((item) => matchPredicate(predicate.where, evaluations, ruleSet, ruleId, item));
    }
    case 'priorFindingActive':
      throw new PriorFindingActiveUnavailableError(ruleId);
  }
}

export function matchRule(rule: RuleDefinition, evaluations: EvaluationSetForMatching, ruleSet: RuleSet): boolean {
  return matchPredicate(rule.predicate, evaluations, ruleSet, rule.id);
}

export type RuleMatchResult =
  | { readonly ruleId: string; readonly status: 'matched' | 'unmatched' }
  | { readonly ruleId: string; readonly status: 'blocked'; readonly reason: string };

/**
 * Evaluates every rule in the rule set against one evaluation set.
 * `priorFindingActive` is isolated per-rule (currently only DL-01) so one
 * genuinely-blocked rule doesn't prevent an answer for the other ten.
 */
export function matchAllRules(evaluations: EvaluationSetForMatching, ruleSet: RuleSet): readonly RuleMatchResult[] {
  return ruleSet.rules.map((rule) => {
    try {
      return { ruleId: rule.id, status: matchRule(rule, evaluations, ruleSet) ? 'matched' : 'unmatched' } as const;
    } catch (err) {
      if (err instanceof PriorFindingActiveUnavailableError) {
        return { ruleId: rule.id, status: 'blocked', reason: err.message } as const;
      }
      throw err;
    }
  });
}
