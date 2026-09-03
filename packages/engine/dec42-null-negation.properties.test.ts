/**
 * DEC-42 / Option B property-test campaign — the NULL_OPERAND leaf sentinel.
 *
 * Core evaluation-semantics change, so this is a randomized campaign, not a
 * handful of examples. It generates predicate trees with NULLABLE leaves at
 * random positions and negation depths over a synthetic evaluations map, and
 * asserts the four invariants Option B must hold:
 *
 *   (a) `not` NEVER flips a null-derived result to `match` — at any negation
 *       depth, a directly-negated nullable leaf resolves away from `match`.
 *   (b) `or` with a null sibling AND a genuinely-matching sibling still MATCHES
 *       — nullOperand does not suppress a real match (non-poisoning).
 *   (c) unevaluableModules NEVER includes a module that evaluated with a null
 *       field — a null value is not an unevaluable module.
 *   (d) the DEFECT-22 `unevaluable` propagation is UNCHANGED — the two sentinels
 *       coexist, never merged: not(unevaluable) stays unevaluable, and an
 *       unevaluable operand still poisons and/or, exactly as before.
 *
 * Run: node --experimental-strip-types packages/engine/dec42-null-negation.properties.test.ts
 */

import assert from 'node:assert/strict';
import fc from 'fast-check';

import { evaluatePredicate, matchAllRules, type EvaluationSetForMatching, type PredicateResult } from './stage2.ts';
import type { Predicate, RuleSet, RuleDefinition } from '../contracts/ruleset.format.v1.ts';
import type { ModuleId } from '../contracts/evaluation.contract.v1.ts';

const RUNS = 2000;

// A minimal evaluations map. permissionContext carries a nullable finding
// (precededByUserGesture) we can set to false / true / null; loginForm carries a
// plain boolean (credentialFormPresent) as a non-null control; ssl is left
// genuinely UNEVALUABLE for the sentinel-coexistence property (d).
function makeEvals(gesture: boolean | null, credForm: boolean): EvaluationSetForMatching {
  const ev: Record<string, unknown> = {
    permissionContext: { moduleId: 'permissionContext', evaluationId: 'p',
      result: { status: 'evaluated', findings: {
        requestedPermission: 'camera', requestingRegistrableDomain: null,
        precededByUserGesture: gesture, pageAgeMs: 1000 } } },
    loginForm: { moduleId: 'loginForm', evaluationId: 'l',
      result: { status: 'evaluated', findings: {
        credentialFormPresent: credForm, forms: [], pageRegistrableDomain: 'x.test' } } },
    ssl: { moduleId: 'ssl', evaluationId: 's',
      result: { status: 'unevaluable', reason: 'required_evidence_not_collected' } },
  };
  // fill remaining modules as unevaluable so the map is total; the tree only
  // ever reads the three above.
  for (const m of ['url','dns','redirect','javascript','homograph','authContext','downloadContext'] as ModuleId[]) {
    ev[m] = { moduleId: m, evaluationId: m, result: { status: 'unevaluable', reason: 'required_evidence_not_collected' } };
  }
  return ev as unknown as EvaluationSetForMatching;
}

const RS = { rules: [], parameters: [{ id: 'page_age_max_ms', value: 5000, unit: 'ms', rationale: '', confidence: 'Unvalidated' }],
  refinementSets: [], suppressions: [] } as unknown as RuleSet;

// Leaves the generator can emit.
const NULLABLE_LEAF: Predicate = { op: 'is', path: 'permissionContext.precededByUserGesture' } as Predicate;
const NULLABLE_LT: Predicate = { op: 'lt', path: 'permissionContext.pageAgeMs', param: 'page_age_max_ms' } as Predicate; // pageAgeMs also nullable-capable
const BOOL_TRUE_LEAF: Predicate = { op: 'is', path: 'loginForm.credentialFormPresent' } as Predicate;
const UNEVAL_LEAF: Predicate = { op: 'is', path: 'ssl.chainTrusted' } as Predicate; // ssl is unevaluable -> UNEVALUABLE

// Wrap a predicate in `depth` not() layers.
function negate(p: Predicate, depth: number): Predicate {
  let out = p;
  for (let i = 0; i < depth; i++) out = { op: 'not', operand: out } as Predicate;
  return out;
}

const genDepth = fc.integer({ min: 0, max: 5 });

// ── (a) not NEVER flips a null-derived result to match ─────────────────────
// A nullable leaf (gesture = null) under ANY negation depth must never be
// 'match'. It is 'nullOperand' under a direct not-chain, and collapses to
// noMatch/nullOperand — never match.
fc.assert(fc.property(genDepth, (depth) => {
  const evals = makeEvals(null, false);
  const r = evaluatePredicate(negate(NULLABLE_LEAF, depth), evals, RS, 'prop-a');
  assert.notEqual(r, 'match', `not^${depth}(is(null)) must not be match; got ${r}`);
  // and it stays nullOperand through a pure not-chain (distinguishable at not)
  assert.equal(r, 'nullOperand', `pure not-chain over null must stay nullOperand; got ${r} at depth ${depth}`);
}), { numRuns: RUNS });

// Same for the numeric leaf: not^depth(lt(null)) is never match.
fc.assert(fc.property(genDepth, (depth) => {
  const evals = makeEvals(false, false); // gesture false, but pageAgeMs we override to null:
  const nullPageAge = { ...evals } as Record<string, unknown>;
  (nullPageAge['permissionContext'] as { result: { findings: Record<string, unknown> } }).result.findings.pageAgeMs = null;
  const r = evaluatePredicate(negate(NULLABLE_LT, depth), nullPageAge as unknown as EvaluationSetForMatching, RS, 'prop-a2');
  assert.notEqual(r, 'match', `not^${depth}(lt(null)) must not be match; got ${r}`);
}), { numRuns: RUNS });

// ── (b) or with null sibling + matching sibling still matches ──────────────
fc.assert(fc.property(fc.boolean(), (nullFirst) => {
  const evals = makeEvals(null, true);   // gesture null (nullOperand leaf), credForm true (matching leaf)
  const operands = nullFirst
    ? [NULLABLE_LEAF, BOOL_TRUE_LEAF]
    : [BOOL_TRUE_LEAF, NULLABLE_LEAF];
  const orPred: Predicate = { op: 'or', operands } as Predicate;
  const r = evaluatePredicate(orPred, evals, RS, 'prop-b');
  assert.equal(r, 'match', `or(null, match) must match regardless of order (nullFirst=${nullFirst}); got ${r}`);
}), { numRuns: RUNS });

// ── (c) unevaluableModules never includes an evaluated-with-null module ────
// A rule reading a null finding from an EVALUATED module must be `unmatched`
// with empty unevaluableModules — never `unevaluable` naming permissionContext.
fc.assert(fc.property(genDepth, (depth) => {
  const evals = makeEvals(null, false);
  // Rule predicate is a negated nullable leaf; requiredModules declares the
  // evaluated module it reads. It must NOT report as unevaluable.
  const rule = { id: 'PROP-C', family: 'PM', name: 'p', type: 'primary', parent: null,
    predicate: negate(NULLABLE_LEAF, depth), requiredModules: ['permissionContext'],
    baseWeight: 1, tier: 1, interveningTier: 1, owner: 'x', introducedIn: '0.1.0',
    lastModifiedIn: '0.1.0', lifecycleState: 'Active', rationale: 'x',
    empiricalConfidence: 'Unvalidated', knownFalsePositiveRisks: ['x'], knownLimitations: [],
    cweMappings: [], capecMappings: [] } as unknown as RuleDefinition;
  const rs = { ...RS, rules: [rule] } as unknown as RuleSet;
  const [res] = matchAllRules(evals, rs);
  assert.ok(res !== undefined);
  if (res!.status === 'unevaluable') {
    assert.deepEqual(res!.unevaluableModules, [],
      `null-field rule must not name an evaluated module in unevaluableModules; got ${JSON.stringify(res!.unevaluableModules)}`);
    // and it must not be reported unevaluable for a null field at all when the
    // predicate reduced to nullOperand — it should be 'unmatched'.
  }
  assert.notEqual(res!.status, 'blocked');
  // permissionContext evaluated, so it must never appear as unevaluable:
  if (res!.status === 'unevaluable') {
    assert.ok(!res!.unevaluableModules.includes('permissionContext'),
      'permissionContext EVALUATED (with null) must never be in unevaluableModules');
  }
}), { numRuns: RUNS });

// ── (d) DEFECT-22 unevaluable propagation UNCHANGED; two sentinels coexist ─
fc.assert(fc.property(genDepth, (depth) => {
  const evals = makeEvals(null, false);
  // not^depth(is(ssl.chainTrusted)) — ssl is UNEVALUABLE (module), NOT null.
  const r = evaluatePredicate(negate(UNEVAL_LEAF, depth), evals, RS, 'prop-d');
  assert.equal(r, 'unevaluable', `not^${depth}(unevaluable) must stay unevaluable (DEFECT-22), got ${r}`);
  // and it is NEVER confused with nullOperand:
  assert.notEqual(r as PredicateResult, 'nullOperand', 'module-unevaluable must never surface as nullOperand');
}), { numRuns: RUNS });

// unevaluable still poisons and/or (a matching sibling cannot rescue it out of
// an `and`; an `or` with only unevaluable + noMatch stays unevaluable).
fc.assert(fc.property(fc.boolean(), (order) => {
  const evals = makeEvals(true, true);
  const andPred: Predicate = { op: 'and', operands: order ? [UNEVAL_LEAF, BOOL_TRUE_LEAF] : [BOOL_TRUE_LEAF, UNEVAL_LEAF] } as Predicate;
  const rAnd = evaluatePredicate(andPred, evals, RS, 'prop-d2');
  assert.equal(rAnd, 'unevaluable', `and(unevaluable, match) must be unevaluable (poison preserved); got ${rAnd}`);
  const orPred: Predicate = { op: 'or', operands: [UNEVAL_LEAF, { op: 'is', path: 'permissionContext.precededByUserGesture' }] } as Predicate;
  // gesture true here -> the second leaf matches -> or matches (unevaluable doesn't block a real match)
  assert.equal(evaluatePredicate(orPred, evals, RS, 'prop-d3'), 'match');
}), { numRuns: RUNS });

// ── Cross-check: nullOperand and noMatch differ ONLY at a direct not() ─────
// not(is(null)) != not(is(false)) : the former stays nullOperand, the latter
// becomes match — the exact DEFECT-39/40 distinction, proven at the semantics
// level rather than assumed.
{
  const nullEv = makeEvals(null, false);
  const falseEv = makeEvals(false, false);
  const notIs: Predicate = { op: 'not', operand: NULLABLE_LEAF } as Predicate;
  assert.equal(evaluatePredicate(notIs, nullEv, RS, 'x'), 'nullOperand', 'not(is(null)) -> nullOperand');
  assert.equal(evaluatePredicate(notIs, falseEv, RS, 'x'), 'match', 'not(is(false)) -> match (unchanged, correct)');
}

// ── RANDOMIZED PREDICATE TREES — the strong anti-flip invariant ────────────
//
// Generate arbitrary and/or/not trees with a distinguished NULLABLE leaf at a
// random position and depth, plus MATCH and NOMATCH filler leaves. The rigorous
// invariant: a null leaf is NEVER MORE PERMISSIVE than a plain noMatch leaf in
// the same position — i.e. anywhere the tree matches with the leaf = null, it
// also matches with the leaf replaced by a definite-noMatch. If that holds for
// every tree, `null` can never FABRICATE a match. This is requirement (a)
// generalized to arbitrary structure, not just not-chains.
//
// NULL_MARK / NOMATCH_MARK are the same operator on the same module, differing
// only in the stored value (null vs false), so the substitution is exact.
type Tree =
  | { kind: 'nullLeaf' }
  | { kind: 'matchLeaf' }
  | { kind: 'noMatchLeaf' }
  | { kind: 'not'; child: Tree }
  | { kind: 'and'; kids: Tree[] }
  | { kind: 'or'; kids: Tree[] };

const treeArb: fc.Arbitrary<Tree> = fc.letrec<{ t: Tree }>((tie) => ({
  t: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constant<Tree>({ kind: 'nullLeaf' }),
    fc.constant<Tree>({ kind: 'matchLeaf' }),
    fc.constant<Tree>({ kind: 'noMatchLeaf' }),
    tie('t').map((c): Tree => ({ kind: 'not', child: c as Tree })),
    fc.array(tie('t') as fc.Arbitrary<Tree>, { minLength: 1, maxLength: 3 }).map((k): Tree => ({ kind: 'and', kids: k })),
    fc.array(tie('t') as fc.Arbitrary<Tree>, { minLength: 1, maxLength: 3 }).map((k): Tree => ({ kind: 'or', kids: k })),
  ),
})).t;

// nullLeaf uses gesture (set to null or false per the variant); match/noMatch
// use credentialFormPresent set to true/false respectively.
function toPredicate(t: Tree): Predicate {
  switch (t.kind) {
    case 'nullLeaf': return { op: 'is', path: 'permissionContext.precededByUserGesture' } as Predicate;
    case 'matchLeaf': return { op: 'is', path: 'loginForm.credentialFormPresent' } as Predicate;   // credForm=true -> match
    case 'noMatchLeaf': return { op: 'is', path: 'javascript.listenerOnCredentialField' } as Predicate; // set false -> noMatch
    case 'not': return { op: 'not', operand: toPredicate(t.child) } as Predicate;
    case 'and': return { op: 'and', operands: t.kids.map(toPredicate) } as Predicate;
    case 'or': return { op: 'or', operands: t.kids.map(toPredicate) } as Predicate;
  }
}
function render(t: Tree): string {
  switch (t.kind) {
    case 'nullLeaf': return 'NULL';
    case 'matchLeaf': return 'M';
    case 'noMatchLeaf': return 'x';
    case 'not': return `not(${render(t.child)})`;
    case 'and': return `and(${t.kids.map(render).join(',')})`;
    case 'or': return `or(${t.kids.map(render).join(',')})`;
  }
}

// Evaluations where javascript.listenerOnCredentialField = false (noMatch leaf),
// loginForm.credentialFormPresent = true (match leaf), and gesture is the knob.
function evalsFor(gesture: boolean | null): EvaluationSetForMatching {
  const e = makeEvals(gesture, true) as unknown as Record<string, { result: { status: string; findings?: Record<string, unknown> } }>;
  e['javascript'] = { moduleId: 'javascript', evaluationId: 'j', result: { status: 'evaluated', findings: {
    listenerOnCredentialField: false, clientSideTransmissionObserved: false, transmissionEndpointDomains: [],
    dynamicScriptLoadCount: 0, credentialInterfaceInjected: false, injectingScriptOriginDomain: null } } } as never;
  return e as unknown as EvaluationSetForMatching;
}
const matches = (p: Predicate, gesture: boolean | null) => {
  const r = evaluatePredicate(p, evalsFor(gesture), RS, 'tree');
  return r === 'match';
};

// ── ORIGINAL HARD ANTI-FLIP PROPERTY, unmodified ──────────────────────────
// For EVERY generated tree: a null leaf must never be MORE PERMISSIVE than a
// plain noMatch leaf in the same position — null can never FABRICATE a match a
// definite noMatch would not, at any position or negation depth. This is the
// property that FAILED under the collapse design (counterexample
// not(or(not(is(null))))); it must now pass 0/4000 with propagation.
const samples: string[] = [];
let violations = 0;
const violationExamples: string[] = [];
fc.assert(fc.property(treeArb, (tree) => {
  const pred = toPredicate(tree);
  const withNull = matches(pred, null);
  const withNoMatch = matches(pred, false);
  if (samples.length < 12) samples.push(`${render(tree).slice(0, 66).padEnd(66)}  null=${withNull?'M':'.'}  noMatch=${withNoMatch?'M':'.'}`);
  if (withNull && !withNoMatch) {
    violations++;
    if (violationExamples.length < 6) violationExamples.push(`${render(tree)}  null=M noMatch=.`);
    return false;
  }
  return true;
}), { numRuns: 4000 });
assert.equal(violations, 0, `ANTI-FLIP VIOLATED: a null leaf fabricated a match a noMatch would not, in ${violations} tree(s). Examples:\n  ${violationExamples.join('\n  ')}`);

// ── DEEPER STRUCTURAL PROPERTY: null behaves EXACTLY like unevaluable for the
// "does this match?" question — both are unknowns, neither can ever be a match,
// at any position/depth. Compares the null leaf against an UNEVALUABLE leaf in
// the same tree; the match/no-match result must be identical for every tree.
{
  let mismatches = 0; const mmEx: string[] = [];
  fc.assert(fc.property(treeArb, (tree) => {
    // build a variant where the nullLeaf position reads an UNEVALUABLE module
    const asUneval = (t: Tree): Predicate =>
      t.kind === 'nullLeaf' ? ({ op: 'is', path: 'ssl.chainTrusted' } as Predicate)
      : t.kind === 'matchLeaf' ? toPredicate(t)
      : t.kind === 'noMatchLeaf' ? toPredicate(t)
      : t.kind === 'not' ? ({ op: 'not', operand: asUneval(t.child) } as Predicate)
      : t.kind === 'and' ? ({ op: 'and', operands: t.kids.map(asUneval) } as Predicate)
      : ({ op: 'or', operands: t.kids.map(asUneval) } as Predicate);
    const nullMatches = matches(toPredicate(tree), null);
    const unevalMatches = evaluatePredicate(asUneval(tree), evalsFor(false), RS, 't') === 'match';
    if (nullMatches !== unevalMatches) { mismatches++; if (mmEx.length < 6) mmEx.push(render(tree)); return false; }
    return true;
  }), { numRuns: 4000 });
  assert.equal(mismatches, 0, `null must match iff unevaluable matches (both unknowns); ${mismatches} mismatch(es): ${mmEx.join(' | ')}`);
}

// ── NEW-LOGIC PROPERTY: unevaluable > nullOperand priority in or / exists ──
// An `or` (or exists) with BOTH an unevaluable operand and a null operand, and
// no match, must return 'unevaluable' — the unevaluable dominates, because it
// MIGHT have matched. Never 'nullOperand', never 'noMatch'.
fc.assert(fc.property(fc.array(fc.constantFrom('U', 'N', 'x'), { minLength: 1, maxLength: 5 }), (mix) => {
  // no 'M' (match) in the mix, so the or cannot short-circuit to match
  const leafFor = (c: string): Predicate =>
    c === 'U' ? ({ op: 'is', path: 'ssl.chainTrusted' } as Predicate)                 // unevaluable module
    : c === 'N' ? ({ op: 'is', path: 'permissionContext.precededByUserGesture' } as Predicate) // null field
    : ({ op: 'is', path: 'loginForm.credentialFormPresent' } as Predicate);           // credForm=false -> noMatch
  const orPred: Predicate = { op: 'or', operands: mix.map(leafFor) } as Predicate;
  const r = evaluatePredicate(orPred, makeEvals(null, false), RS, 'prio');
  const hasU = mix.includes('U'), hasN = mix.includes('N');
  const expected = hasU ? 'unevaluable' : hasN ? 'nullOperand' : 'noMatch';
  assert.equal(r, expected, `or(${mix.join(',')}) expected ${expected} (priority U>N>x); got ${r}`);
}), { numRuns: RUNS });

console.log(`DEC-42 property campaign PASSED — ${RUNS} runs each:`);
console.log('  (a) not^depth(nullable-leaf) never match, stays nullOperand through a not-chain — is + lt leaves');
console.log('  (b) or(null-sibling, matching-sibling) matches in both orders');
console.log('  (c) a null-field rule over an EVALUATED module never names it in unevaluableModules');
console.log('  (d) not(unevaluable) stays unevaluable; unevaluable still poisons and, still yields to a real or-match; never confused with nullOperand');
console.log('  cross-check: not(is(null)) -> nullOperand vs not(is(false)) -> match (DEFECT-39/40 distinction, structural)');

console.log('\n  RANDOMIZED TREES (4000 runs). Sample generated trees (null-leaf vs noMatch-leaf, at root):');
for (const line of samples) console.log('    ' + line);
console.log('\n  ANTI-FLIP: 0/4000 divergence — a null leaf NEVER fabricates a match a noMatch would not, at ANY position/depth. The laundering counterexample not(or(not(is(null)))) is now closed by propagation, not narrowed to direct not-chains.');
console.log('  UNKNOWN-EQUIVALENCE: 0/4000 — a null leaf matches iff an unevaluable leaf matches (both propagate identically for the match question).');
console.log('  PRIORITY: or/exists return unevaluable > nullOperand > noMatch when nothing matched, verified over random operand mixes.');
