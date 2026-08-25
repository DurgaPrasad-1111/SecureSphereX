/**
 * Fixture test for the Homograph Evaluation Module (§2.6, module 7).
 *
 * No test runner is wired up in this repo yet (package.json's test:fixtures
 * script is still a stub). Run directly:
 *   node --experimental-strip-types packages/engine/modules/homograph.fixture.test.ts
 * Exits 0 and prints "all homograph module fixture assertions passed" on
 * success; throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { present, absent, notCollected } from '../../contracts/evidence.contract.v1.ts';
import type { DomainRepresentationEvidence } from '../../contracts/evidence.contract.v1.ts';
import { computeHomographFindings } from './homograph.ts';

// --- Case 1: happy path, genuine IDN mixed-script homograph -----------------
//
// "аpple.com" — the first letter is Cyrillic U+0430 (а), the rest is Latin.
// Requires punycode encoding (isIdn true), carries a non-ASCII codepoint
// (containsNonAscii true), mixes two Unicode scripts in one label
// (isMixedScript true), and has a real confusable skeleton — the
// UTS-39-normalized form that collapses to the visually-identical ASCII
// "apple.com".

const mixedScriptHomograph: DomainRepresentationEvidence = {
  unicodeDomain: present('аpple.com'),
  punycodeDomain: present('xn--pple-43d.com'),
  isIdn: present(true),
  containsNonAscii: present(true),
  scriptsUsed: present(['Latin', 'Cyrillic']),
  isMixedScript: present(true),
  confusableSkeleton: present('apple.com'),
};

const mixedResult = computeHomographFindings(mixedScriptHomograph);
assert.deepEqual(mixedResult, {
  status: 'evaluated',
  findings: {
    isIdn: true,
    containsNonAscii: true,
    isMixedScript: true,
    scriptsUsed: ['Latin', 'Cyrillic'],
    confusableSkeleton: 'apple.com',
  },
});

// --- Case 2: plain ASCII domain — evaluated, not unevaluable ----------------
//
// A producer that looked at an ordinary ASCII-only domain and found nothing
// homograph-relevant reports that positively: scriptsUsed: present(['Latin'])
// (observed, exactly one script), confusableSkeleton: absent() (observed,
// genuinely no distinct confusable skeleton — see case 4 below for why this
// is a real, positive null and not a stand-in for missing data).

const plainAscii: DomainRepresentationEvidence = {
  unicodeDomain: present('accounts.example.com'),
  punycodeDomain: present('accounts.example.com'),
  isIdn: present(false),
  containsNonAscii: present(false),
  scriptsUsed: present(['Latin']),
  isMixedScript: present(false),
  confusableSkeleton: absent(),
};

const plainResult = computeHomographFindings(plainAscii);
assert.deepEqual(plainResult, {
  status: 'evaluated',
  findings: {
    isIdn: false,
    containsNonAscii: false,
    isMixedScript: false,
    scriptsUsed: ['Latin'],
    confusableSkeleton: null,
  },
});

// --- Case 3: missing evidence — notCollected on one field -> unevaluable ---

const tierPartial: DomainRepresentationEvidence = {
  unicodeDomain: present('accounts.example.com'),
  punycodeDomain: present('accounts.example.com'),
  isIdn: present(false),
  containsNonAscii: present(false),
  scriptsUsed: notCollected('tier_not_reached'),
  isMixedScript: present(false),
  confusableSkeleton: absent(),
};

const tierPartialResult = computeHomographFindings(tierPartial);
assert.deepEqual(tierPartialResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

// --- Case 4: absent on confusableSkeleton -> real, positive null -----------
//
// This is a REAL null, not DEFECT-15/18's structural null. DEFECT-15's
// loginForm.pageRegistrableDomain and DEFECT-18's javascript.*Domain fields
// are unconditional — the evidence category has no source field to derive
// them from, full stop, regardless of Observation state. Here the source
// field (confusableSkeleton) exists in DomainRepresentationEvidence and was
// genuinely observed; the producer is reporting a confirmed-absent fact
// (this domain has no confusable skeleton distinct from itself), the same
// shape as url.ts's registrableDomain on an IP-literal URL — not a gap in
// what this module is able to see.

const noSkeleton: DomainRepresentationEvidence = {
  unicodeDomain: present('example.com'),
  punycodeDomain: present('example.com'),
  isIdn: present(false),
  containsNonAscii: present(false),
  scriptsUsed: present(['Latin']),
  isMixedScript: present(false),
  confusableSkeleton: absent(),
};

const noSkeletonResult = computeHomographFindings(noSkeleton);
assert.equal(noSkeletonResult.status, 'evaluated');
if (noSkeletonResult.status === 'evaluated') {
  assert.equal(noSkeletonResult.findings.confusableSkeleton, null);
}

// --- Case 5: absent on scriptsUsed -> unevaluable, not [] -------------------
//
// Exercises the I-2 rule directly rather than leaving it implicit.
// scriptsUsed is non-nullable in HomographFindings, so absent() here is a
// producer defect (I-2: "a producer MUST NOT emit absent where it means
// notCollected"), not an unstated synonym for present([]) — matching
// loginForm.ts's `forms` field precedent exactly, not url.ts's
// registrableDomain precedent. Every other field is present() and
// well-formed, isolating scriptsUsed as the only cause of unevaluability.

const scriptsUsedAbsent: DomainRepresentationEvidence = {
  unicodeDomain: present('example.com'),
  punycodeDomain: present('example.com'),
  isIdn: present(false),
  containsNonAscii: present(false),
  scriptsUsed: absent(),
  isMixedScript: present(false),
  confusableSkeleton: present('example.com'),
};

const scriptsUsedAbsentResult = computeHomographFindings(scriptsUsedAbsent);
assert.deepEqual(scriptsUsedAbsentResult, {
  status: 'unevaluable',
  reason: 'required_evidence_not_collected',
});

console.log('all homograph module fixture assertions passed');
