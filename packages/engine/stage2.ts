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
  const dispatch = evaluations[moduleId];
  if (dispatch.result.status !== 'evaluated') return UNEVALUABLE;
  // Walk the remaining dotted segments. A FindingPath is `${ModuleId}.${string}`
  // and that tail MAY be nested: CRED-02's `authContext.bestCrossOriginMatch.
  // similarity` / `.registrableDomain` reach into the one nested Findings object
  // (AuthContextFindings.bestCrossOriginMatch), which validate-ruleset.py V-2
  // whitelists explicitly. Splitting only on the FIRST dot and indexing
  // findings['bestCrossOriginMatch.similarity'] returned undefined — so CRED-02
  // could not fire once authContext became evaluable (DEFECT-37; it was masked
  // while authContext was always unevaluable). Field names never contain dots,
  // so segment-walking is exact. A null/undefined intermediate returns as-is: a
  // genuine null (e.g. bestCrossOriginMatch === null) makes `.similarity` a real
  // noMatch, never an unevaluable module — the UNEVALUABLE sentinel is reserved
  // for an unevaluable module above. TS cannot statically verify dynamic access
  // against ten Findings shapes; V-2 guarantees every released path is real.
  let cursor: unknown = dispatch.result.findings;
  for (const segment of path.slice(dot + 1).split('.')) {
    if (cursor === null || cursor === undefined) return cursor;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
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
export type PredicateResult = 'match' | 'noMatch' | 'unevaluable' | 'nullOperand';

// DEC-42 / Option B: a leaf whose finding PATH resolves to a finding-level
// `null` (the module EVALUATED and produced null) yields `nullOperand`, a
// LEAF-SCOPED state DISTINCT from the whole-module `UNEVALUABLE` symbol.
//   - not(nullOperand) -> nullOperand (never flips to match — requirement 3).
//   - it PROPAGATES through and/or/exists exactly like unevaluable already does,
//     so it reaches an enclosing not() intact (never laundered into a plain
//     noMatch a later not() could flip). Non-poisoning is preserved because a
//     real `match` sibling still wins (checked first). Priority when nothing
//     matched: unevaluable > nullOperand > noMatch.
//   - it NEVER populates RuleMatchResult.unevaluableModules (req 2): a null
//     field on an evaluated module is not an unevaluable module. At a rule root
//     it collapses to `unmatched`, empty module list.
// Why narrower blast radius than `unevaluable`: an unevaluable MODULE is "we
// could not look at all", which must poison and/or (the missing operand might
// have changed the result). A null FIELD is "we looked, the module ran, the
// value is null" — a strictly narrower fact that must not carry the same
// combinator blast radius, so it collapses to noMatch inside and/or and only
// resists the one operation that would misread it: negation.
const NULL_OPERAND: PredicateResult = 'nullOperand';

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
      if (value === null) return NULL_OPERAND;   // DEC-42
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
      if (inner === NULL_OPERAND) return NULL_OPERAND;   // DEC-42 req 3: null cannot be flipped to a match
      return inner === 'match' ? 'noMatch' : 'match';
    }
    case 'and': {
      // Mirrors Array.every: stop at the first non-`match` operand and return
      // it as-is. DEC-42 (corrected): nullOperand PROPAGATES exactly like
      // unevaluable already does — the `and` still doesn't match, but a
      // nullOperand reaches an enclosing not() intact rather than being
      // laundered into a plain noMatch that a subsequent not() could flip.
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
      let sawNullOperand = false;
      for (const operand of predicate.operands) {
        const result = evaluatePredicate(operand, evaluations, ruleSet, ruleId, boundItem);
        if (result === 'match') return 'match';   // a real match always wins (non-poisoning, req 4a)
        if (result === 'unevaluable') sawUnevaluable = true;
        else if (result === NULL_OPERAND) sawNullOperand = true;
      }
      // DEC-42 priority: unevaluable > nullOperand > noMatch. An unevaluable
      // operand MIGHT have matched had the module been readable, so it
      // dominates a merely-null one; a null operand in turn dominates a plain
      // noMatch so the null survives to any enclosing not().
      return sawUnevaluable ? 'unevaluable' : sawNullOperand ? NULL_OPERAND : 'noMatch';
    }
    case 'gte':
    case 'lte':
    case 'gt':
    case 'lt': {
      const value = resolveValuePath(predicate.path, evaluations, boundItem);
      if (value === UNEVALUABLE) return 'unevaluable';
      if (value === null) return NULL_OPERAND;   // DEC-42 (never coerced to 0)
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
      // DEC-42: a null finding value is nullOperand — UNLESS the predicate is an
      // EXPLICIT null comparison (eq/neq x, null), which legitimately tests
      // known-ness and must compute normally.
      if (value === null && predicate.value !== null) return NULL_OPERAND;
      const equal = value === predicate.value;
      return (predicate.op === 'eq' ? equal : !equal) ? 'match' : 'noMatch';
    }
    case 'sameSite':
    case 'notSameSite': {
      const left = resolveValuePath(predicate.left, evaluations, boundItem);
      const right = resolveValuePath(predicate.right, evaluations, boundItem);
      // An unevaluable MODULE on either side leaves the comparison
      // unevaluable. A genuine `null` domain is different: DEFECT-19 settled
      // that notSameSite(null, null) is `noMatch`, not a match — preserved.
      // DEC-42 SCOPE: sameSite/notSameSite are deliberately OUTSIDE the
      // nullOperand mechanism. They are two-domain comparisons, never appear
      // under a `not` in any rule (notSameSite IS the negated form), and their
      // null semantics were settled by DEFECT-19 as noMatch. A null domain here
      // stays noMatch, which is behaviourally identical inside the `and`s that
      // use them (nullOperand also collapses to noMatch there) — so nothing is
      // gained by routing them through nullOperand, and DEFECT-19's settled
      // characterisation is left untouched.
      if (left === UNEVALUABLE || right === UNEVALUABLE) return 'unevaluable';
      if (typeof left !== 'string' || typeof right !== 'string') return 'noMatch';
      const same = left === right;
      return (predicate.op === 'sameSite' ? same : !same) ? 'match' : 'noMatch';
    }
    case 'inSet': {
      const value = resolveValuePath(predicate.path, evaluations, boundItem);
      if (value === UNEVALUABLE) return 'unevaluable';
      if (value === null) return NULL_OPERAND;   // DEC-42
      if (typeof value !== 'string') return 'noMatch';
      return resolveSet(predicate.set, ruleSet).includes(value) ? 'match' : 'noMatch';
    }
    case 'exists': {
      const collection = resolveFindingPath(predicate.collection, evaluations);
      if (collection === UNEVALUABLE) return 'unevaluable';
      if (!Array.isArray(collection)) return 'noMatch';
      let sawUnevaluable = false;
      let sawNullOperand = false;
      for (const item of collection) {
        const result = evaluatePredicate(predicate.where, evaluations, ruleSet, ruleId, item);
        if (result === 'match') return 'match';
        if (result === 'unevaluable') sawUnevaluable = true;
        else if (result === NULL_OPERAND) sawNullOperand = true;
      }
      // DEC-42 priority: unevaluable > nullOperand > noMatch (same as `or`).
      return sawUnevaluable ? 'unevaluable' : sawNullOperand ? NULL_OPERAND : 'noMatch';
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
      // DEC-42 req 2: a nullOperand at the root is a non-firing rule, NOT an
      // unevaluable one — the module evaluated and produced null. It maps to
      // `unmatched` with NO entry in unevaluableModules, exactly like noMatch.
      if (result === 'noMatch' || result === NULL_OPERAND) return { ruleId: rule.id, status: 'unmatched' };
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
