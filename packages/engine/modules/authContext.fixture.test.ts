/**
 * Fixture test for the Authentication Context Evaluation Module (§2.6,
 * §20.11, module 8).
 *
 * No test runner is wired up in this repo yet (package.json's test:fixtures
 * script is still a stub). Run directly:
 *   node --experimental-strip-types packages/engine/modules/authContext.fixture.test.ts
 * Exits 0 and prints "all authContext module fixture assertions passed" on
 * success; throws (nonzero exit) at the first failed assertion otherwise.
 *
 * No real Authentication History Store exists yet (docs/How-To-Start-Coding.md:
 * "the store does not exist until week 4"). FakeAuthStoreReader below
 * implements the real AuthStoreReader interface and returns a canned
 * AuthStoreLookupResult per test case — the same principle as every other
 * module's fixture Evidence standing in for a real browser.
 */

import assert from 'node:assert/strict';
import { present, absent, notCollected, toOrigin } from '../../contracts/evidence.contract.v1.ts';
import type { LoginInterfaceEvidence, LoginFingerprint } from '../../contracts/evidence.contract.v1.ts';
import type { AuthStoreReader, AuthStoreLookupResult } from '../../contracts/boundary.interfaces.v1.ts';
import { computeAuthContextFindings } from './authContext.ts';

// --- Fixture helpers ---------------------------------------------------

const pageOrigin = toOrigin('https://accounts.example.com/login');
assert.ok(pageOrigin, 'fixture setup: toOrigin() must succeed for a well-formed URL');

const fingerprint: LoginFingerprint = {
  fingerprintAlgorithmVersion: '1.0.0',
  fieldComposition: ['username', 'password'],
  titleTokens: ['sign', 'in'],
  faviconHash: 'abc123',
  heroImagePerceptualHash: null,
  dominantColors: ['#ffffff', '#0000ff'],
};

function evidenceWith(fp: LoginInterfaceEvidence['fingerprint']): LoginInterfaceEvidence {
  return {
    credentialFormPresent: present(true),
    forms: present([]),
    fingerprint: fp,
  };
}

/** Implements the real AuthStoreReader interface — returns a canned result,
 * ignores the arguments (no fake needs real lookup logic; it only needs to
 * satisfy the type and hand back whatever this test case wants to probe). */
function fakeReader(result: AuthStoreLookupResult): AuthStoreReader {
  return {
    lookup: async () => result,
  };
}

// --- Case 1: happy path, 'available' with a real cross-origin match ------

const availableMatch: AuthStoreLookupResult = {
  status: 'available',
  originPresent: false,
  lifecycleState: 'ESTABLISHED',
  fingerprintDrift: null,
  bestCrossOriginMatch: {
    origin: toOrigin('https://real-bank.example')!,
    registrableDomain: 'real-bank.example',
    similarity: 0.94,
  },
};

const happyResult = await computeAuthContextFindings(
  pageOrigin!,
  evidenceWith(present(fingerprint)),
  fakeReader(availableMatch),
);

assert.deepEqual(happyResult, {
  status: 'evaluated',
  findings: {
    originPresent: false,
    lifecycleState: 'ESTABLISHED',
    fingerprintDrift: null,
    bestCrossOriginMatch: {
      origin: toOrigin('https://real-bank.example'),
      registrableDomain: 'real-bank.example',
      similarity: 0.94,
    },
    storeAvailable: true,
  },
});

// --- Case 2: B-4 — versionMismatch must NEVER surface as an absent match --
//
// This is the named security invariant (B-4, §20.11) — tested directly,
// not just trusted to the type system. Confirms both that the result is
// unevaluable(fingerprint_version_mismatch) AND that it is NOT shaped like
// an evaluated result with originPresent: false (which is what an absent
// match would look like — the exact conflation B-4 forbids).

const versionMismatch: AuthStoreLookupResult = {
  status: 'versionMismatch',
  storedAlgorithmVersions: ['0.9.0'],
};

const mismatchResult = await computeAuthContextFindings(
  pageOrigin!,
  evidenceWith(present(fingerprint)),
  fakeReader(versionMismatch),
);

assert.deepEqual(mismatchResult, {
  status: 'unevaluable',
  reason: 'fingerprint_version_mismatch',
});
// Explicitly confirm this is NOT the shape an absent match would take.
assert.notEqual(mismatchResult.status, 'evaluated');
assert.equal('findings' in mismatchResult, false);

// --- Case 3: store 'unavailable' -> unevaluable(store_unavailable) --------

const unavailable: AuthStoreLookupResult = {
  status: 'unavailable',
  reason: 'store_corrupt',
};

const unavailableResult = await computeAuthContextFindings(
  pageOrigin!,
  evidenceWith(present(fingerprint)),
  fakeReader(unavailable),
);

assert.deepEqual(unavailableResult, {
  status: 'unevaluable',
  reason: 'store_unavailable',
});

// --- Case 4: missing evidence — fingerprint not collected -----------------

const noFingerprintResult = await computeAuthContextFindings(
  pageOrigin!,
  evidenceWith(notCollected('tier_not_reached')),
  // A fake that would throw if actually called — confirms the module gates
  // BEFORE calling the store, not after, on missing evidence.
  { lookup: async () => { throw new Error('lookup() must not be called when fingerprint is not collected'); } },
);

assert.deepEqual(noFingerprintResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 4b: fingerprint genuinely absent — same treatment as notCollected

const absentFingerprintResult = await computeAuthContextFindings(
  pageOrigin!,
  evidenceWith(absent()),
  { lookup: async () => { throw new Error('lookup() must not be called when fingerprint is absent'); } },
);

assert.deepEqual(absentFingerprintResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 5: bestCrossOriginMatch: null — absence of a match, distinct from
// version mismatch. A real, evaluated finding, not an error state.

const noMatch: AuthStoreLookupResult = {
  status: 'available',
  originPresent: false,
  lifecycleState: null,
  fingerprintDrift: null,
  bestCrossOriginMatch: null,
};

const noMatchResult = await computeAuthContextFindings(
  pageOrigin!,
  evidenceWith(present(fingerprint)),
  fakeReader(noMatch),
);

assert.deepEqual(noMatchResult, {
  status: 'evaluated',
  findings: {
    originPresent: false,
    lifecycleState: null,
    fingerprintDrift: null,
    bestCrossOriginMatch: null,
    storeAvailable: true,
  },
});

console.log('all authContext module fixture assertions passed');
