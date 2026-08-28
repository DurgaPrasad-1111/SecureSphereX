/**
 * Adversarial fixture test for `consistency.ts`.
 *
 * Every module gets BOTH directions: a coherent findings object that must
 * assess `consistent`, and a deliberately-seeded violation that must assess
 * `inconsistent`. A test that only ever exercises the happy path proves
 * nothing about a predicate — it would pass identically against
 * `return false`.
 *
 * Several of these violations CANNOT be produced by the current modules
 * (DEFECT-18/19/20 pin some fields to null/[], DEC-5 stubs three ssl
 * fields). They are constructed here as literals anyway: the relation
 * guards against a PRODUCER contradicting itself, and the producer is not
 * this package.
 *
 * Run directly:
 *   node --experimental-strip-types packages/engine/consistency.fixture.test.ts
 */

import assert from 'node:assert/strict';

import {
  assessConsistency,
  urlIsInconsistent, sslIsInconsistent, dnsIsInconsistent, redirectIsInconsistent,
  loginFormIsInconsistent, javascriptIsInconsistent, homographIsInconsistent,
  authContextIsInconsistent, downloadContextIsInconsistent, permissionContextIsInconsistent,
} from './consistency.ts';
import type {
  UrlFindings, SslFindings, DnsFindings, RedirectFindings, LoginFormFindings,
  JavaScriptFindings, HomographFindings, AuthContextFindings,
  DownloadContextFindings, PermissionContextFindings, ModuleId,
} from '../contracts/evaluation.contract.v1.ts';
import type { ModuleDispatchResult } from './orchestrator.ts';
import { toOrigin } from '../contracts/evidence.contract.v1.ts';

// --- url ------------------------------------------------------------------

const urlOk: UrlFindings = {
  scheme: 'https', isSecureScheme: true, registrableDomain: 'example.com',
  subdomainDepth: 1, isIpLiteral: false, totalLength: 30,
  suspiciousKeywordCount: 0, percentEncodedSegmentCount: 0, specialCharacterDensity: 0,
};
assert.equal(urlIsInconsistent(urlOk), false, 'url: ordinary domain URL is coherent');
// An IP-literal URL legitimately has NO registrable domain — coherent.
assert.equal(urlIsInconsistent({ ...urlOk, isIpLiteral: true, registrableDomain: null }), false,
  'url: IP literal with null domain is the coherent IP case');
// VIOLATION: IP literal that also claims a registrable domain.
assert.equal(urlIsInconsistent({ ...urlOk, isIpLiteral: true }), true,
  'url: isIpLiteral with a non-null registrableDomain must be inconsistent');

// --- ssl ------------------------------------------------------------------

const sslPlainHttp: SslFindings = {
  httpsEstablished: false, certificateCurrentlyValid: null, chainComplete: null,
  chainTrusted: null, subjectMatchesHost: null, daysUntilExpiry: null,
};
assert.equal(sslIsInconsistent(sslPlainHttp), false, 'ssl: plain HTTP with no certificate facts is coherent');
assert.equal(sslIsInconsistent({ ...sslPlainHttp, httpsEstablished: true, chainTrusted: true }), false,
  'ssl: HTTPS with real chain facts is coherent');
// VIOLATION 1: no TLS session, yet a certificate fact is asserted.
assert.equal(sslIsInconsistent({ ...sslPlainHttp, chainTrusted: true }), true,
  'ssl: httpsEstablished false with chainTrusted true must be inconsistent');
for (const field of ['certificateCurrentlyValid', 'chainComplete', 'chainTrusted', 'subjectMatchesHost'] as const) {
  assert.equal(sslIsInconsistent({ ...sslPlainHttp, [field]: false }), true,
    `ssl: httpsEstablished false with a non-null ${field} must be inconsistent`);
}
assert.equal(sslIsInconsistent({ ...sslPlainHttp, daysUntilExpiry: 10 }), true,
  'ssl: httpsEstablished false with a non-null daysUntilExpiry must be inconsistent');
// VIOLATION 2: expired certificate asserted as currently valid.
assert.equal(
  sslIsInconsistent({
    httpsEstablished: true, certificateCurrentlyValid: true, chainComplete: true,
    chainTrusted: true, subjectMatchesHost: true, daysUntilExpiry: -5,
  }), true,
  'ssl: negative daysUntilExpiry with certificateCurrentlyValid true must be inconsistent');
// Boundary: 0 means "expires later today" — still valid, NOT a violation.
assert.equal(
  sslIsInconsistent({
    httpsEstablished: true, certificateCurrentlyValid: true, chainComplete: true,
    chainTrusted: true, subjectMatchesHost: true, daysUntilExpiry: 0,
  }), false,
  'ssl: daysUntilExpiry 0 is still valid — must NOT be inconsistent');
// Deliberately NOT a violation: trusted-but-incomplete chain (AIA fetching).
assert.equal(
  sslIsInconsistent({
    httpsEstablished: true, certificateCurrentlyValid: true, chainComplete: false,
    chainTrusted: true, subjectMatchesHost: true, daysUntilExpiry: 90,
  }), false,
  'ssl: chainTrusted with chainComplete false is legitimate, must NOT be inconsistent');

// --- dns ------------------------------------------------------------------

const dnsOk: DnsFindings = {
  resolves: true, aRecordCount: 2, aaaaRecordCount: 1, nameServerCount: 2,
  cnamePresent: false, mxPresent: true, dnssecDeployed: false,
};
assert.equal(dnsIsInconsistent(dnsOk), false, 'dns: resolving name with addresses is coherent');
assert.equal(dnsIsInconsistent({ ...dnsOk, resolves: false, aRecordCount: 0, aaaaRecordCount: 0 }), false,
  'dns: non-resolving name with no addresses is coherent');
// VIOLATION: claims not to resolve while reporting address records.
assert.equal(dnsIsInconsistent({ ...dnsOk, resolves: false, aaaaRecordCount: 0 }), true,
  'dns: resolves false with aRecordCount > 0 must be inconsistent');
assert.equal(dnsIsInconsistent({ ...dnsOk, resolves: false, aRecordCount: 0 }), true,
  'dns: resolves false with aaaaRecordCount > 0 must be inconsistent');
// Deliberately NOT violations — see consistency.ts and DEFECT-25.
assert.equal(dnsIsInconsistent({ ...dnsOk, resolves: true, aRecordCount: 0, aaaaRecordCount: 0 }), false,
  'dns: resolves true with zero addresses is NOT encoded as a violation (resolves is undefined in the corpus)');
assert.equal(dnsIsInconsistent({ ...dnsOk, resolves: false, aRecordCount: 0, aaaaRecordCount: 0, cnamePresent: true }), false,
  'dns: a CNAME to a non-existent target is a legitimate non-resolving state');
assert.equal(dnsIsInconsistent({ ...dnsOk, nameServerCount: 0 }), false,
  'dns: zero NS records is normal for a subdomain query');

// --- redirect -------------------------------------------------------------

const redirectOk: RedirectFindings = {
  hopCount: 2, initialRegistrableDomain: null, finalRegistrableDomain: null,
  mechanisms: ['http_3xx', 'meta_refresh'], chainLength: 2,
};
assert.equal(redirectIsInconsistent(redirectOk), false, 'redirect: matching counts are coherent');
assert.equal(redirectIsInconsistent({ ...redirectOk, hopCount: 0, mechanisms: [], chainLength: 0 }), false,
  'redirect: direct arrival (zero hops, empty chain) is coherent');
// VIOLATION: the producer disagreed with itself about how many hops occurred.
assert.equal(redirectIsInconsistent({ ...redirectOk, hopCount: 3 }), true,
  'redirect: hopCount 3 with chainLength 2 must be inconsistent');
assert.equal(redirectIsInconsistent({ ...redirectOk, hopCount: 3, mechanisms: [], chainLength: 0 }), true,
  'redirect: hopCount 3 with an absent chain (chainLength 0) must be inconsistent');

// --- loginForm ------------------------------------------------------------

const loginFormOk: LoginFormFindings = {
  credentialFormPresent: true,
  forms: [{
    fieldKinds: ['username', 'password'], method: 'POST',
    actionRegistrableDomain: 'example.com', hasHiddenCredentialField: false,
    hasAutocompleteDisabledCredential: false, injectedAfterLoad: false,
  }],
  pageRegistrableDomain: null,
};
assert.equal(loginFormIsInconsistent(loginFormOk), false, 'loginForm: flag with a real form is coherent');
assert.equal(loginFormIsInconsistent({ ...loginFormOk, credentialFormPresent: false, forms: [] }), false,
  'loginForm: no flag and no forms is coherent');
// VIOLATION: asserts a credential form exists while listing none at all.
assert.equal(loginFormIsInconsistent({ ...loginFormOk, forms: [] }), true,
  'loginForm: credentialFormPresent true with an empty forms list must be inconsistent');
// Deliberately NOT a violation — the converse is out of scope (2026-08-28).
assert.equal(loginFormIsInconsistent({ ...loginFormOk, credentialFormPresent: false }), false,
  'loginForm: the converse is deliberately NOT encoded (username/email are identifiers, not secrets)');

// --- javascript -----------------------------------------------------------

const javascriptFindings: JavaScriptFindings = {
  listenerOnCredentialField: true, clientSideTransmissionObserved: false,
  transmissionEndpointDomains: [], dynamicScriptLoadCount: 0,
  credentialInterfaceInjected: true, injectingScriptOriginDomain: null,
};
// No relation exists among the live fields — every combination is coherent.
assert.equal(javascriptIsInconsistent(javascriptFindings), false,
  'javascript: no relation exists — must always be consistent');
assert.equal(
  javascriptIsInconsistent({
    ...javascriptFindings, listenerOnCredentialField: false,
    clientSideTransmissionObserved: true, dynamicScriptLoadCount: 0,
  }), false,
  'javascript: transmission without a listener, and injection without a dynamic load, are both legitimate');

// --- homograph ------------------------------------------------------------

const homographOk: HomographFindings = {
  isIdn: false, containsNonAscii: false, isMixedScript: false,
  scriptsUsed: ['Latin'], confusableSkeleton: null,
};
assert.equal(homographIsInconsistent(homographOk), false, 'homograph: plain Latin domain is coherent');
assert.equal(
  homographIsInconsistent({
    ...homographOk, isIdn: true, containsNonAscii: true, isMixedScript: true,
    scriptsUsed: ['Latin', 'Cyrillic'], confusableSkeleton: 'accounts.example.com',
  }), false,
  'homograph: genuine mixed-script domain with its scripts recorded is coherent');
// VIOLATION: mixed-script asserted with no scripts recorded at all.
assert.equal(homographIsInconsistent({ ...homographOk, isMixedScript: true, scriptsUsed: [] }), true,
  'homograph: isMixedScript true with an empty scriptsUsed must be inconsistent');
// Deliberately NOT a violation — depends on the unresolved scriptsUsed
// semantics (DEFECT-24), so only the length-0 form is encoded.
assert.equal(homographIsInconsistent({ ...homographOk, isMixedScript: true, scriptsUsed: ['Cyrillic'] }), false,
  'homograph: single-entry scriptsUsed is NOT encoded as a violation while DEFECT-24 is open');

// --- authContext ----------------------------------------------------------

// toOrigin() is the ONLY sanctioned way to build an Origin — G-2 rejects any
// `as Origin` cast outside it (evidence.contract.v1.ts I-9).
const crossOrigin = toOrigin('https://a.example')!;
assert.ok(crossOrigin, 'fixture setup: toOrigin() must succeed for a well-formed URL');

const authAbsentOrigin: AuthContextFindings = {
  originPresent: false, lifecycleState: null, fingerprintDrift: null,
  bestCrossOriginMatch: { origin: crossOrigin, registrableDomain: 'a.example', similarity: 0.9 },
  storeAvailable: true,
};
assert.equal(authContextIsInconsistent(authAbsentOrigin), false,
  'authContext: absent origin with a cross-origin match is the documented shape');

const authPresentOrigin: AuthContextFindings = {
  originPresent: true, lifecycleState: 'ESTABLISHED', fingerprintDrift: 0.02,
  bestCrossOriginMatch: null, storeAvailable: true,
};
assert.equal(authContextIsInconsistent(authPresentOrigin), false,
  'authContext: present origin with drift and no cross-origin match is the documented shape');

// VIOLATIONS — each clause independently.
assert.equal(authContextIsInconsistent({ ...authAbsentOrigin, lifecycleState: 'ESTABLISHED' }), true,
  'authContext: absent origin with a lifecycleState must be inconsistent');
assert.equal(authContextIsInconsistent({ ...authAbsentOrigin, fingerprintDrift: 0.1 }), true,
  'authContext: absent origin with fingerprintDrift must be inconsistent');
assert.equal(
  authContextIsInconsistent({ ...authPresentOrigin, bestCrossOriginMatch: authAbsentOrigin.bestCrossOriginMatch }), true,
  'authContext: present origin with a cross-origin match must be inconsistent');
assert.equal(authContextIsInconsistent({ ...authPresentOrigin, fingerprintDrift: null }), true,
  'authContext: present origin with null fingerprintDrift must be inconsistent');
// The structural clause: findings exist, yet the store is claimed unavailable.
assert.equal(authContextIsInconsistent({ ...authPresentOrigin, storeAvailable: false }), true,
  'authContext: storeAvailable false inside an evaluated result must be inconsistent');

// --- downloadContext ------------------------------------------------------

const downloadOk: DownloadContextFindings = {
  declaredExtension: 'exe', declaredMimeType: 'application/octet-stream',
  extensionMimeConsistent: null, hasCompoundExtension: false,
  downloadRegistrableDomain: 'cdn.example', referrerRegistrableDomain: 'example.com',
  referrerPresent: true,
};
assert.equal(downloadContextIsInconsistent(downloadOk), false, 'downloadContext: ordinary download is coherent');
assert.equal(
  downloadContextIsInconsistent({ ...downloadOk, referrerPresent: false, referrerRegistrableDomain: null }), false,
  'downloadContext: no referrer and no referrer domain is coherent');
// VIOLATION 1: no referrer, yet a referrer domain.
assert.equal(downloadContextIsInconsistent({ ...downloadOk, referrerPresent: false }), true,
  'downloadContext: referrerPresent false with a non-null referrerRegistrableDomain must be inconsistent');
// VIOLATION 2: a compound extension with no extension at all.
assert.equal(
  downloadContextIsInconsistent({ ...downloadOk, hasCompoundExtension: true, declaredExtension: null }), true,
  'downloadContext: hasCompoundExtension true with a null declaredExtension must be inconsistent');
assert.equal(downloadContextIsInconsistent({ ...downloadOk, hasCompoundExtension: true }), false,
  'downloadContext: a compound extension WITH an extension is coherent');

// --- permissionContext ----------------------------------------------------

const permissionNoRequest: PermissionContextFindings = {
  requestedPermission: null, requestingRegistrableDomain: null,
  precededByUserGesture: null, pageAgeMs: 2200,
};
assert.equal(permissionContextIsInconsistent(permissionNoRequest), false,
  'permissionContext: no request, with a page age, is the ordinary page shape');
assert.equal(
  permissionContextIsInconsistent({
    requestedPermission: 'camera', requestingRegistrableDomain: null,
    precededByUserGesture: false, pageAgeMs: 400,
  }), false,
  'permissionContext: a real request with gesture and age is coherent');
// VIOLATION: gesture-precedence recorded for a request that never happened.
assert.equal(permissionContextIsInconsistent({ ...permissionNoRequest, precededByUserGesture: false }), true,
  'permissionContext: null requestedPermission with a non-null precededByUserGesture must be inconsistent');
// pageAgeMs is deliberately excluded — an ordinary page has an age.
assert.equal(permissionContextIsInconsistent({ ...permissionNoRequest, pageAgeMs: 999999 }), false,
  'permissionContext: pageAgeMs must NOT participate in the relation');

// --- assessConsistency: the unevaluable -> indeterminate path --------------

const ALL_MODULE_IDS: readonly ModuleId[] = [
  'url', 'ssl', 'dns', 'redirect', 'loginForm',
  'javascript', 'homograph', 'authContext', 'downloadContext', 'permissionContext',
];

for (const moduleId of ALL_MODULE_IDS) {
  const unevaluable = {
    moduleId,
    evaluationId: `test-${moduleId}`,
    result: { status: 'unevaluable', reason: 'required_evidence_not_collected' },
  } as ModuleDispatchResult;
  assert.equal(assessConsistency(unevaluable), 'indeterminate',
    `${moduleId}: an unevaluable result must always assess indeterminate`);
}

// --- assessConsistency: evaluated results route to the right predicate -----

assert.equal(
  assessConsistency({ moduleId: 'url', evaluationId: 'x', result: { status: 'evaluated', findings: urlOk } }),
  'consistent', 'assessConsistency: coherent url findings -> consistent');
assert.equal(
  assessConsistency({
    moduleId: 'url', evaluationId: 'x',
    result: { status: 'evaluated', findings: { ...urlOk, isIpLiteral: true } },
  }),
  'inconsistent', 'assessConsistency: contradictory url findings -> inconsistent');
assert.equal(
  assessConsistency({
    moduleId: 'authContext', evaluationId: 'x',
    result: { status: 'evaluated', findings: { ...authPresentOrigin, storeAvailable: false } },
  }),
  'inconsistent', 'assessConsistency: authContext storeAvailable false -> inconsistent');
assert.equal(
  assessConsistency({
    moduleId: 'ssl', evaluationId: 'x',
    result: { status: 'evaluated', findings: { ...sslPlainHttp, chainTrusted: true } },
  }),
  'inconsistent', 'assessConsistency: ssl httpsEstablished false + chainTrusted true -> inconsistent');

console.log('all consistency fixture assertions passed');
