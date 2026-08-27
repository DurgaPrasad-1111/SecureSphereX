/**
 * Fixture test for the Redirect Evaluation Module (§2.6, module 4).
 *
 * No test runner is wired up in this repo yet (package.json's test:fixtures
 * script covers fixtures/, not per-module tests). Run directly:
 *   node --experimental-strip-types packages/engine/modules/redirect.fixture.test.ts
 * Exits 0 and prints "all redirect module fixture assertions passed" on
 * success; throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { present, absent, notCollected } from '../../contracts/evidence.contract.v1.ts';
import type { RedirectEvidence } from '../../contracts/evidence.contract.v1.ts';
import { computeRedirectFindings } from './redirect.ts';

// --- Case 1: no redirect — direct arrival (fixtures/clean-login.ts shape) --

const directArrival: RedirectEvidence = {
  initialUrl: present('https://accounts.example.com/login'),
  finalUrl: present('https://accounts.example.com/login'),
  chain: absent(),
  hopCount: present(0),
  crossedRegistrableDomain: absent(),
};

const directResult = computeRedirectFindings(directArrival);
assert.deepEqual(directResult, {
  status: 'evaluated',
  findings: {
    hopCount: 0,
    initialRegistrableDomain: null,
    finalRegistrableDomain: null,
    mechanisms: [],
    chainLength: 0,
  },
});

// --- Case 2: single-hop SSO chain (fixtures/sso-flow.ts shape) -------------

const ssoChain: RedirectEvidence = {
  initialUrl: present('https://app.example.com/dashboard'),
  finalUrl: present('https://login.idp-example.com/authorize?client_id=app'),
  chain: present([
    {
      fromUrl: 'https://app.example.com/dashboard',
      toUrl: 'https://login.idp-example.com/authorize?client_id=app',
      statusCode: 302,
      mechanism: 'http_3xx',
    },
  ]),
  hopCount: present(1),
  crossedRegistrableDomain: present(true),
};

const ssoResult = computeRedirectFindings(ssoChain);
assert.equal(ssoResult.status, 'evaluated');
if (ssoResult.status === 'evaluated') {
  assert.equal(ssoResult.findings.hopCount, 1);
  assert.equal(ssoResult.findings.chainLength, 1);
  assert.deepEqual(ssoResult.findings.mechanisms, ['http_3xx']);
  // DEFECT-19: always null, regardless of a real, present, cross-domain chain.
  assert.equal(ssoResult.findings.initialRegistrableDomain, null);
  assert.equal(ssoResult.findings.finalRegistrableDomain, null);
}

// --- Case 3: multi-hop, mixed-mechanism chain -------------------------------

const multiHop: RedirectEvidence = {
  initialUrl: present('http://bit.ly/xyz123'),
  finalUrl: present('https://secure-login-verify.evil.tld/account'),
  chain: present([
    {
      fromUrl: 'http://bit.ly/xyz123',
      toUrl: 'http://track.adnetwork.example/click?id=1',
      statusCode: 301,
      mechanism: 'http_3xx',
    },
    {
      fromUrl: 'http://track.adnetwork.example/click?id=1',
      toUrl: 'https://secure-login-verify.evil.tld/landing',
      statusCode: null,
      mechanism: 'meta_refresh',
    },
    {
      fromUrl: 'https://secure-login-verify.evil.tld/landing',
      toUrl: 'https://secure-login-verify.evil.tld/account',
      statusCode: null,
      mechanism: 'javascript',
    },
  ]),
  hopCount: present(3),
  crossedRegistrableDomain: present(true),
};

const multiHopResult = computeRedirectFindings(multiHop);
assert.equal(multiHopResult.status, 'evaluated');
if (multiHopResult.status === 'evaluated') {
  assert.equal(multiHopResult.findings.hopCount, 3);
  assert.equal(multiHopResult.findings.chainLength, 3);
  assert.deepEqual(multiHopResult.findings.mechanisms, ['http_3xx', 'meta_refresh', 'javascript']);
}

// --- Case 4: missing evidence — hopCount itself not collected --------------

const noHopCount: RedirectEvidence = {
  initialUrl: present('https://accounts.example.com/login'),
  finalUrl: present('https://accounts.example.com/login'),
  chain: absent(),
  hopCount: notCollected('collector_error'),
  crossedRegistrableDomain: absent(),
};

const noHopCountResult = computeRedirectFindings(noHopCount);
assert.deepEqual(noHopCountResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 5: missing evidence — chain not collected (distinct from absent) -

const chainNotCollected: RedirectEvidence = {
  initialUrl: present('https://accounts.example.com/login'),
  finalUrl: present('https://accounts.example.com/login'),
  chain: notCollected('tier_not_reached'),
  hopCount: present(0),
  crossedRegistrableDomain: absent(),
};

const chainNotCollectedResult = computeRedirectFindings(chainNotCollected);
assert.deepEqual(chainNotCollectedResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

console.log('all redirect module fixture assertions passed');
