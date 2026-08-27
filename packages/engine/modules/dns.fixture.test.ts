/**
 * Fixture test for the DNS Evaluation Module (§2.6, module 3). DEC-5 stub.
 *
 * No test runner is wired up in this repo yet (package.json's test:fixtures
 * script covers fixtures/, not per-module tests). Run directly:
 *   node --experimental-strip-types packages/engine/modules/dns.fixture.test.ts
 * Exits 0 and prints "all dns module fixture assertions passed" on success;
 * throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { present, absent, notCollected } from '../../contracts/evidence.contract.v1.ts';
import type { DnsEvidence } from '../../contracts/evidence.contract.v1.ts';
import { computeDnsFindings } from './dns.ts';

// --- Case 1: extension-collected evidence (fixtures/clean-login.ts shape) --
// The extension cannot observe any DNS field at all (ProducerCapabilityManifest:
// "All of dns.* — NOT OBSERVABLE") — genuinely unevaluable.

const extensionCollected: DnsEvidence = {
  resolves: notCollected('api_unavailable'),
  aRecordCount: notCollected('api_unavailable'),
  aaaaRecordCount: notCollected('api_unavailable'),
  nameServers: notCollected('api_unavailable'),
  cnameTarget: notCollected('api_unavailable'),
  mxPresent: notCollected('api_unavailable'),
  txtRecordCount: notCollected('api_unavailable'),
  dnssecDeployed: notCollected('api_unavailable'),
};

const extensionResult = computeDnsFindings(extensionCollected);
assert.deepEqual(extensionResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 2: capture-harness-collected evidence — full resolution ----------

const fullyResolved: DnsEvidence = {
  resolves: present(true),
  aRecordCount: present(2),
  aaaaRecordCount: present(1),
  nameServers: present(['ns1.example.com', 'ns2.example.com']),
  cnameTarget: present('example-lb.cdn.example.net'),
  mxPresent: present(true),
  txtRecordCount: present(3),
  dnssecDeployed: present(true),
};

const resolvedResult = computeDnsFindings(fullyResolved);
assert.deepEqual(resolvedResult, {
  status: 'evaluated',
  findings: {
    resolves: true,
    aRecordCount: 2,
    aaaaRecordCount: 1,
    nameServerCount: 2,
    cnamePresent: true,
    mxPresent: true,
    dnssecDeployed: true,
  },
});

// --- Case 3: apex domain, genuinely no CNAME --------------------------------

const noCname: DnsEvidence = {
  resolves: present(true),
  aRecordCount: present(1),
  aaaaRecordCount: present(0),
  nameServers: present(['ns1.example.com']),
  cnameTarget: absent(),
  mxPresent: present(false),
  txtRecordCount: present(0),
  dnssecDeployed: present(false),
};

const noCnameResult = computeDnsFindings(noCname);
assert.equal(noCnameResult.status, 'evaluated');
if (noCnameResult.status === 'evaluated') {
  assert.equal(noCnameResult.findings.cnamePresent, false);
  assert.equal(noCnameResult.findings.nameServerCount, 1);
}

// --- Case 4: missing evidence — resolves itself not collected --------------

const noResolves: DnsEvidence = {
  resolves: notCollected('collector_error'),
  aRecordCount: present(1),
  aaaaRecordCount: present(0),
  nameServers: present(['ns1.example.com']),
  cnameTarget: absent(),
  mxPresent: present(false),
  txtRecordCount: present(0),
  dnssecDeployed: present(false),
};

const noResolvesResult = computeDnsFindings(noResolves);
assert.deepEqual(noResolvesResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

console.log('all dns module fixture assertions passed');
