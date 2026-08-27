/**
 * Fixture test for Stage 4 — Contextual Suppression
 * (packages/engine/stage4.ts).
 *
 * Two parts: (1) unit-level coverage of generateSuppressionApplications'
 * distinct behaviors (guard evaluation, blockedBy exclusion, max-not-
 * product across a synthetic multi-suppression case, non-destructive
 * recording of a non-applied pair); (2) an integration run of the REAL
 * rules-v0.1.0.json against the REAL 4 SecurityEvidence fixtures, through
 * the REAL Stage 1 -> 2 -> 3 -> 4 pipeline end to end.
 *
 * Run directly:
 *   node --experimental-strip-types packages/engine/stage4.fixture.test.ts
 * Exits 0 and prints "all stage4 fixture assertions passed" on success;
 * throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModuleId } from '../contracts/evaluation.contract.v1.ts';
import type { AuthStoreReader } from '../contracts/boundary.interfaces.v1.ts';
import type { CorrelationFinding } from '../contracts/passresult.contract.v1.ts';
import type { RuleSet } from '../contracts/ruleset.format.v1.ts';
import type { ModuleDispatchResult } from './orchestrator.ts';
import { evaluateAllModules } from './orchestrator.ts';
import { matchAllRules } from './stage2.ts';
import { generateCorrelationFindings } from './stage3.ts';
import { generateSuppressionApplications, maxAppliedReduction } from './stage4.ts';
import { cleanLogin } from '../../fixtures/clean-login.ts';
import { noCredential } from '../../fixtures/no-credential.ts';
import { offOriginPost } from '../../fixtures/off-origin-post.ts';
import { ssoFlow } from '../../fixtures/sso-flow.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const realRuleSet = JSON.parse(
  readFileSync(join(REPO_ROOT, 'rulesets', 'rules-v0.1.0.json'), 'utf8'),
) as RuleSet;

const ALL_MODULE_IDS: readonly ModuleId[] = [
  'url', 'ssl', 'dns', 'redirect', 'loginForm', 'javascript',
  'homograph', 'authContext', 'downloadContext', 'permissionContext',
];

function baseEvaluations(): Record<ModuleId, ModuleDispatchResult> {
  const entries = ALL_MODULE_IDS.map((moduleId) => [
    moduleId,
    {
      moduleId,
      evaluationId: `eval-${moduleId}`,
      result: { status: 'unevaluable', reason: 'required_evidence_not_collected' },
    },
  ]);
  return Object.fromEntries(entries) as Record<ModuleId, ModuleDispatchResult>;
}

function fakeFinding(overrides: Partial<CorrelationFinding> = {}): CorrelationFinding {
  return {
    findingId: 'finding-1' as CorrelationFinding['findingId'],
    contractVersion: '1.0.0',
    targetResourceId: 'res_test' as CorrelationFinding['targetResourceId'],
    analysisSessionId: 'sess_test' as CorrelationFinding['analysisSessionId'],
    passOrdinal: 1,
    ruleId: 'CRED-01',
    evaluationRefs: [],
    correlationContext: { emergedInPass: 1, constituentConjunction: null },
    ...overrides,
  };
}

// A minimal rule set for unit tests — real S-01/S-02-shaped suppressions
// plus a synthetic third one, so max-not-product has two applicable
// suppressions to actually choose between.
const testRuleSet: RuleSet = {
  ...realRuleSet,
  suppressions: [
    {
      id: 'TEST-GUARD',
      mechanism: 'exemption',
      purpose: 'test',
      guards: [{ op: 'is', path: 'url.isSecureScheme' }],
      blockedBy: [],
      targets: [{ ruleId: 'CRED-01', reduction: 0.3 }],
      neverApplies: [],
      rationale: 'test',
      introducedIn: '0.1.0',
      lastModifiedIn: '0.1.0',
    },
    {
      id: 'TEST-BIGGER',
      mechanism: 'exemption',
      purpose: 'test',
      guards: [{ op: 'is', path: 'url.isSecureScheme' }],
      blockedBy: [],
      targets: [{ ruleId: 'CRED-01', reduction: 0.7 }],
      neverApplies: [],
      rationale: 'test',
      introducedIn: '0.1.0',
      lastModifiedIn: '0.1.0',
    },
    {
      id: 'TEST-BLOCKED',
      mechanism: 'exemption',
      purpose: 'test',
      guards: [{ op: 'is', path: 'url.isSecureScheme' }],
      blockedBy: ['CRED-03'],
      targets: [{ ruleId: 'CRED-01', reduction: 1.0 }],
      neverApplies: [],
      rationale: 'test',
      introducedIn: '0.1.0',
      lastModifiedIn: '0.1.0',
    },
    {
      id: 'TEST-NOT-TARGETING',
      mechanism: 'exemption',
      purpose: 'test',
      guards: [],
      blockedBy: [],
      targets: [{ ruleId: 'PM-01', reduction: 0.5 }],
      neverApplies: [],
      rationale: 'test',
      introducedIn: '0.1.0',
      lastModifiedIn: '0.1.0',
    },
  ],
};

// --- Unit: guard holds -> applied, correct reduction ----------------------

{
  const evaluations = {
    ...baseEvaluations(),
    url: {
      moduleId: 'url' as const,
      evaluationId: 'eval-url-1',
      result: {
        status: 'evaluated' as const,
        findings: {
          scheme: 'https', isSecureScheme: true, registrableDomain: 'example.com',
          subdomainDepth: 0, isIpLiteral: false, totalLength: 20,
          suspiciousKeywordCount: 0, percentEncodedSegmentCount: 0, specialCharacterDensity: 0,
        },
      },
    },
  };
  const findings = [fakeFinding()];
  // Only TEST-GUARD and TEST-BIGGER should apply (guard holds, not
  // blocked); TEST-BLOCKED's guard also holds but blockedBy fires below;
  // TEST-NOT-TARGETING doesn't target CRED-01 at all.
  const testRuleSetNoBlock: RuleSet = { ...testRuleSet, suppressions: testRuleSet.suppressions.filter((s) => s.id !== 'TEST-BLOCKED') };
  const applications = generateSuppressionApplications(findings, evaluations, testRuleSetNoBlock);

  assert.equal(applications.length, 2, 'TEST-GUARD and TEST-BIGGER only — TEST-NOT-TARGETING must be skipped entirely');
  assert.ok(applications.every((a) => a.applied), 'both guards hold, neither blocked');
  assert.ok(!applications.some((a) => a.suppressionId === 'TEST-NOT-TARGETING'), 'a suppression not targeting this rule produces no record at all');
}

// --- Unit: guard does not hold -> not applied, guardEvaluations records it

{
  const evaluations = baseEvaluations(); // url unevaluable -> guard can't hold
  const findings = [fakeFinding()];
  const single: RuleSet = { ...testRuleSet, suppressions: [testRuleSet.suppressions[0]!] };
  const applications = generateSuppressionApplications(findings, evaluations, single);

  assert.equal(applications.length, 1, 'non-destructive: a record IS produced even though it will not apply');
  const application = applications[0]!;
  assert.equal(application.applied, false);
  assert.deepEqual(application.guardEvaluations, [{ guardIndex: 0, held: false }]);
  assert.equal(application.declaredReduction, 0.3, 'declared reduction recorded even though applied is false');
  assert.equal(application.blockedByRuleId, null, 'not blocked — the guard itself is what failed');
}

// --- Unit: blockedBy exclusion — guard holds, but blocking rule fired -----

{
  const evaluations = {
    ...baseEvaluations(),
    url: {
      moduleId: 'url' as const,
      evaluationId: 'eval-url-1',
      result: {
        status: 'evaluated' as const,
        findings: {
          scheme: 'https', isSecureScheme: true, registrableDomain: 'example.com',
          subdomainDepth: 0, isIpLiteral: false, totalLength: 20,
          suspiciousKeywordCount: 0, percentEncodedSegmentCount: 0, specialCharacterDensity: 0,
        },
      },
    },
  };
  const findings = [fakeFinding({ ruleId: 'CRED-01' }), fakeFinding({ findingId: 'finding-2' as CorrelationFinding['findingId'], ruleId: 'CRED-03' })];
  const single: RuleSet = { ...testRuleSet, suppressions: [testRuleSet.suppressions.find((s) => s.id === 'TEST-BLOCKED')!] };
  const applications = generateSuppressionApplications(findings, evaluations, single);

  const cred01Application = applications.find((a) => a.targetRuleId === 'CRED-01');
  assert.ok(cred01Application, 'CRED-01 x TEST-BLOCKED must still be recorded');
  assert.equal(cred01Application.guardEvaluations[0]?.held, true, 'the guard itself DID hold');
  assert.equal(cred01Application.blockedByRuleId, 'CRED-03', 'blockedBy correctly identifies the blocking rule');
  assert.equal(cred01Application.applied, false, 'blocked despite a held guard — blockedBy wins');

  // TEST-BLOCKED does not target CRED-03 at all, so no record for that pair.
  assert.ok(!applications.some((a) => a.targetRuleId === 'CRED-03'), 'TEST-BLOCKED never targeted CRED-03');
}

// --- Unit: max, not product, across multiple applicable suppressions ------

{
  const evaluations = {
    ...baseEvaluations(),
    url: {
      moduleId: 'url' as const,
      evaluationId: 'eval-url-1',
      result: {
        status: 'evaluated' as const,
        findings: {
          scheme: 'https', isSecureScheme: true, registrableDomain: 'example.com',
          subdomainDepth: 0, isIpLiteral: false, totalLength: 20,
          suspiciousKeywordCount: 0, percentEncodedSegmentCount: 0, specialCharacterDensity: 0,
        },
      },
    },
  };
  const findings = [fakeFinding()];
  const applications = generateSuppressionApplications(findings, evaluations, testRuleSet);

  // TEST-GUARD (0.3) and TEST-BIGGER (0.7) both apply; TEST-BLOCKED's guard
  // holds too but nothing named 'CRED-03' fired in this findings set, so it
  // is NOT blocked here and also applies, at 1.0.
  const applied = applications.filter((a) => a.applied);
  assert.equal(applied.length, 3);
  assert.deepEqual(applied.map((a) => a.declaredReduction).sort(), [0.3, 0.7, 1]);

  const max = maxAppliedReduction('finding-1', applications);
  assert.equal(max, 1, 'maximum, not sum (2.0) or product (0.21)');
}

// --- Unit: maxAppliedReduction is 0 when nothing applied -------------------

{
  const applications = generateSuppressionApplications([fakeFinding()], baseEvaluations(), testRuleSet);
  assert.ok(applications.length > 0, 'records still produced');
  assert.ok(!applications.some((a) => a.applied), 'nothing applies — url unevaluable, every guard fails');
  assert.equal(maxAppliedReduction('finding-1', applications), 0);
}

// --- Integration: real rules-v0.1.0.json + real 4 fixtures, through the
// real Stage 1 -> 2 -> 3 -> 4 pipeline end to end ---------------------------

const uncalledStoreReader: AuthStoreReader = {
  lookup: async () => { throw new Error('must not be called — every fixture has fingerprint notCollected'); },
};

const FIXTURES = {
  'clean-login': cleanLogin,
  'no-credential': noCredential,
  'off-origin-post': offOriginPost,
  'sso-flow': ssoFlow,
};

for (const [name, fixtureEvidence] of Object.entries(FIXTURES)) {
  const evaluations = await evaluateAllModules(fixtureEvidence, uncalledStoreReader);
  const matchResults = matchAllRules(evaluations, realRuleSet);
  const findings = generateCorrelationFindings(fixtureEvidence, evaluations, matchResults, realRuleSet);
  const applications = generateSuppressionApplications(findings, evaluations, realRuleSet);

  // Only S-01 and S-02 exist in the real rule set — no other suppressionId
  // can ever appear, and no special-casing was done to select them.
  for (const application of applications) {
    assert.ok(['S-01', 'S-02'].includes(application.suppressionId), `${name}: unexpected suppressionId ${application.suppressionId}`);
    const rule = realRuleSet.suppressions.find((s) => s.id === application.suppressionId)!;
    assert.ok(rule.targets.some((t) => t.ruleId === application.targetRuleId), `${name}: recorded a pair the suppression doesn't target`);
  }

  if (name === 'off-origin-post') {
    // CRED-01 fires, and is targeted by both S-01 and S-02, neither of which
    // applies — authContext is unevaluable (every fixture's fingerprint is
    // notCollected) so S-01's guards can't hold, and evil-collect.example
    // isn't a registered identity provider so S-02's guard can't hold either.
    //
    // CORRECTED 2026-08-27: S-02's blockedByRuleId is now null, not
    // 'CRED-03'. The previous expectation depended on CRED-03 firing on this
    // fixture, which was itself the DEC-20 fixture defect (confusableSkeleton
    // emitted as present(<the domain itself>) rather than absent(), making
    // CRED-03's neq(..., null) conjunct true for every domain). With the
    // fixtures corrected CRED-03 no longer fires here, so S-02's blockedBy
    // list is not triggered. S-02 still does not apply — its own guard fails
    // on its own merits, which is what this assertion now records.
    assert.equal(applications.length, 2, `${name}: S-01 x CRED-01 and S-02 x CRED-01`);
    const s01 = applications.find((a) => a.suppressionId === 'S-01');
    const s02 = applications.find((a) => a.suppressionId === 'S-02');
    assert.ok(s01 && !s01.applied && s01.blockedByRuleId === null);
    assert.ok(s02 && !s02.applied && s02.blockedByRuleId === null);
  } else {
    // clean-login, no-credential, sso-flow: nothing fires on any of them
    // post-DEFECT-22/DEC-20, so there is no finding for S-01 or S-02 to be
    // evaluated against — zero applications.
    assert.equal(applications.length, 0, `${name}: no matched rule here is an S-01/S-02 target`);
  }
}

console.log('all stage4 fixture assertions passed');
