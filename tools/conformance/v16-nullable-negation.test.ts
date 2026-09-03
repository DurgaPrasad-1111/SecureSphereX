/**
 * V-16 regression test — the validator check that would have caught DEFECT-39
 * and DEFECT-40 before they shipped.
 *
 * V-16 (tools/ci/validate-ruleset.py) errors on any `not(is(x))` predicate where
 * x's findings field is three-state (`boolean | null`), because that form
 * silently reads `null` (unknown) as `false` (confirmed-negative). This test:
 *   1. PASSING regression — the REAL ruleset, whose DL-02 and PM-01 predicates
 *      are now `eq(x, false)` (DEC-41), must be V-16 clean.
 *   2. FAILING fixture — a synthetic ruleset reverting BOTH to the old
 *      `not(is(x))` form must make V-16 flag BOTH rules by name, proving the
 *      check actually catches the historical defect rather than passing
 *      vacuously.
 *
 * Runs the validator via run-python.mjs (same shell-out as psl-conformance).
 *
 * Run: node --experimental-strip-types tools/conformance/v16-nullable-negation.test.ts
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL = join(REPO, 'rulesets', 'rules-v0.1.0.json');

function validate(path: string): { out: string; code: number } {
  const r = spawnSync('node', [join(REPO, 'tools', 'ci', 'run-python.mjs'),
    join(REPO, 'tools', 'ci', 'validate-ruleset.py'), path], { encoding: 'utf8' });
  return { out: (r.stdout ?? '') + (r.stderr ?? ''), code: r.status ?? 1 };
}
const v16Line = (out: string) => out.split('\n').find((l) => l.startsWith('V-16')) ?? '';

// ── 1. PASSING regression: the real ruleset (DL-02 + PM-01 now eq(x,false)) ──
{
  const { out } = validate(REAL);
  assert.match(v16Line(out), /^V-16\s+OK/,
    `V-16 must PASS on the shipped ruleset (DL-02/PM-01 use eq(x,false)); got: ${v16Line(out) || '(no V-16 line)'}`);
  // And the whole validator stays CONFORMANT — V-16 didn't break a sibling check.
  assert.match(out, /RESULT: CONFORMANT/, 'shipped ruleset must remain CONFORMANT with V-16 active');
  console.log('  [1] PASSING regression: real ruleset (eq forms) is V-16 OK, CONFORMANT ✓');
}

// ── 2. FAILING fixture: revert BOTH predicates to not(is(x)) ────────────────
{
  const rs = JSON.parse(readFileSync(REAL, 'utf8')) as {
    rules: { id: string; predicate: { operands: unknown[] } }[];
  };
  for (const r of rs.rules) {
    if (r.id === 'DL-02') {
      r.predicate.operands[0] = { op: 'not', operand: { op: 'is', path: 'downloadContext.extensionMimeConsistent' } };
    }
    if (r.id === 'PM-01') {
      r.predicate.operands[1] = { op: 'not', operand: { op: 'is', path: 'permissionContext.precededByUserGesture' } };
    }
  }
  const broken = join(tmpdir(), 'ssx-v16-both-broken.json');
  writeFileSync(broken, JSON.stringify(rs, null, 2));

  const { out } = validate(broken);
  assert.match(v16Line(out), /^V-16\s+FAIL/,
    `V-16 must FAIL on the old not(is(x)) form; got: ${v16Line(out) || '(no V-16 line)'}`);
  // Both DEFECT-39 and DEFECT-40's exact rules, named.
  assert.match(out, /DL-02: not\(is\(downloadContext\.extensionMimeConsistent\)\)/,
    'V-16 must name DL-02 (DEFECT-39) explicitly');
  assert.match(out, /PM-01: not\(is\(permissionContext\.precededByUserGesture\)\)/,
    'V-16 must name PM-01 (DEFECT-40) explicitly');
  assert.match(out, /RESULT: NON-CONFORMANT/, 'the broken ruleset must be NON-CONFORMANT (error, not warning)');
  console.log('  [2] FAILING fixture: not(is) on both fields -> V-16 FAIL naming DL-02 + PM-01, NON-CONFORMANT ✓');
}

// ── 3. FAILING fixture: the neq equivalent — neq(x, false) on a nullable field ─
// The sweep found ZERO neq/not(eq) instances in the real ruleset today (clean),
// so this proves V-16 catches the form PREVENTIVELY. neq(x, false) matches
// {true, null} — null folded in — the same class as not(is(x)).
{
  const rs = JSON.parse(readFileSync(REAL, 'utf8')) as {
    rules: { id: string; predicate: { operands: unknown[] } }[];
  };
  for (const r of rs.rules) {
    if (r.id === 'DL-02') {
      r.predicate.operands[0] = { op: 'neq', path: 'downloadContext.extensionMimeConsistent', value: false };
    }
  }
  const broken = join(tmpdir(), 'ssx-v16-neq-broken.json');
  writeFileSync(broken, JSON.stringify(rs, null, 2));
  const { out } = validate(broken);
  assert.match(v16Line(out), /^V-16\s+FAIL/, `V-16 must FAIL on neq(x, false) over a nullable field; got: ${v16Line(out)}`);
  assert.match(out, /neq\(downloadContext\.extensionMimeConsistent, false\)/, 'V-16 must name the neq form');
  console.log('  [3] neq equivalent: neq(extensionMimeConsistent, false) -> V-16 FAIL (caught preventively; none exist today) ✓');
}

// ── 4. FAILING fixture: nullable `is` nested under not(and(...)) — proves the
// negation walk follows the FULL ancestor path through and/or, not just a bare
// not(is(x)) chain. No current rule uses this shape; this is the generality proof.
{
  const rs = JSON.parse(readFileSync(REAL, 'utf8')) as {
    rules: { id: string; predicate: { operands: unknown[] } }[];
  };
  for (const r of rs.rules) {
    if (r.id === 'DL-02') {
      r.predicate.operands[0] = { op: 'not', operand: { op: 'and', operands: [
        { op: 'is', path: 'downloadContext.extensionMimeConsistent' },  // nullable
        { op: 'is', path: 'downloadContext.hasCompoundExtension' },      // plain boolean
      ] } };
    }
  }
  const broken = join(tmpdir(), 'ssx-v16-nested-broken.json');
  writeFileSync(broken, JSON.stringify(rs, null, 2));
  const { out } = validate(broken);
  assert.match(v16Line(out), /^V-16\s+FAIL/,
    `V-16 must catch a nullable is() nested under not(and(...)) — full-path negation, not just direct not-chains; got: ${v16Line(out)}`);
  assert.match(out, /extensionMimeConsistent/, 'V-16 must name the nullable field inside the not(and())');
  console.log('  [4] not(and(is(extensionMimeConsistent), is(hasCompoundExtension))) -> V-16 FAIL: negation parity walks through and/or ✓');
}

console.log('V-16 PROVEN: passes the fixed ruleset; catches not(is), neq(x,val), and nullable is nested under not(and()) — the full null-fold class — over a three-state field. DEFECT-39 (DL-02) and DEFECT-40 (PM-01) would both have failed CI at authoring; the neq form is caught preventively (none exist today).');
