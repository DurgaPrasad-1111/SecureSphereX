/**
 * Fixture test for the URL Evaluation Module (§2.6, module 1).
 *
 * No test runner is wired up in this repo yet (package.json's test:fixtures
 * script is still a stub). Run directly:
 *   node --experimental-strip-types packages/engine/modules/url.fixture.test.ts
 * Exits 0 and prints "all url module fixture assertions passed" on success;
 * throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { present, absent, notCollected } from '../../contracts/evidence.contract.v1.ts';
import type { UrlEvidence } from '../../contracts/evidence.contract.v1.ts';
import { computeUrlFindings } from './url.ts';

// --- Case 1: happy path, ordinary same-site login URL ----------------------

const cleanLoginUrl: UrlEvidence = {
  fullUrl: present('https://accounts.example.com/login'),
  scheme: present('https'),
  host: present('accounts.example.com'),
  port: present(443),
  path: present('/login'),
  queryPresent: present(false),
  registrableDomain: present('example.com'),
  subdomainLabels: present(['accounts']),
  isIpLiteral: present(false),
  totalLength: present(38),
  percentEncodedSegmentCount: present(0),
};

const cleanResult = computeUrlFindings(cleanLoginUrl);
assert.equal(cleanResult.status, 'evaluated');
assert.deepEqual(cleanResult, {
  status: 'evaluated',
  findings: {
    scheme: 'https',
    isSecureScheme: true,
    registrableDomain: 'example.com',
    subdomainDepth: 1,
    isIpLiteral: false,
    totalLength: 38,
    suspiciousKeywordCount: 2,          // "login" (path) + "account" (substring of "accounts")
    percentEncodedSegmentCount: 0,
    specialCharacterDensity: 0,          // no non-ordinary characters
  },
});

// --- Case 2: suspicious-keyword-heavy, non-HTTPS, percent-encoded URL ------

const phishy: UrlEvidence = {
  fullUrl: present('http://paypal.com@secure-login-verify.evil.tld/account/update?x=%20%20'),
  scheme: present('http'),
  host: present('secure-login-verify.evil.tld'),
  port: present(80),
  path: present('/account/update'),
  queryPresent: present(true),
  registrableDomain: present('evil.tld'),
  subdomainLabels: present(['secure-login-verify']),
  isIpLiteral: present(false),
  totalLength: present(66),
  percentEncodedSegmentCount: present(2),
};

const phishyResult = computeUrlFindings(phishy);
assert.equal(phishyResult.status, 'evaluated');
if (phishyResult.status === 'evaluated') {
  assert.equal(phishyResult.findings.isSecureScheme, false);
  // secure, login, verify, account, update
  assert.equal(phishyResult.findings.suspiciousKeywordCount, 5);
  assert.equal(phishyResult.findings.percentEncodedSegmentCount, 2);
  assert.ok(phishyResult.findings.specialCharacterDensity > 0);
}

// --- Case 3: IP-literal URL — registrableDomain genuinely absent -----------

const ipLiteral: UrlEvidence = {
  fullUrl: present('http://192.0.2.10/login'),
  scheme: present('http'),
  host: present('192.0.2.10'),
  port: present(80),
  path: present('/login'),
  queryPresent: present(false),
  registrableDomain: absent(),
  subdomainLabels: present([]),
  isIpLiteral: present(true),
  totalLength: present(24),
  percentEncodedSegmentCount: present(0),
};

const ipResult = computeUrlFindings(ipLiteral);
assert.equal(ipResult.status, 'evaluated');
if (ipResult.status === 'evaluated') {
  assert.equal(ipResult.findings.registrableDomain, null);
  assert.equal(ipResult.findings.isIpLiteral, true);
  assert.equal(ipResult.findings.subdomainDepth, 0);
}

// --- Case 4: missing evidence — Tier 0/1, network-derived field not collected

const tier0Partial: UrlEvidence = {
  fullUrl: present('https://accounts.example.com/login'),
  scheme: present('https'),
  host: present('accounts.example.com'),
  port: present(443),
  path: present('/login'),
  queryPresent: present(false),
  registrableDomain: notCollected('tier_not_reached'),
  subdomainLabels: present(['accounts']),
  isIpLiteral: present(false),
  totalLength: present(38),
  percentEncodedSegmentCount: present(0),
};

const partialResult = computeUrlFindings(tier0Partial);
assert.deepEqual(partialResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 5: missing evidence — a foundational field itself not collected --

const noScheme: UrlEvidence = {
  fullUrl: present('https://accounts.example.com/login'),
  scheme: notCollected('collector_error'),
  host: present('accounts.example.com'),
  port: present(443),
  path: present('/login'),
  queryPresent: present(false),
  registrableDomain: present('example.com'),
  subdomainLabels: present(['accounts']),
  isIpLiteral: present(false),
  totalLength: present(38),
  percentEncodedSegmentCount: present(0),
};

const noSchemeResult = computeUrlFindings(noScheme);
assert.deepEqual(noSchemeResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

console.log('all url module fixture assertions passed');
