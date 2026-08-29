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
    // Always [] — see javascript.ts's header comment and DEFECT-18. Not
    // derived from transmissionEndpoints even though it's present here.
    transmissionEndpointDomains: [],
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

// --- Case 4: absent on the two UNGATED fields — module still evaluates -----
//
// transmissionEndpoints and dynamicScriptOrigins are never gated (see
// javascript.ts's function-level comment: transmissionEndpointDomains and
// injectingScriptOriginDomain are unconditional structural gaps regardless
// of what these two Observations report). Confirms that holds even when
// both are absent(), not just notCollected or present.

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

console.log('all javascript module fixture assertions passed');
