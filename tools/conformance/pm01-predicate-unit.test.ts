/**
 * PM-01 predicate-unit test — DEFECT-40 fix, DEC-41.
 *
 * ⚠️ THIS TESTS DORMANT-BUT-CORRECT CODE, NOT LIVE BEHAVIOR. PM-01 is DEC-40
 * accepted-non-functional: permissionContext is fully stubbed, so the module is
 * `unevaluable` end-to-end and PM-01 can never reach this conjunct through the
 * full pipeline today. There is therefore no live-path test that can exercise
 * it. Instead this drives the engine's own `evaluatePredicate` directly on the
 * amended `eq(precededByUserGesture, false)` node, proving the fix is correct at
 * the predicate-operator level so it is provably right the moment
 * permissionContext is wired (DEC-40's revisit trigger) — not asserted on faith.
 *
 * The defect (DEFECT-40): the old `not(is(precededByUserGesture))` matched a
 * `null` (gesture context unknown) the same as `false` (no gesture), because
 * `is` tests only `=== true`. DEC-41 changed it to `eq(x, false)`, which matches
 * ONLY a confirmed `false`. This asserts exactly that three-way behavior:
 *   false -> match   (confirmed no-gesture: the rule's intended trigger)
 *   null  -> noMatch (unknown: DEFECT-40's over-fire, now GONE)
 *   true  -> noMatch (gesture present)
 *
 * Run: node --experimental-strip-types tools/conformance/pm01-predicate-unit.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluatePredicate, type EvaluationSetForMatching } from '../../packages/engine/stage2.ts';
import type { RuleSet, Predicate } from '../../packages/contracts/ruleset.format.v1.ts';
import type { PermissionContextFindings } from '../../packages/contracts/evaluation.contract.v1.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ruleSet = JSON.parse(readFileSync(join(REPO, 'rulesets', 'rules-v0.1.0.json'), 'utf8')) as RuleSet;

// Pull the ACTUAL amended node out of the shipped ruleset — not a hand-written
// copy — so this test tracks the real predicate and would fail if it regressed.
const pm01 = ruleSet.rules.find((r) => r.id === 'PM-01');
assert.ok(pm01, 'PM-01 must exist');
function findGestureNode(p: Predicate): Predicate | null {
  if (p.op === 'eq' && 'path' in p && p.path === 'permissionContext.precededByUserGesture') return p;
  for (const sub of ('operands' in p ? p.operands : [])) { const f = findGestureNode(sub); if (f) return f; }
  if ('operand' in p && p.operand) return findGestureNode(p.operand);
  return null;
}
const gestureNode = findGestureNode(pm01!.predicate);
assert.ok(gestureNode, 'DEC-41: PM-01 must carry an eq(precededByUserGesture, false) node');
assert.equal(gestureNode!.op, 'eq', 'the node must be eq (not the old not/is)');
assert.equal((gestureNode as { value: unknown }).value, false, 'eq value must be the literal false');

// Minimal evaluations: only permissionContext is read by this node. Cast a
// partial — resolveFindingPath indexes evaluations['permissionContext'] only.
function evalsWithGesture(gesture: boolean | null): EvaluationSetForMatching {
  const findings: PermissionContextFindings = {
    requestedPermission: 'camera',
    requestingRegistrableDomain: null,
    precededByUserGesture: gesture,
    pageAgeMs: 1000,
  };
  return {
    permissionContext: {
      moduleId: 'permissionContext',
      evaluationId: 'unit',
      result: { status: 'evaluated', findings },
    },
  } as unknown as EvaluationSetForMatching;
}

const run = (gesture: boolean | null) =>
  evaluatePredicate(gestureNode!, evalsWithGesture(gesture), ruleSet, 'PM-01');

assert.equal(run(false), 'match',
  'confirmed no-gesture (false) MUST match eq(x,false) — the rule\'s intended trigger');
assert.equal(run(null), 'noMatch',
  'DEFECT-40: unknown gesture (null) MUST NOT match — this is the over-fire the fix removes (old not(is(null)) matched)');
assert.equal(run(true), 'noMatch',
  'gesture present (true) MUST NOT match');

console.log('PM-01 predicate-unit PROVEN (dormant code): eq(precededByUserGesture, false) matches confirmed false, NOT null and NOT true.');
console.log('  false -> match ; null -> noMatch (DEFECT-40 over-fire gone) ; true -> noMatch. PM-01 stays unevaluable end-to-end under DEC-40; this proves the operator, not live behavior.');
