/**
 * Fixture test for the Login Form Evaluation Module (§2.6, module 5).
 *
 * No test runner is wired up in this repo yet (package.json's test:fixtures
 * script is still a stub). Run directly:
 *   node --experimental-strip-types packages/engine/modules/loginForm.fixture.test.ts
 * Exits 0 and prints "all loginForm module fixture assertions passed" on
 * success; throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { present, absent, notCollected } from '../../contracts/evidence.contract.v1.ts';
import type { LoginInterfaceEvidence } from '../../contracts/evidence.contract.v1.ts';
import { computeLoginFormFindings } from './loginForm.ts';

// --- Case 1: happy path, single credential form -----------------------------

const singleForm: LoginInterfaceEvidence = {
  credentialFormPresent: present(true),
  forms: present([
    {
      fields: [{ kind: 'password', hidden: false, autocompleteDisabled: false }],
      method: 'POST',
      actionUrl: 'https://evil.tld/collect',
      actionRegistrableDomain: 'evil.tld',
      injectedAfterLoad: false,
      injectingScriptOrigin: null,
    },
  ]),
  // fingerprint is irrelevant to LoginFormFindings and must not affect
  // evaluability — populated fully here to demonstrate that, and notCollected
  // in later cases to demonstrate it again under a different state.
  fingerprint: present({
    fingerprintAlgorithmVersion: '1.0.0',
    fieldComposition: ['password'],
    titleTokens: ['login'],
    faviconHash: null,
    heroImagePerceptualHash: null,
    dominantColors: [],
  }),
};

const singleResult = computeLoginFormFindings(singleForm);
assert.deepEqual(singleResult, {
  status: 'evaluated',
  findings: {
    credentialFormPresent: true,
    forms: [
      {
        fieldKinds: ['password'],
        method: 'POST',
        actionRegistrableDomain: 'evil.tld',
        hasHiddenCredentialField: false,
        hasAutocompleteDisabledCredential: false,
        injectedAfterLoad: false,
      },
    ],
    // Always null — see loginForm.ts's header comment and DEFECT-15.
    pageRegistrableDomain: null,
  },
});

// --- Case 2: the array case — multiple forms, correct per-form derivation --
//
// Three forms in one page: one with a hidden credential field, one with an
// autocomplete-disabled credential field, and one with zero credential
// fields at all (empty fields array) — covers the "multiple forms" and
// "zero-field form" requirements in a single, realistic multi-form page.

const multiForm: LoginInterfaceEvidence = {
  credentialFormPresent: present(true),
  forms: present([
    {
      // Form A: hidden field present, nothing autocomplete-disabled.
      fields: [
        { kind: 'username', hidden: false, autocompleteDisabled: false },
        { kind: 'password', hidden: true, autocompleteDisabled: false },
      ],
      method: 'POST',
      actionUrl: 'https://accounts.example.com/login',
      actionRegistrableDomain: 'example.com',
      injectedAfterLoad: false,
      injectingScriptOrigin: null,
    },
    {
      // Form B: autocomplete-disabled field present, nothing hidden.
      fields: [{ kind: 'otp', hidden: false, autocompleteDisabled: true }],
      method: 'POST',
      actionUrl: 'https://accounts.example.com/otp',
      actionRegistrableDomain: 'example.com',
      injectedAfterLoad: true,
      injectingScriptOrigin: 'https://cdn.example.com',
    },
    {
      // Form C: zero credential fields at all — e.g. a newsletter signup
      // form on the same page. Both booleans must come back false, and
      // fieldKinds must come back an empty array, not throw.
      fields: [],
      method: 'GET',
      actionUrl: 'https://example.com/subscribe',
      actionRegistrableDomain: 'example.com',
      injectedAfterLoad: false,
      injectingScriptOrigin: null,
    },
  ]),
  fingerprint: notCollected('tier_not_reached'),
};

const multiResult = computeLoginFormFindings(multiForm);
assert.equal(multiResult.status, 'evaluated');
if (multiResult.status === 'evaluated') {
  assert.equal(multiResult.findings.forms.length, 3);

  const [formA, formB, formC] = multiResult.findings.forms;

  assert.deepEqual(formA, {
    fieldKinds: ['username', 'password'],
    method: 'POST',
    actionRegistrableDomain: 'example.com',
    hasHiddenCredentialField: true,
    hasAutocompleteDisabledCredential: false,
    injectedAfterLoad: false,
  });

  assert.deepEqual(formB, {
    fieldKinds: ['otp'],
    method: 'POST',
    actionRegistrableDomain: 'example.com',
    hasHiddenCredentialField: false,
    hasAutocompleteDisabledCredential: true,
    injectedAfterLoad: true,
  });

  // Case 3 (zero-field form), folded into the array case as form C.
  assert.deepEqual(formC, {
    fieldKinds: [],
    method: 'GET',
    actionRegistrableDomain: 'example.com',
    hasHiddenCredentialField: false,
    hasAutocompleteDisabledCredential: false,
    injectedAfterLoad: false,
  });
}

// --- Case 4: legitimate negative finding — no credential form on the page --

const cleanPage: LoginInterfaceEvidence = {
  credentialFormPresent: present(false),
  forms: present([]),
  fingerprint: notCollected('tier_not_reached'),
};

const cleanResult = computeLoginFormFindings(cleanPage);
assert.deepEqual(cleanResult, {
  status: 'evaluated',
  findings: {
    credentialFormPresent: false,
    forms: [],
    pageRegistrableDomain: null,
  },
});

// --- Case 5: missing evidence — credentialFormPresent not collected --------

const noCredentialFormPresent: LoginInterfaceEvidence = {
  credentialFormPresent: notCollected('collector_error'),
  forms: present([]),
  fingerprint: notCollected('tier_not_reached'),
};

const missing1Result = computeLoginFormFindings(noCredentialFormPresent);
assert.deepEqual(missing1Result, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 6: missing evidence — forms not collected -------------------------

const noForms: LoginInterfaceEvidence = {
  credentialFormPresent: present(true),
  forms: notCollected('tier_not_reached'),
  fingerprint: notCollected('tier_not_reached'),
};

const missing2Result = computeLoginFormFindings(noForms);
assert.deepEqual(missing2Result, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 7: forms genuinely absent (not notCollected) still unevaluable ---
//
// evidence.contract.v1.ts gives no producer-side meaning for `forms: absent()`
// distinct from `forms: present([])` — treating it as unevaluable rather than
// guessing it means "zero forms" follows url.ts's precedent of never
// defaulting a non-`present` observation on a non-nullable output field.

const formsAbsent: LoginInterfaceEvidence = {
  credentialFormPresent: present(false),
  forms: absent(),
  fingerprint: notCollected('tier_not_reached'),
};

const absentFormsResult = computeLoginFormFindings(formsAbsent);
assert.deepEqual(absentFormsResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

console.log('all loginForm module fixture assertions passed');
