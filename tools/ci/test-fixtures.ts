#!/usr/bin/env node
// Implements Step 8's test:fixtures check (gate G-7, "Fixture round-trip").
//
// Was previously a stub (echo, exit 0 unconditionally) since Step 5 scaffolded
// it — meaning G-7 in .github/workflows/ci.yml has been vacuous the same way
// DEFECT-1 documented for G-1: wired into CI, always green, verifying nothing.
//
// What Step 8 actually asked for, and what this checks:
//
//   F-1..F-4  Round trip. For each of the four fixtures in fixtures/, the
//             fixture typechecks by construction (it is a `SecurityEvidence`-
//             typed .ts module compiled under strict mode as part of
//             `npm run typecheck`; that gate already covers "typechecks").
//             This script covers "serialize it, confirm the output is
//             byte-identical to the input": JSON.stringify the fixture, then
//             JSON.parse -> JSON.stringify again, and require the two
//             stringified outputs to be the exact same string. Plain data
//             (Observation<T> discriminated unions, string/number/boolean
//             leaves, arrays) has no serialization step that should be able
//             to change it, so any difference is a real defect.
//
//   F-5       At least one Observation across all four fixtures has
//             state: 'absent'.
//   F-6       At least one Observation across all four fixtures has
//             state: 'notCollected' (the type system already forces a
//             `reason` to accompany it — see evidence.contract.v1.ts).
//   F-7       clean-login's `evidence.redirect.chain` is specifically
//             `absent`, not `notCollected` — Step 8's named trap: a page
//             reached directly has no redirect chain because none exists,
//             not because it could not be observed.
//
// Run directly: node --experimental-strip-types tools/ci/test-fixtures.ts

import { cleanLogin } from '../../fixtures/clean-login.ts';
import { noCredential } from '../../fixtures/no-credential.ts';
import { offOriginPost } from '../../fixtures/off-origin-post.ts';
import { ssoFlow } from '../../fixtures/sso-flow.ts';
import type { SecurityEvidence } from '../../packages/contracts/evidence.contract.v1.ts';

const fixtures: Record<string, SecurityEvidence> = {
  'clean-login': cleanLogin,
  'no-credential': noCredential,
  'off-origin-post': offOriginPost,
  'sso-flow': ssoFlow,
};

interface Row {
  check: string;
  ok: boolean;
  detail: string;
}
const rows: Row[] = [];

for (const [name, fixture] of Object.entries(fixtures)) {
  const first = JSON.stringify(fixture);
  const second = JSON.stringify(JSON.parse(first));
  rows.push({
    check: `round-trip:${name}`,
    ok: first === second,
    detail: first === second ? '' : 'serialize -> parse -> serialize did not reproduce the original output',
  });
}

interface ObservationLeaf {
  path: string;
  state: string;
}

function collectObservationLeaves(value: unknown, path: string, out: ObservationLeaf[]): void {
  if (value === null || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (
    typeof record.state === 'string' &&
    (record.state === 'present' || record.state === 'absent' || record.state === 'notCollected')
  ) {
    out.push({ path, state: record.state });
    return;
  }
  for (const [key, child] of Object.entries(record)) {
    collectObservationLeaves(child, path ? `${path}.${key}` : key, out);
  }
}

const leavesByFixture: Record<string, ObservationLeaf[]> = {};
for (const [name, fixture] of Object.entries(fixtures)) {
  const leaves: ObservationLeaf[] = [];
  collectObservationLeaves(fixture, '', leaves);
  leavesByFixture[name] = leaves;
}

const allLeaves = Object.values(leavesByFixture).flat();

const anyAbsent = allLeaves.some((leaf) => leaf.state === 'absent');
rows.push({
  check: 'F-5 has-absent',
  ok: anyAbsent,
  detail: anyAbsent ? '' : 'no fixture uses an absent observation',
});

const anyNotCollected = allLeaves.some((leaf) => leaf.state === 'notCollected');
rows.push({
  check: 'F-6 has-notCollected',
  ok: anyNotCollected,
  detail: anyNotCollected ? '' : 'no fixture uses a notCollected observation',
});

const cleanLoginRedirectChain = leavesByFixture['clean-login']?.find(
  (leaf) => leaf.path === 'evidence.redirect.chain',
);
const redirectChainIsAbsent = cleanLoginRedirectChain?.state === 'absent';
rows.push({
  check: 'F-7 clean-login-redirect-absent',
  ok: redirectChainIsAbsent,
  detail: redirectChainIsAbsent
    ? ''
    : `evidence.redirect.chain state was ${cleanLoginRedirectChain?.state ?? '(not found)'}, expected 'absent'`,
});

const width = Math.max(...rows.map((r) => r.check.length), 'CHECK'.length) + 2;
console.log(`${'CHECK'.padEnd(width)}STATUS   DETAIL`);
console.log('-'.repeat(80));
for (const row of rows) {
  console.log(`${row.check.padEnd(width)}${row.ok ? 'OK' : 'FAIL'}     ${row.detail}`);
}
console.log('-'.repeat(80));

const failed = rows.filter((r) => !r.ok);
if (failed.length > 0) {
  console.log(`RESULT: FAIL (${failed.length} of ${rows.length} checks failed)`);
  process.exit(1);
}
console.log(`RESULT: PASS (${rows.length}/${rows.length})`);
