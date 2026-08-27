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

import type { ModuleId, UnevaluableReason } from '../contracts/evaluation.contract.v1';
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
 * Three-state predicate result. `unevaluable` is NOT a synonym for
 * `noMatch` — it is "this check read a module that produced no findings, so
 * no honest true/false answer exists." Keeping the two apart is what makes
 * §5.6 survive negation: see DEFECT-22.
 *
 * A genuine `null` Findings value (e.g. `registrableDomain: null`,
 * `requestedPermission: null`) is a real, positive answer and yields
 * `noMatch`, never `unevaluable` — only the UNEVALUABLE sentinel, i.e. an
 * unevaluable MODULE, produces `unevaluable`.
 */
export type PredicateResult = 'match' | 'noMatch' | 'unevaluable';

/**
 * Evaluates one `Predicate` node to a three-state result. `boundItem` is
 * only meaningful inside an `exists.where` subtree (§ItemPath); `undefined`
 * everywhere else, matching `ItemPath`'s own contract note that it's "Valid
 * ONLY inside an `exists.where` subtree."
 *
 * OPERAND EVALUATION ORDER IS PRESERVED EXACTLY as the previous
 * `Array.every`/`Array.some` implementation: `and` stops at the first
 * operand that is not `match`, `or` stops at the first operand that IS
 * `match`. This matters beyond style — `priorFindingActive` throws, so
 * evaluating an operand the old code short-circuited past would turn a
 * currently-`unmatched` rule (DL-01 on every present fixture, whose first
 * conjunct reads the unevaluable `downloadContext` module) into a thrown
 * `PriorFindingActiveUnavailableError`. Fixing DEFECT-22 must not silently
 * change which rules reach the store dependency.
 */
export function evaluatePredicate(
  predicate: Predicate,
  evaluations: EvaluationSetForMatching,
  ruleSet: RuleSet,
  ruleId: string,
  boundItem: unknown = undefined,
): PredicateResult {
  switch (predicate.op) {
    case 'is': {
      const value = resolveValuePath(predicate.path, evaluations, boundItem);
      if (value === UNEVALUABLE) return 'unevaluable';
      return value === true ? 'match' : 'noMatch';
    }
    case 'not': {
      // THE DEFECT-22 FIX. Negating an unevaluable operand yields
      // unevaluable, never a match: "we could not look" does not become
      // "we looked and found the opposite." Previously this was
      // `!matchPredicate(...)`, where `is` had already collapsed
      // UNEVALUABLE to `false` and `!false` fabricated a match.
      const inner = evaluatePredicate(predicate.operand, evaluations, ruleSet, ruleId, boundItem);
      if (inner === 'unevaluable') return 'unevaluable';
      return inner === 'match' ? 'noMatch' : 'match';
    }
    case 'and': {
      // Mirrors Array.every: stop at the first non-`match` operand.
      for (const operand of predicate.operands) {
        const result = evaluatePredicate(operand, evaluations, ruleSet, ruleId, boundItem);
        if (result !== 'match') return result;
      }
      return 'match';
    }
    case 'or': {
      // Mirrors Array.some: stop at the first `match`. If none matched, the
      // disjunction is only honestly `noMatch` when every operand was a
      // real `noMatch` — one unevaluable operand leaves the whole `or`
      // unevaluable, since that operand might have matched had it been
      // readable.
      let sawUnevaluable = false;
      for (const operand of predicate.operands) {
        const result = evaluatePredicate(operand, evaluations, ruleSet, ruleId, boundItem);
        if (result === 'match') return 'match';
        if (result === 'unevaluable') sawUnevaluable = true;
      }
      return sawUnevaluable ? 'unevaluable' : 'noMatch';
    }
    case 'gte':
    case 'lte':
    case 'gt':
    case 'lt': {
      const value = resolveValuePath(predicate.path, evaluations, boundItem);
      if (value === UNEVALUABLE) return 'unevaluable';
      if (typeof value !== 'number') return 'noMatch';
      const paramValue = resolveParam(predicate.param, ruleSet);
      if (predicate.op === 'gte') return value >= paramValue ? 'match' : 'noMatch';
      if (predicate.op === 'lte') return value <= paramValue ? 'match' : 'noMatch';
      if (predicate.op === 'gt') return value > paramValue ? 'match' : 'noMatch';
      return value < paramValue ? 'match' : 'noMatch';
    }
    case 'eq':
    case 'neq': {
      const value = resolveValuePath(predicate.path, evaluations, boundItem);
      if (value === UNEVALUABLE) return 'unevaluable';
      const equal = value === predicate.value;
      return (predicate.op === 'eq' ? equal : !equal) ? 'match' : 'noMatch';
    }
    case 'sameSite':
    case 'notSameSite': {
      const left = resolveValuePath(predicate.left, evaluations, boundItem);
      const right = resolveValuePath(predicate.right, evaluations, boundItem);
      // An unevaluable MODULE on either side leaves the comparison
      // unevaluable. A genuine `null` domain is different: that is a real
      // finding, and DEFECT-19 already settled that notSameSite(null, null)
      // is a `noMatch`, not a match — preserved exactly.
      if (left === UNEVALUABLE || right === UNEVALUABLE) return 'unevaluable';
      if (typeof left !== 'string' || typeof right !== 'string') return 'noMatch';
      const same = left === right;
      return (predicate.op === 'sameSite' ? same : !same) ? 'match' : 'noMatch';
    }
    case 'inSet': {
      const value = resolveValuePath(predicate.path, evaluations, boundItem);
      if (value === UNEVALUABLE) return 'unevaluable';
      if (typeof value !== 'string') return 'noMatch';
      return resolveSet(predicate.set, ruleSet).includes(value) ? 'match' : 'noMatch';
    }
    case 'exists': {
      const collection = resolveFindingPath(predicate.collection, evaluations);
      if (collection === UNEVALUABLE) return 'unevaluable';
      if (!Array.isArray(collection)) return 'noMatch';
      let sawUnevaluable = false;
      for (const item of collection) {
        const result = evaluatePredicate(predicate.where, evaluations, ruleSet, ruleId, item);
        if (result === 'match') return 'match';
        if (result === 'unevaluable') sawUnevaluable = true;
      }
      return sawUnevaluable ? 'unevaluable' : 'noMatch';
    }
    case 'priorFindingActive':
      throw new PriorFindingActiveUnavailableError(ruleId);
  }
}

/**
 * Boolean view of `evaluatePredicate` — "did this predicate MATCH?"
 * `unevaluable` is not a match (§5.6), so it collapses to `false` here.
 *
 * The collapse happens ONLY at this outermost boundary, never inside the
 * recursion — that is precisely the DEFECT-22 fix. Callers that need the
 * three-state answer (a future DEFECT-21 fix building `RuleOutcome`'s
 * `unevaluable` variant) should call `evaluatePredicate` directly.
 */
export function matchPredicate(
  predicate: Predicate,
  evaluations: EvaluationSetForMatching,
  ruleSet: RuleSet,
  ruleId: string,
  boundItem: unknown = undefined,
): boolean {
  return evaluatePredicate(predicate, evaluations, ruleSet, ruleId, boundItem) === 'match';
}

export function matchRule(rule: RuleDefinition, evaluations: EvaluationSetForMatching, ruleSet: RuleSet): boolean {
  return matchPredicate(rule.predicate, evaluations, ruleSet, rule.id);
}

/**
 * One rule's Stage 2 outcome.
 *
 * `unevaluable` is a FIRST-CLASS outcome, distinct from `unmatched` —
 * required by `evaluation.contract.v1.ts`'s invariant **E-6**: "`unevaluable`
 * is a produced evaluation, not a missing one. **Stage 2 MUST distinguish it
 * from evaluated-with-negative-findings**", and by §15.2
 * (`ruleset.format.v1.ts:176-183`): "if ANY required module is `unevaluable`
 * for this pass, the rule outcome is `unevaluable` — NOT a non-match. A rule
 * that could not be tested MUST NOT be recorded as a rule that found
 * nothing."
 *
 * Shaped to feed `passresult.contract.v1.ts`'s `RuleOutcome` directly: its
 * `unevaluable` variant carries exactly `reason` + `unevaluableModules`.
 * `matched`/`unmatched` map to `RuleOutcome`'s `matched`/`notMatched`.
 *
 * `blocked` is retained as a separate status, NOT folded into `unevaluable`:
 * it means the predicate reached `priorFindingActive`, which needs Analysis
 * History from a store that does not exist yet. That is a missing
 * DEPENDENCY, not an unevaluable module, and collapsing the two would lose
 * the distinction the error message carries.
 */
export type RuleMatchResult =
  | { readonly ruleId: string; readonly status: 'matched' | 'unmatched' }
  | {
      readonly ruleId: string;
      readonly status: 'unevaluable';
      readonly reason: UnevaluableReason | 'undeclared_required_module';
      /** Which of the rule's `requiredModules` were unevaluable (§15.2). */
      readonly unevaluableModules: readonly ModuleId[];
    }
  | { readonly ruleId: string; readonly status: 'blocked'; readonly reason: string };

/**
 * The `requiredModules` pre-check §15.2 mandates: which of this rule's
 * declared required modules did not produce findings this pass.
 */
function unevaluableRequiredModules(
  rule: RuleDefinition,
  evaluations: EvaluationSetForMatching,
): readonly ModuleId[] {
  return rule.requiredModules.filter((moduleId) => evaluations[moduleId].result.status !== 'evaluated');
}

/**
 * Evaluates every rule in the rule set against one evaluation set.
 *
 * Order matters and is specified, not incidental — §15.2 requires the
 * `requiredModules` check BEFORE predicate evaluation, so a rule that could
 * not be tested is never reported as one that found nothing, regardless of
 * how its predicate would have short-circuited.
 *
 * `priorFindingActive` is isolated per-rule (currently only DL-01) so one
 * genuinely-blocked rule doesn't prevent an answer for the other ten.
 */
export function matchAllRules(evaluations: EvaluationSetForMatching, ruleSet: RuleSet): readonly RuleMatchResult[] {
  return ruleSet.rules.map((rule): RuleMatchResult => {
    // §15.2 pre-check, before the predicate is touched.
    const blockedModules = unevaluableRequiredModules(rule, evaluations);
    if (blockedModules.length > 0) {
      // Report the FIRST required module's own reason rather than inventing
      // a rule-level one — it is the genuine, module-supplied cause, and
      // `RuleOutcome.reason` is typed `UnevaluableReason`, the same union.
      const first = evaluations[blockedModules[0]!].result;
      return {
        ruleId: rule.id,
        status: 'unevaluable',
        reason: first.status === 'unevaluable' ? first.reason : 'module_error',
        unevaluableModules: blockedModules,
      };
    }

    try {
      const result = evaluatePredicate(rule.predicate, evaluations, ruleSet, rule.id);
      if (result === 'match') return { ruleId: rule.id, status: 'matched' };
      if (result === 'noMatch') return { ruleId: rule.id, status: 'unmatched' };
      // Every declared required module WAS evaluable, yet the predicate still
      // read an unevaluable one — the rule's `requiredModules` under-declares
      // what its predicate actually reads (DEFECT-16's shape). Reported
      // honestly as unevaluable with an empty module list rather than
      // silently downgraded to `unmatched`, which is the exact conflation
      // E-6 forbids.
      return {
        ruleId: rule.id,
        status: 'unevaluable',
        reason: 'undeclared_required_module',
        unevaluableModules: [],
      };
    } catch (err) {
      if (err instanceof PriorFindingActiveUnavailableError) {
        return { ruleId: rule.id, status: 'blocked', reason: err.message };
      }
      throw err;
    }
  });
}
