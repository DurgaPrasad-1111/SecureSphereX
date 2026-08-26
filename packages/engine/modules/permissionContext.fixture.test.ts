/**
 * Fixture test for the Permission Context Evaluation Module (§2.6, module 10).
 *
 * No test runner is wired up in this repo yet (package.json's test:fixtures
 * script covers fixtures/, not per-module tests). Run directly:
 *   node --experimental-strip-types packages/engine/modules/permissionContext.fixture.test.ts
 * Exits 0 and prints "all permissionContext module fixture assertions passed"
 * on success; throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { present, absent, notCollected } from '../../contracts/evidence.contract.v1.ts';
import type { PermissionContextEvidence } from '../../contracts/evidence.contract.v1.ts';
import { computePermissionContextFindings } from './permissionContext.ts';

// --- Case 1: no permission request at all (fixtures/clean-login.ts shape) --

const noRequest: PermissionContextEvidence = {
  requestedPermission: absent(),
  requestingOrigin: absent(),
  precededByUserGesture: absent(),
  pageAgeMs: present(1200),
};

const noRequestResult = computePermissionContextFindings(noRequest);
assert.deepEqual(noRequestResult, {
  status: 'evaluated',
  findings: {
    requestedPermission: null,
    requestingRegistrableDomain: null,
    precededByUserGesture: null,
    pageAgeMs: 1200,
  },
});

// --- Case 2: unsolicited sensitive permission on a freshly loaded page -----
// (PM-01 shape: requested, no preceding gesture, page very young)

const unsolicited: PermissionContextEvidence = {
  requestedPermission: present('camera'),
  requestingOrigin: present('https://secure-login-verify.evil.tld'),
  precededByUserGesture: present(false),
  pageAgeMs: present(400),
};

const unsolicitedResult = computePermissionContextFindings(unsolicited);
assert.equal(unsolicitedResult.status, 'evaluated');
if (unsolicitedResult.status === 'evaluated') {
  assert.equal(unsolicitedResult.findings.requestedPermission, 'camera');
  assert.equal(unsolicitedResult.findings.precededByUserGesture, false);
  assert.equal(unsolicitedResult.findings.pageAgeMs, 400);
  // DEFECT-20: always null, regardless of a real, present requestingOrigin.
  assert.equal(unsolicitedResult.findings.requestingRegistrableDomain, null);
}

// --- Case 3: legitimate gesture-preceded request ----------------------------

const gestureInitiated: PermissionContextEvidence = {
  requestedPermission: present('microphone'),
  requestingOrigin: present('https://meet.example.com'),
  precededByUserGesture: present(true),
  pageAgeMs: present(15000),
};

const gestureResult = computePermissionContextFindings(gestureInitiated);
assert.equal(gestureResult.status, 'evaluated');
if (gestureResult.status === 'evaluated') {
  assert.equal(gestureResult.findings.precededByUserGesture, true);
}

// --- Case 4: missing evidence — whether a request happened not collected --

const requestUnknown: PermissionContextEvidence = {
  requestedPermission: notCollected('tier_not_reached'),
  requestingOrigin: notCollected('tier_not_reached'),
  precededByUserGesture: notCollected('tier_not_reached'),
  pageAgeMs: present(1200),
};

const requestUnknownResult = computePermissionContextFindings(requestUnknown);
assert.deepEqual(requestUnknownResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 5: missing evidence — page age not collected ---------------------

const pageAgeUnknown: PermissionContextEvidence = {
  requestedPermission: present('geolocation'),
  requestingOrigin: present('https://maps.example.com'),
  precededByUserGesture: present(true),
  pageAgeMs: notCollected('collector_error'),
};

const pageAgeUnknownResult = computePermissionContextFindings(pageAgeUnknown);
assert.deepEqual(pageAgeUnknownResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

console.log('all permissionContext module fixture assertions passed');
