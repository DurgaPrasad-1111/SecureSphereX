/**
 * Fixture test for the JavaScript Evaluation Module (§2.6, module 6).
 *
 * No test runner is wired up in this repo yet (package.json's test:fixtures
 * script is still a stub). Run directly:
 *   node --experimental-strip-types packages/engine/modules/javascript.fixture.test.ts
 * Exits 0 and prints "all javascript module fixture assertions passed" on
 * success; throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { present, absent, notCollected } from '../../contracts/evidence.contract.v1.ts';
import type { ScriptRuntimeEvidence } from '../../contracts/evidence.contract.v1.ts';
import { computeJavaScriptFindings } from './javascript.ts';

// --- Case 1: happy path, script-mediated exfiltration -----------------------

const exfiltration: ScriptRuntimeEvidence = {
  listenerOnCredentialField: present(true),
  clientSideTransmissionObserved: present(true),
  transmissionEndpoints: present(['https://exfil.evil.tld/collect']),
  // Producer-derived eTLD+1 of the endpoint above. Pre-extracted per the
  // Amendment B contract: the module MUST NOT derive this itself (§2.6, E-4).
  transmissionEndpointDomains: present(['evil.tld']),
  dynamicScriptLoadCount: present(3),
  dynamicScriptOrigins: present(['https://cdn.example.com']),
  credentialInterfaceInjected: present(false),
};

const exfilResult = computeJavaScriptFindings(exfiltration);
assert.deepEqual(exfilResult, {
  status: 'evaluated',
  findings: {
    listenerOnCredentialField: true,
    clientSideTransmissionObserved: true,
    // DEFECT-18 engine-consumption fix: now THREADS the producer-derived
    // domain through (present -> value), no longer hardcoded []. The module
    // projects evidence.transmissionEndpointDomains; it does not derive it.
    transmissionEndpointDomains: ['evil.tld'],
    dynamicScriptLoadCount: 3,
    credentialInterfaceInjected: false,
    // Always null — see below (case 2 tests this more adversarially).
    injectingScriptOriginDomain: null,
  },
});

// --- Case 2: the adversarial injection case ---------------------------------
//
// credentialInterfaceInjected is TRUE and dynamicScriptOrigins carries real,
// plausible-looking data — exactly the situation where a naive
// implementation might be tempted to guess (e.g. "just pick the first
// origin" or "pick the only origin"). Testing the ACTUAL behavior, not a
// guessed one: injectingScriptOriginDomain must still come back null,
// because dynamicScriptOrigins has no field linking any entry to
// credentialInterfaceInjected, and the real linking data
// (LoginFormObservation.injectingScriptOrigin) lives in a different
// evidence category this module cannot read (§2.6).

const adversarialInjection: ScriptRuntimeEvidence = {
  listenerOnCredentialField: present(false),
  clientSideTransmissionObserved: present(false),
  transmissionEndpoints: present([]),
  // Observed, and empty — present([]) not absent(), the same I-2 distinction
  // homograph.ts's header draws for scriptsUsed.
  transmissionEndpointDomains: present([]),
  dynamicScriptLoadCount: present(1),
  // A single, unambiguous-looking origin — the case most likely to tempt a
  // "just use dynamicScriptOrigins[0]" shortcut.
  dynamicScriptOrigins: present(['https://cdn.attacker.tld']),
  credentialInterfaceInjected: present(true),
};

const adversarialResult = computeJavaScriptFindings(adversarialInjection);
assert.equal(adversarialResult.status, 'evaluated');
if (adversarialResult.status === 'evaluated') {
  assert.equal(adversarialResult.findings.credentialInterfaceInjected, true);
  // The actual, confirmed behavior: still null. Not derived from
  // dynamicScriptOrigins under any circumstance, including this one.
  assert.equal(adversarialResult.findings.injectingScriptOriginDomain, null);
}

// --- Case 3: missing evidence — a gated field not collected -----------------

const noLoadCount: ScriptRuntimeEvidence = {
  listenerOnCredentialField: present(true),
  clientSideTransmissionObserved: present(true),
  transmissionEndpoints: present(['https://exfil.evil.tld/collect']),
  // Producer-derived eTLD+1 of the endpoint above. Pre-extracted per the
  // Amendment B contract: the module MUST NOT derive this itself (§2.6, E-4).
  transmissionEndpointDomains: present(['evil.tld']),
  dynamicScriptLoadCount: notCollected('tier_not_reached'),
  dynamicScriptOrigins: present([]),
  credentialInterfaceInjected: present(false),
};

const missingResult = computeJavaScriptFindings(noLoadCount);
assert.deepEqual(missingResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 4: absent on transmission fields — module still evaluates, [] ----
//
// transmissionEndpoints and dynamicScriptOrigins are never gated. After the
// DEFECT-18 fix, transmissionEndpointDomains IS gated — but only on
// notCollected; absent() is legitimate ("looked, no endpoints") and maps to
// [], exactly as redirect.ts treats its `chain`. Confirms the module still
// evaluates and reports [] when all three are absent().

const bothAbsent: ScriptRuntimeEvidence = {
  listenerOnCredentialField: present(false),
  clientSideTransmissionObserved: present(false),
  transmissionEndpoints: absent(),
  // Mirrors the sibling: no endpoints observed, so no domains to derive.
  transmissionEndpointDomains: absent(),
  dynamicScriptLoadCount: present(0),
  dynamicScriptOrigins: absent(),
  credentialInterfaceInjected: present(false),
};

const bothAbsentResult = computeJavaScriptFindings(bothAbsent);
assert.deepEqual(bothAbsentResult, {
  status: 'evaluated',
  findings: {
    listenerOnCredentialField: false,
    clientSideTransmissionObserved: false,
    transmissionEndpointDomains: [],
    dynamicScriptLoadCount: 0,
    credentialInterfaceInjected: false,
    injectingScriptOriginDomain: null,
  },
});

// --- Case 5: absent on a GATED field — still unevaluable, not guessed false -
//
// Matches url.ts's and loginForm.ts's precedent: a plain (non-nullable)
// boolean field has no clean distinction between "absent" and "present
// false" — a producer reporting absent() here is a producer defect, not a
// genuine negative finding, so it is treated the same as notCollected.
// Confirmed here, not assumed.

const gatedFieldAbsent: ScriptRuntimeEvidence = {
  listenerOnCredentialField: present(true),
  clientSideTransmissionObserved: absent(),
  transmissionEndpoints: present(['https://exfil.evil.tld/collect']),
  // Producer-derived eTLD+1 of the endpoint above. Pre-extracted per the
  // Amendment B contract: the module MUST NOT derive this itself (§2.6, E-4).
  transmissionEndpointDomains: present(['evil.tld']),
  dynamicScriptLoadCount: present(2),
  dynamicScriptOrigins: present([]),
  credentialInterfaceInjected: present(false),
};

const gatedAbsentResult = computeJavaScriptFindings(gatedFieldAbsent);
assert.deepEqual(gatedAbsentResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 6: CRED-A1 reproducible record ------------------------------------
//
// A reproducible record of CRED-A1's current firing status, not just a
// defect-log claim. CRED-A1's live predicate (rulesets/rules-v0.1.0.json,
// internally versioned rules-v0.2.0) is:
//
//   and(
//     is(javascript.credentialInterfaceInjected),
//     exists(loginForm.forms, is($.injectedAfterLoad)),
//     notSameSite(javascript.injectingScriptOriginDomain, url.registrableDomain)
//   )
//
// Tonight's DEFECT-15 fix made the right-hand side of that notSameSite
// (url.registrableDomain) real and groundable. This module now confirms
// the left-hand side, javascript.injectingScriptOriginDomain, independently:
// even in the single most favorable case for CRED-A1 — a real injection
// event, with plausible dynamicScriptOrigins data present — this module's
// own findings still report injectingScriptOriginDomain: null.
//
// Record: as of this commit, CRED-A1's notSameSite predicate always
// receives null as its left operand, regardless of what the javascript
// module actually observes. This is confirmed directly from this module's
// real output on realistic input, not inferred from the rule-set alone.

const cred_A1_scenario: ScriptRuntimeEvidence = {
  listenerOnCredentialField: present(false),
  clientSideTransmissionObserved: present(false),
  transmissionEndpoints: present([]),
  // Observed, and empty — present([]) not absent(), the same I-2 distinction
  // homograph.ts's header draws for scriptsUsed.
  transmissionEndpointDomains: present([]),
  dynamicScriptLoadCount: present(1),
  dynamicScriptOrigins: present(['https://cdn.attacker.tld']),
  credentialInterfaceInjected: present(true),
};

const cred_A1_findings = computeJavaScriptFindings(cred_A1_scenario);
assert.equal(cred_A1_findings.status, 'evaluated');
if (cred_A1_findings.status === 'evaluated') {
  assert.equal(
    cred_A1_findings.findings.injectingScriptOriginDomain,
    null,
    'RECORD: CRED-A1\'s notSameSite left operand (javascript.injectingScriptOriginDomain) ' +
    'is confirmed null even under a real injection event with real dynamicScriptOrigins data. ' +
    'Combined with the requiredModules/predicate check above, CRED-A1 remains structurally ' +
    'unable to ground both sides of its own comparison as of this commit.'
  );
}

// --- Case 7: DEFECT-18 fix — real domains thread through, multi-endpoint ----
//
// The direct proof of the engine-consumption fix: when the module is
// evaluable and evidence carries producer-resolved domains, they appear in
// the findings verbatim and in producer order — no longer the hardcoded [].
// This is the operand CRED-05's `exists(transmissionEndpointDomains,
// notSameSite($, url.registrableDomain))` reads; it is no longer vacuously
// empty.

const multiEndpoint: ScriptRuntimeEvidence = {
  listenerOnCredentialField: present(true),
  clientSideTransmissionObserved: present(true),
  transmissionEndpoints: present([
    'https://collect.evil.tld/a', 'https://beacon.tracker.example/b',
  ]),
  transmissionEndpointDomains: present(['evil.tld', 'tracker.example']),
  dynamicScriptLoadCount: present(2),
  dynamicScriptOrigins: present([]),
  credentialInterfaceInjected: present(false),
};

const multiResult = computeJavaScriptFindings(multiEndpoint);
assert.equal(multiResult.status, 'evaluated');
if (multiResult.status === 'evaluated') {
  assert.deepEqual(
    multiResult.findings.transmissionEndpointDomains,
    ['evil.tld', 'tracker.example'],
    'DEFECT-18 fix: producer-resolved transmissionEndpointDomains now thread ' +
    'through the module verbatim (was hardcoded [] before this commit).',
  );
}

// --- Case 8: the fix does NOT change the clientSideTransmissionObserved gate -
//
// The whole point of the user's guardrail: this fix removes a SECOND
// structural blocker (the hardcoded []) that sat behind the transmission
// gate — it must not disturb that gate. Here transmissionEndpointDomains is
// fully present with real domains, yet clientSideTransmissionObserved is
// notCollected (its live state today, Tier 4). The module MUST still be
// unevaluable — the transmission-observation gate still governs.

const transmissionGateStillClosed: ScriptRuntimeEvidence = {
  listenerOnCredentialField: present(true),
  clientSideTransmissionObserved: notCollected('tier_not_reached'),
  transmissionEndpoints: present(['https://collect.evil.tld/a']),
  transmissionEndpointDomains: present(['evil.tld']),
  dynamicScriptLoadCount: present(2),
  dynamicScriptOrigins: present([]),
  credentialInterfaceInjected: present(false),
};

assert.deepEqual(
  computeJavaScriptFindings(transmissionGateStillClosed),
  { status: 'unevaluable', reason: 'required_evidence_not_collected' },
  'DEFECT-18 fix must NOT open the clientSideTransmissionObserved gate: the ' +
  'module stays unevaluable while that Tier-4 field is notCollected, even ' +
  'with transmissionEndpointDomains fully present.',
);

// --- Case 9: the NEW gate — transmissionEndpointDomains notCollected --------
//
// I-2 discipline: a notCollected domain field must make the evaluation
// unevaluable, never be fabricated to []. (absent() -> [] is Case 4; this is
// the notCollected sibling, and it gates.)

const domainsNotCollected: ScriptRuntimeEvidence = {
  listenerOnCredentialField: present(true),
  clientSideTransmissionObserved: present(true),
  transmissionEndpoints: present(['https://collect.evil.tld/a']),
  transmissionEndpointDomains: notCollected('tier_not_reached'),
  dynamicScriptLoadCount: present(2),
  dynamicScriptOrigins: present([]),
  credentialInterfaceInjected: present(false),
};

assert.deepEqual(
  computeJavaScriptFindings(domainsNotCollected),
  { status: 'unevaluable', reason: 'required_evidence_not_collected' },
  'notCollected transmissionEndpointDomains must gate to unevaluable (I-2), ' +
  'never be fabricated to [].',
);

console.log('all javascript module fixture assertions passed');
