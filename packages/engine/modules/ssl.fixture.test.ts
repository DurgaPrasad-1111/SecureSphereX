/**
 * Fixture test for the SSL Evaluation Module (§2.6, module 2). DEC-5 stub —
 * kept narrow, matching the module's own scope.
 *
 * No test runner is wired up in this repo yet (package.json's test:fixtures
 * script covers fixtures/, not per-module tests). Run directly:
 *   node --experimental-strip-types packages/engine/modules/ssl.fixture.test.ts
 * Exits 0 and prints "all ssl module fixture assertions passed" on success;
 * throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { present, absent, notCollected } from '../../contracts/evidence.contract.v1.ts';
import type { TransportEvidence } from '../../contracts/evidence.contract.v1.ts';
import { computeSslFindings } from './ssl.ts';

// --- Case 1: extension-collected evidence (fixtures/clean-login.ts shape) --
// The extension cannot observe chain data at all (ProducerCapabilityManifest:
// chainComplete/chainTrusted are 0/6, api_unavailable) — genuinely unevaluable.

const extensionCollected: TransportEvidence = {
  isHttps: present(true),
  certificateSubject: notCollected('api_unavailable'),
  subjectAlternativeNames: notCollected('api_unavailable'),
  validFrom: notCollected('api_unavailable'),
  validTo: notCollected('api_unavailable'),
  issuer: notCollected('api_unavailable'),
  chainComplete: notCollected('api_unavailable'),
  chainTrusted: notCollected('api_unavailable'),
};

const extensionResult = computeSslFindings(extensionCollected);
assert.deepEqual(extensionResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 2: capture-harness-collected evidence — chain data IS available --

const captureHarnessCollected: TransportEvidence = {
  isHttps: present(true),
  certificateSubject: present('CN=accounts.example.com'),
  subjectAlternativeNames: present(['accounts.example.com']),
  validFrom: present('2026-01-01'),
  validTo: present('2027-01-01'),
  issuer: present('Example CA'),
  chainComplete: present(true),
  chainTrusted: present(true),
};

const captureResult = computeSslFindings(captureHarnessCollected);
assert.deepEqual(captureResult, {
  status: 'evaluated',
  findings: {
    httpsEstablished: true,
    certificateCurrentlyValid: null,
    chainComplete: true,
    chainTrusted: true,
    subjectMatchesHost: null,
    daysUntilExpiry: null,
  },
});

// --- Case 3: chain looked-for and genuinely absent (self-signed / plain) ---

const noChain: TransportEvidence = {
  isHttps: present(false),
  certificateSubject: absent(),
  subjectAlternativeNames: absent(),
  validFrom: absent(),
  validTo: absent(),
  issuer: absent(),
  chainComplete: absent(),
  chainTrusted: absent(),
};

const noChainResult = computeSslFindings(noChain);
assert.deepEqual(noChainResult, {
  status: 'evaluated',
  findings: {
    httpsEstablished: false,
    certificateCurrentlyValid: null,
    chainComplete: null,
    chainTrusted: null,
    subjectMatchesHost: null,
    daysUntilExpiry: null,
  },
});

// --- Case 4: missing evidence — isHttps itself not collected ---------------

const noScheme: TransportEvidence = {
  isHttps: notCollected('collector_error'),
  certificateSubject: absent(),
  subjectAlternativeNames: absent(),
  validFrom: absent(),
  validTo: absent(),
  issuer: absent(),
  chainComplete: absent(),
  chainTrusted: absent(),
};

const noSchemeResult = computeSslFindings(noScheme);
assert.deepEqual(noSchemeResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

console.log('all ssl module fixture assertions passed');
