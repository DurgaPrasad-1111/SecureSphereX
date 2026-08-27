/**
 * Fixture test for the Download Context Evaluation Module (§2.6, module 9).
 *
 * No test runner is wired up in this repo yet (package.json's test:fixtures
 * script covers fixtures/, not per-module tests). Run directly:
 *   node --experimental-strip-types packages/engine/modules/downloadContext.fixture.test.ts
 * Exits 0 and prints "all downloadContext module fixture assertions passed"
 * on success; throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { present, absent, notCollected } from '../../contracts/evidence.contract.v1.ts';
import type { DownloadContextEvidence } from '../../contracts/evidence.contract.v1.ts';
import { computeDownloadContextFindings } from './downloadContext.ts';

// --- Case 1: cross-site executable delivery, consistent MIME (DL-01 shape) -

const crossSiteExe: DownloadContextEvidence = {
  downloadUrl: present('https://cdn.evil.tld/setup.exe'),
  downloadRegistrableDomain: present('evil.tld'),
  referrerUrl: present('https://secure-login-verify.evil.tld/account'),
  referrerRegistrableDomain: present('evil.tld'),
  declaredFilename: present('setup.exe'),
  declaredExtension: present('exe'),
  declaredMimeType: present('application/x-msdownload'),
  hasCompoundExtension: present(false),
};

const crossSiteResult = computeDownloadContextFindings(crossSiteExe);
assert.deepEqual(crossSiteResult, {
  status: 'evaluated',
  findings: {
    declaredExtension: 'exe',
    declaredMimeType: 'application/x-msdownload',
    extensionMimeConsistent: true,
    hasCompoundExtension: false,
    downloadRegistrableDomain: 'evil.tld',
    referrerRegistrableDomain: 'evil.tld',
    referrerPresent: true,
  },
});

// --- Case 2: deceptive typing — .exe declared as an image (DL-02 shape) ----

const deceptive: DownloadContextEvidence = {
  downloadUrl: present('https://cdn.evil.tld/photo.exe'),
  downloadRegistrableDomain: present('evil.tld'),
  referrerUrl: present('https://phished.example/landing'),
  referrerRegistrableDomain: present('phished.example'),
  declaredFilename: present('photo.exe'),
  declaredExtension: present('exe'),
  declaredMimeType: present('image/jpeg'),
  hasCompoundExtension: present(false),
};

const deceptiveResult = computeDownloadContextFindings(deceptive);
assert.equal(deceptiveResult.status, 'evaluated');
if (deceptiveResult.status === 'evaluated') {
  assert.equal(deceptiveResult.findings.extensionMimeConsistent, false);
}

// --- Case 3: generic content type — inconclusive, not a confirmed match ----

const genericMime: DownloadContextEvidence = {
  downloadUrl: present('https://files.example.com/archive.zip'),
  downloadRegistrableDomain: present('example.com'),
  referrerUrl: present('https://example.com/downloads'),
  referrerRegistrableDomain: present('example.com'),
  declaredFilename: present('archive.zip'),
  declaredExtension: present('zip'),
  declaredMimeType: present('application/octet-stream'),
  hasCompoundExtension: present(false),
};

const genericResult = computeDownloadContextFindings(genericMime);
assert.equal(genericResult.status, 'evaluated');
if (genericResult.status === 'evaluated') {
  assert.equal(genericResult.findings.extensionMimeConsistent, null);
}

// --- Case 4: extension with no established canonical MIME — inconclusive --

const unmappedExtension: DownloadContextEvidence = {
  downloadUrl: present('https://files.example.com/run.bat'),
  downloadRegistrableDomain: present('example.com'),
  referrerUrl: present('https://example.com/downloads'),
  referrerRegistrableDomain: present('example.com'),
  declaredFilename: present('run.bat'),
  declaredExtension: present('bat'),
  declaredMimeType: present('text/plain'),
  hasCompoundExtension: present(false),
};

const unmappedResult = computeDownloadContextFindings(unmappedExtension);
assert.equal(unmappedResult.status, 'evaluated');
if (unmappedResult.status === 'evaluated') {
  assert.equal(unmappedResult.findings.extensionMimeConsistent, null);
}

// --- Case 5: direct navigation — no referrer, a genuine negative finding --

const directNavigation: DownloadContextEvidence = {
  downloadUrl: present('https://example.com/installer.dmg'),
  downloadRegistrableDomain: present('example.com'),
  referrerUrl: absent(),
  referrerRegistrableDomain: absent(),
  declaredFilename: present('installer.dmg'),
  declaredExtension: present('dmg'),
  declaredMimeType: present('application/x-apple-diskimage'),
  hasCompoundExtension: present(false),
};

const directResult = computeDownloadContextFindings(directNavigation);
assert.equal(directResult.status, 'evaluated');
if (directResult.status === 'evaluated') {
  assert.equal(directResult.findings.referrerPresent, false);
  assert.equal(directResult.findings.referrerRegistrableDomain, null);
  assert.equal(directResult.findings.extensionMimeConsistent, true);
}

// --- Case 6: no declared extension at all — genuinely absent, not a gap ---

const noExtension: DownloadContextEvidence = {
  downloadUrl: present('https://example.com/download?id=42'),
  downloadRegistrableDomain: present('example.com'),
  referrerUrl: present('https://example.com/page'),
  referrerRegistrableDomain: present('example.com'),
  declaredFilename: present('download'),
  declaredExtension: absent(),
  declaredMimeType: absent(),
  hasCompoundExtension: present(false),
};

const noExtensionResult = computeDownloadContextFindings(noExtension);
assert.equal(noExtensionResult.status, 'evaluated');
if (noExtensionResult.status === 'evaluated') {
  assert.equal(noExtensionResult.findings.declaredExtension, null);
  assert.equal(noExtensionResult.findings.declaredMimeType, null);
  assert.equal(noExtensionResult.findings.extensionMimeConsistent, null);
}

// --- Case 7: missing evidence — hasCompoundExtension not collected --------

const noCompoundFlag: DownloadContextEvidence = {
  downloadUrl: present('https://example.com/installer.exe'),
  downloadRegistrableDomain: present('example.com'),
  referrerUrl: present('https://example.com/page'),
  referrerRegistrableDomain: present('example.com'),
  declaredFilename: present('installer.exe'),
  declaredExtension: present('exe'),
  declaredMimeType: present('application/x-msdownload'),
  hasCompoundExtension: notCollected('collector_error'),
};

const noCompoundFlagResult = computeDownloadContextFindings(noCompoundFlag);
assert.deepEqual(noCompoundFlagResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 8: missing evidence — referrer presence itself not collected ----

const referrerUnknown: DownloadContextEvidence = {
  downloadUrl: present('https://example.com/installer.exe'),
  downloadRegistrableDomain: present('example.com'),
  referrerUrl: notCollected('tier_not_reached'),
  referrerRegistrableDomain: notCollected('tier_not_reached'),
  declaredFilename: present('installer.exe'),
  declaredExtension: present('exe'),
  declaredMimeType: present('application/x-msdownload'),
  hasCompoundExtension: present(false),
};

const referrerUnknownResult = computeDownloadContextFindings(referrerUnknown);
assert.deepEqual(referrerUnknownResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

console.log('all downloadContext module fixture assertions passed');
