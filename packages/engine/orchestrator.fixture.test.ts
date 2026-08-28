/**
 * Fixture test for Stage 1 orchestration (packages/engine/orchestrator.ts).
 *
 * Runs all four SecurityEvidence fixtures (clean-login, no-credential,
 * off-origin-post, sso-flow) through the full multi-category dispatch —
 * not single-module fixtures like every other *.fixture.test.ts in this
 * package — and confirms every one of the 10 resulting dispatch results is
 * well-formed. Also confirms `assembleSecurityEvaluation` returns a
 * COMPLETE, type-conformant SecurityEvaluation<M> for every module (all
 * thirteen fields populated — DEC-15 and DEC-21 fully resolved), and that
 * `assembleEvaluationSet` satisfies invariant E-8.
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
  assembleEvaluationSet,
} from './orchestrator.ts';
import { assessConsistency } from './consistency.ts';
import { MODULE_VERSIONS } from './module-versions.ts';

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

// --- Part 3: assembleSecurityEvaluation returns a COMPLETE SecurityEvaluation
//
// REWRITTEN 2026-08-28. This block previously asserted the function always
// THREW Stage1EnvelopeBlockedError. All thirteen envelope fields are now
// genuinely constructed (DEC-15 fully resolved; `consistency` via DEC-21),
// so it returns a real, type-conformant SecurityEvaluation<M>.

for (const moduleId of ALL_MODULE_IDS) {
  const evaluation = await assembleSecurityEvaluation(cleanLogin, moduleId, uncalledStoreReader);

  // All thirteen fields present and correct — asserted field by field, so
  // "constructs for real" means populated, not merely type-checked.
  assert.equal(evaluation.moduleId, moduleId);
  assert.equal(evaluation.contractVersion, '1.1.0');
  assert.match(
    evaluation.evaluationId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    `${moduleId}: evaluationId must be a well-formed UUIDv4`,
  );
  assert.equal(evaluation.targetResourceId, cleanLogin.targetResourceId);
  assert.equal(evaluation.analysisSessionId, cleanLogin.analysisSessionId);
  assert.equal(evaluation.passOrdinal, cleanLogin.collectionContext.passOrdinal);
  assert.equal(evaluation.moduleVersion, MODULE_VERSIONS[moduleId],
    `${moduleId}: moduleVersion comes from the per-module table, not a shared constant`);
  assert.equal(evaluation.evidenceRefs.length, 1);
  assert.equal(evaluation.evidenceRefs[0]?.evidenceId, cleanLogin.evidenceId);
  assert.ok(evaluation.result.status === 'evaluated' || evaluation.result.status === 'unevaluable');
  assert.deepEqual(evaluation.indicators, [], `${moduleId}: indicators is the LDD's sanctioned empty default`);
  assert.ok(['consistent', 'inconsistent', 'indeterminate'].includes(evaluation.consistency),
    `${moduleId}: consistency must be a real ConsistencyAssessment value`);
  assert.match(evaluation.summary, /^\[DEC-15 UNRESOLVED\]/,
    `${moduleId}: summary must be an explicitly-labelled placeholder`);
  assert.ok(evaluation.summary.includes(`"${moduleId}"`), `${moduleId}: summary must name its own module`);
  assert.deepEqual(evaluation.collectionContext, cleanLogin.collectionContext);

  // The consistency verdict must agree with the standalone assessor run
  // against a fresh dispatch of the same evidence — i.e. it was genuinely
  // computed from this module's findings, not stamped.
  const directDispatch = await evaluateModule(cleanLogin, moduleId, uncalledStoreReader);
  assert.equal(evaluation.consistency, assessConsistency(directDispatch),
    `${moduleId}: envelope consistency must match the assessor's own verdict`);

  // unevaluable => indeterminate, unconditionally (the 2026-08-28 ruling).
  if (evaluation.result.status === 'unevaluable') {
    assert.equal(evaluation.consistency, 'indeterminate',
      `${moduleId}: an unevaluable result must always be indeterminate`);
  } else {
    assert.notEqual(evaluation.consistency, 'indeterminate',
      `${moduleId}: an evaluated result must never be indeterminate`);
  }

  // The real module result is genuinely attached, matching direct dispatch
  // in everything EXCEPT evaluationId — each evaluateModule call mints its
  // own fresh one.
  assert.deepEqual(evaluation.result, directDispatch.result);
  assert.notEqual(evaluation.evaluationId, directDispatch.evaluationId,
    'two separate evaluateModule calls must not share an evaluationId');
}

// --- Part 3b: evaluationId is freshly generated per call, not cached/fixed

const firstCall = await assembleSecurityEvaluation(cleanLogin, 'url', uncalledStoreReader);
const secondCall = await assembleSecurityEvaluation(cleanLogin, 'url', uncalledStoreReader);
assert.notEqual(
  firstCall.evaluationId,
  secondCall.evaluationId,
  'evaluationId must be generated fresh per envelope assembly, not fixed or derived from the evidence',
);

// --- Part 3c: E-8 — "Exactly one evaluation per module per pass.
//     Never zero, never two." (evaluation.contract.v1.ts:307)
//
// TESTABLE FOR THE FIRST TIME as of 2026-08-28. E-8 is stated about
// SecurityEvaluation, which could not be constructed until `consistency` was
// resolved; every earlier version of this suite could only assert the weaker
// "one ModuleDispatchResult per module".

for (const [fixtureName, evidence] of Object.entries(FIXTURES)) {
  const set = await assembleEvaluationSet(evidence, uncalledStoreReader);
  const keys = Object.keys(set);

  // Never zero, never two: exactly ten keys, one per ModuleId, no duplicates.
  assert.equal(keys.length, 10, `${fixtureName}: E-8 — expected exactly 10 evaluations`);
  assert.deepEqual([...keys].sort(), [...ALL_MODULE_IDS].sort(),
    `${fixtureName}: E-8 — exactly one evaluation per ModuleId, no more, no fewer`);

  for (const moduleId of ALL_MODULE_IDS) {
    const evaluation = set[moduleId];
    assert.ok(evaluation !== undefined, `${fixtureName}/${moduleId}: E-8 — never zero`);
    // E-1: one evaluation originates from exactly one module. The slot's key
    // and the evaluation's own moduleId must agree.
    assert.equal(evaluation.moduleId, moduleId,
      `${fixtureName}/${moduleId}: E-1 — evaluation is filed under the wrong module`);
  }

  // Distinct identities — ten evaluations, ten evaluationIds.
  const ids = ALL_MODULE_IDS.map((m) => set[m].evaluationId);
  assert.equal(new Set(ids).size, 10, `${fixtureName}: E-8 — evaluationIds must be distinct`);
}

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
  const evaluation = await assembleSecurityEvaluation(cleanLogin, moduleId, uncalledStoreReader);
  assert.equal(evaluation.evidenceRefs[0]?.category, expectedCategory,
    `${moduleId}: evidenceRefs.category must be the EVIDENCE category, not the moduleId`);
}

console.log('all orchestrator fixture assertions passed');
