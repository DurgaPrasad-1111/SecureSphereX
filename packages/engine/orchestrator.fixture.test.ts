/**
 * Fixture test for Stage 1 orchestration (packages/engine/orchestrator.ts).
 *
 * Runs all four SecurityEvidence fixtures (clean-login, no-credential,
 * off-origin-post, sso-flow) through the full multi-category dispatch —
 * not single-module fixtures like every other *.fixture.test.ts in this
 * package — and confirms every one of the 10 resulting dispatch results is
 * well-formed. Also confirms `assembleSecurityEvaluation` throws
 * Stage1EnvelopeBlockedError (DEC-15) with a correctly-populated
 * diagnostic payload, for every module, rather than silently succeeding
 * or silently returning something malformed.
 *
 * Run directly:
 *   node --experimental-strip-types packages/engine/orchestrator.fixture.test.ts
 * Exits 0 and prints "all orchestrator fixture assertions passed" on
 * success; throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { present } from '../contracts/evidence.contract.v1.ts';
import type { SecurityEvidence, LoginFingerprint } from '../contracts/evidence.contract.v1.ts';
import type { ModuleId } from '../contracts/evaluation.contract.v1.ts';
import type { AuthStoreReader, AuthStoreLookupResult } from '../contracts/boundary.interfaces.v1.ts';
import { cleanLogin } from '../../fixtures/clean-login.ts';
import { noCredential } from '../../fixtures/no-credential.ts';
import { offOriginPost } from '../../fixtures/off-origin-post.ts';
import { ssoFlow } from '../../fixtures/sso-flow.ts';
import {
  evaluateModule,
  evaluateAllModules,
  assembleSecurityEvaluation,
  Stage1EnvelopeBlockedError,
} from './orchestrator.ts';

const ALL_MODULE_IDS: readonly ModuleId[] = [
  'url', 'ssl', 'dns', 'redirect', 'loginForm', 'javascript',
  'homograph', 'authContext', 'downloadContext', 'permissionContext',
];

const FIXTURES: Readonly<Record<string, SecurityEvidence>> = {
  'clean-login': cleanLogin,
  'no-credential': noCredential,
  'off-origin-post': offOriginPost,
  'sso-flow': ssoFlow,
};

const UNEVALUABLE_REASONS = new Set([
  'required_evidence_not_collected', 'store_unavailable', 'fingerprint_version_mismatch',
  'evidence_contract_mismatch', 'backend_unreachable', 'module_error',
]);

/** All four fixtures carry fingerprint: notCollected(...) — the store must
 * never be reached for any of them (authContext.ts gates before calling
 * it). This fake throws if that invariant is ever violated. */
const uncalledStoreReader: AuthStoreReader = {
  lookup: async () => {
    throw new Error('storeReader.lookup() must not be called — every fixture has fingerprint notCollected');
  },
};

// --- Part 1: evaluateAllModules — well-formedness across all 4 fixtures ---

for (const [fixtureName, evidence] of Object.entries(FIXTURES)) {
  const results = await evaluateAllModules(evidence, uncalledStoreReader);

  assert.equal(Object.keys(results).length, 10, `${fixtureName}: expected 10 module results`);

  for (const moduleId of ALL_MODULE_IDS) {
    const entry = results[moduleId];
    assert.equal(entry.moduleId, moduleId, `${fixtureName}/${moduleId}: moduleId mismatch`);

    if (entry.result.status === 'evaluated') {
      assert.ok(
        typeof entry.result.findings === 'object' && entry.result.findings !== null,
        `${fixtureName}/${moduleId}: evaluated result must carry a findings object`,
      );
    } else if (entry.result.status === 'unevaluable') {
      assert.ok(
        UNEVALUABLE_REASONS.has(entry.result.reason),
        `${fixtureName}/${moduleId}: unrecognized UnevaluableReason "${entry.result.reason}"`,
      );
    } else {
      assert.fail(`${fixtureName}/${moduleId}: result.status was neither 'evaluated' nor 'unevaluable'`);
    }
  }

  // Spot checks against known fixture shapes, not just generic well-formedness.
  assert.equal(results.url.result.status, 'evaluated', `${fixtureName}: url has fully present evidence`);
  assert.equal(results.ssl.result.status, 'unevaluable', `${fixtureName}: extension can't observe TLS chain`);
  assert.equal(results.dns.result.status, 'unevaluable', `${fixtureName}: extension can't observe DNS`);
  assert.equal(
    results.authContext.result.status, 'unevaluable',
    `${fixtureName}: fingerprint is notCollected in every fixture`,
  );
  if (results.authContext.result.status === 'unevaluable') {
    assert.equal(results.authContext.result.reason, 'required_evidence_not_collected');
  }
}

// --- Part 2: authContext's Origin-construction path, reaching a real store

const fingerprint: LoginFingerprint = {
  fingerprintAlgorithmVersion: '1.0.0',
  fieldComposition: ['username', 'password'],
  titleTokens: ['sign', 'in'],
  faviconHash: 'abc123',
  heroImagePerceptualHash: null,
  dominantColors: ['#ffffff', '#0000ff'],
};

const withFingerprint: SecurityEvidence = {
  ...cleanLogin,
  evidence: {
    ...cleanLogin.evidence,
    loginInterface: { ...cleanLogin.evidence.loginInterface, fingerprint: present(fingerprint) },
  },
};

const canned: AuthStoreLookupResult = {
  status: 'available',
  originPresent: true,
  lifecycleState: 'ESTABLISHED',
  fingerprintDrift: 0.02,
  bestCrossOriginMatch: null,
};

let lookupCalledWithOrigin: string | null = null;
const respondingStoreReader: AuthStoreReader = {
  lookup: async (origin) => {
    lookupCalledWithOrigin = origin;
    return canned;
  },
};

const authContextResult = await evaluateModule(withFingerprint, 'authContext', respondingStoreReader);
assert.equal(authContextResult.result.status, 'evaluated');
if (authContextResult.moduleId === 'authContext' && authContextResult.result.status === 'evaluated') {
  assert.equal(authContextResult.result.findings.lifecycleState, 'ESTABLISHED');
  assert.equal(authContextResult.result.findings.fingerprintDrift, 0.02);
}
// evaluateModule constructed the Origin from url.fullUrl, not registrableDomain.
assert.equal(lookupCalledWithOrigin, 'https://accounts.example.com');

// --- Part 3: assembleSecurityEvaluation always throws Stage1EnvelopeBlockedError

for (const moduleId of ALL_MODULE_IDS) {
  let caught: unknown;
  try {
    await assembleSecurityEvaluation(cleanLogin, moduleId, uncalledStoreReader);
    assert.fail(`${moduleId}: assembleSecurityEvaluation should have thrown`);
  } catch (err) {
    caught = err;
  }

  assert.ok(caught instanceof Stage1EnvelopeBlockedError, `${moduleId}: wrong error type thrown`);
  const blocked = caught as Stage1EnvelopeBlockedError;
  assert.equal(blocked.moduleId, moduleId);
  // evaluationId was resolved 2026-08-26 (DEC-15 amendment) — only the
  // remaining four fields are still reported as missing.
  assert.deepEqual(
    [...blocked.missingFields].sort(),
    ['consistency', 'indicators', 'moduleVersion', 'summary'],
  );

  // The mechanical fields ARE genuinely correct, not placeholder values.
  assert.equal(blocked.mechanicalFields.moduleId, moduleId);
  assert.equal(blocked.mechanicalFields.contractVersion, '1.1.0');
  assert.match(
    blocked.mechanicalFields.evaluationId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    `${moduleId}: evaluationId must be a well-formed UUIDv4`,
  );
  assert.equal(blocked.mechanicalFields.targetResourceId, cleanLogin.targetResourceId);
  assert.equal(blocked.mechanicalFields.analysisSessionId, cleanLogin.analysisSessionId);
  assert.equal(blocked.mechanicalFields.passOrdinal, cleanLogin.collectionContext.passOrdinal);
  assert.equal(blocked.mechanicalFields.evidenceRefs.length, 1);
  assert.equal(blocked.mechanicalFields.evidenceRefs[0]?.evidenceId, cleanLogin.evidenceId);
  assert.deepEqual(blocked.mechanicalFields.collectionContext, cleanLogin.collectionContext);

  // The real module result is genuinely attached, matching direct dispatch.
  const directDispatch = await evaluateModule(cleanLogin, moduleId, uncalledStoreReader);
  assert.deepEqual(blocked.moduleResult, directDispatch);
}

// --- Part 3b: evaluationId is freshly generated per call, not cached/fixed

const firstCall = await assembleSecurityEvaluation(cleanLogin, 'url', uncalledStoreReader).catch(
  (err: unknown) => err as Stage1EnvelopeBlockedError,
);
const secondCall = await assembleSecurityEvaluation(cleanLogin, 'url', uncalledStoreReader).catch(
  (err: unknown) => err as Stage1EnvelopeBlockedError,
);
assert.notEqual(
  firstCall.mechanicalFields.evaluationId,
  secondCall.mechanicalFields.evaluationId,
  'evaluationId must be generated fresh per envelope assembly, not fixed or derived from the evidence',
);

// --- Part 4: evidenceRefs.category correctly diverges from moduleId -------
// (ssl -> transport, loginForm/authContext -> loginInterface, not identity)

for (const [moduleId, expectedCategory] of [
  ['url', 'url'],
  ['ssl', 'transport'],
  ['dns', 'dns'],
  ['redirect', 'redirect'],
  ['loginForm', 'loginInterface'],
  ['javascript', 'scriptRuntime'],
  ['homograph', 'domainRepresentation'],
  ['authContext', 'loginInterface'],
  ['downloadContext', 'downloadContext'],
  ['permissionContext', 'permissionContext'],
] as const) {
  try {
    await assembleSecurityEvaluation(cleanLogin, moduleId, uncalledStoreReader);
    assert.fail('unreachable');
  } catch (err) {
    assert.ok(err instanceof Stage1EnvelopeBlockedError);
    assert.equal((err as Stage1EnvelopeBlockedError).mechanicalFields.evidenceRefs[0]?.category, expectedCategory);
  }
}

console.log('all orchestrator fixture assertions passed');
