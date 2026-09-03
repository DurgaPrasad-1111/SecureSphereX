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
  initialRegistrableDomain: present('example.com'),
  finalRegistrableDomain: present('example.com'),
  chain: absent(),
  hopCount: present(0),
  crossedRegistrableDomain: absent(),
};

const directResult = computeRedirectFindings(directArrival);
// DEFECT-19 RESOLVED: the two domain fields now carry the producer-derived
// values, not null. Same-site (example.com == example.com) — CRED-04's
// notSameSite conjunct would be a noMatch on these.
assert.deepEqual(directResult, {
  status: 'evaluated',
  findings: {
    hopCount: 0,
    initialRegistrableDomain: 'example.com',
    finalRegistrableDomain: 'example.com',
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
  initialRegistrableDomain: present('example.com'),
  finalRegistrableDomain: present('idp-example.com'),
  hopCount: present(1),
  crossedRegistrableDomain: present(true),
};

const ssoResult = computeRedirectFindings(ssoChain);
assert.equal(ssoResult.status, 'evaluated');
if (ssoResult.status === 'evaluated') {
  assert.equal(ssoResult.findings.hopCount, 1);
  assert.equal(ssoResult.findings.chainLength, 1);
  assert.deepEqual(ssoResult.findings.mechanisms, ['http_3xx']);
  // DEFECT-19 RESOLVED: real cross-domain values now flow through. This is a
  // genuinely cross-registrable-domain chain (example.com -> idp-example.com);
  // CRED-04's notSameSite conjunct would MATCH here — but this fixture has
  // hopCount 1 < redirect_hop_min (2), so CRED-04 still does not fire. The
  // module's job is only to project the domains faithfully, which it now does.
  assert.equal(ssoResult.findings.initialRegistrableDomain, 'example.com');
  assert.equal(ssoResult.findings.finalRegistrableDomain, 'idp-example.com');
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
  initialRegistrableDomain: present('bit.ly'),
  finalRegistrableDomain: present('evil.tld'),
  hopCount: present(3),
  crossedRegistrableDomain: present(true),
};

const multiHopResult = computeRedirectFindings(multiHop);
assert.equal(multiHopResult.status, 'evaluated');
if (multiHopResult.status === 'evaluated') {
  assert.equal(multiHopResult.findings.hopCount, 3);
  assert.equal(multiHopResult.findings.chainLength, 3);
  assert.deepEqual(multiHopResult.findings.mechanisms, ['http_3xx', 'meta_refresh', 'javascript']);
  // Cross-domain, 3 hops — the exact shape CRED-04 targets.
  assert.equal(multiHopResult.findings.initialRegistrableDomain, 'bit.ly');
  assert.equal(multiHopResult.findings.finalRegistrableDomain, 'evil.tld');
}

// --- Case 4: missing evidence — hopCount itself not collected --------------

const noHopCount: RedirectEvidence = {
  initialUrl: present('https://accounts.example.com/login'),
  finalUrl: present('https://accounts.example.com/login'),
  initialRegistrableDomain: present('example.com'),
  finalRegistrableDomain: present('example.com'),
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
  initialRegistrableDomain: present('example.com'),
  finalRegistrableDomain: present('example.com'),
  chain: notCollected('tier_not_reached'),
  hopCount: present(0),
  crossedRegistrableDomain: absent(),
};

const chainNotCollectedResult = computeRedirectFindings(chainNotCollected);
assert.deepEqual(chainNotCollectedResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 6: a registrable-domain field notCollected -> unevaluable --------
// New gate (mirrors url.ts): notCollected on either domain makes the whole
// evaluation unevaluable, exactly as notCollected on url.registrableDomain does.

const domainNotCollected: RedirectEvidence = {
  initialUrl: present('https://a.example.com/'),
  finalUrl: present('https://b.other.tld/'),
  initialRegistrableDomain: notCollected('collector_error'),
  finalRegistrableDomain: present('other.tld'),
  chain: present([]),
  hopCount: present(0),
  crossedRegistrableDomain: notCollected('collector_error'),
};
assert.deepEqual(computeRedirectFindings(domainNotCollected), {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 7: a registrable-domain field absent -> null in findings ---------
// absent is a real "no eTLD+1" finding (IP literal / bare suffix), mapped to
// null exactly as url.ts maps its own absent registrableDomain.

const domainAbsent: RedirectEvidence = {
  initialUrl: present('http://192.0.2.44/'),
  finalUrl: present('https://evil.tld/'),
  initialRegistrableDomain: absent(),
  finalRegistrableDomain: present('evil.tld'),
  chain: present([]),
  hopCount: present(0),
  crossedRegistrableDomain: notCollected('collector_error'),
};
const absentResult = computeRedirectFindings(domainAbsent);
assert.equal(absentResult.status, 'evaluated');
if (absentResult.status === 'evaluated') {
  assert.equal(absentResult.findings.initialRegistrableDomain, null);
  assert.equal(absentResult.findings.finalRegistrableDomain, 'evil.tld');
}

console.log('all redirect module fixture assertions passed');
