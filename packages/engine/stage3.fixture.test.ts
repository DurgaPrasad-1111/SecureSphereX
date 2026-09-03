/**
 * Fixture test for Stage 3 — Correlation Finding Generation
 * (packages/engine/stage3.ts).
 *
 * Two parts: (1) unit-level coverage of generateCorrelationFindings'
 * distinct behaviors (matched -> finding, unmatched/blocked -> none,
 * evaluationRefs sourced from requiredModules, findingId freshness,
 * constituentConjunction always null); (2) an integration run of the
 * REAL rules-v0.1.0.json against the REAL 4 SecurityEvidence fixtures,
 * through the REAL Stage 1 -> Stage 2 -> Stage 3 pipeline end to end.
 *
 * Run directly:
 *   node --experimental-strip-types packages/engine/stage3.fixture.test.ts
 * Exits 0 and prints "all stage3 fixture assertions passed" on success;
 * throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModuleId } from '../contracts/evaluation.contract.v1.ts';
import type { AuthStoreReader } from '../contracts/boundary.interfaces.v1.ts';
import type { RuleSet } from '../contracts/ruleset.format.v1.ts';
import type { ModuleDispatchResult } from './orchestrator.ts';
import { evaluateAllModules } from './orchestrator.ts';
import { matchAllRules } from './stage2.ts';
import { generateCorrelationFindings } from './stage3.ts';
import { cleanLogin } from '../../fixtures/clean-login.ts';
import { noCredential } from '../../fixtures/no-credential.ts';
import { offOriginPost } from '../../fixtures/off-origin-post.ts';
import { ssoFlow } from '../../fixtures/sso-flow.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const realRuleSet = JSON.parse(
  readFileSync(join(REPO_ROOT, 'rulesets', 'rules-v0.1.0.json'), 'utf8'),
) as RuleSet;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

// A minimal rule set for the unit tests below — doesn't depend on
// rules-v0.1.0's exact current content.
const testRuleSet: RuleSet = {
  ...realRuleSet,
  rules: [
    {
      id: 'FAKE-SINGLE', family: 'CRED', name: 'test', type: 'primary', parent: null,
      predicate: { op: 'is', path: 'url.isSecureScheme' }, requiredModules: ['url'],
      baseWeight: 1, tier: 0, interveningTier: 0, owner: 'test', introducedIn: '0.1.0',
      lastModifiedIn: '0.1.0', lifecycleState: 'Active', rationale: 'test',
      empiricalConfidence: 'Unvalidated', knownFalsePositiveRisks: [], knownLimitations: [],
      cweMappings: [], capecMappings: [],
    },
    {
      id: 'FAKE-CROSS-MODULE', family: 'PM', name: 'test', type: 'primary', parent: null,
      predicate: {
        op: 'and',
        operands: [
          { op: 'is', path: 'permissionContext.precededByUserGesture' },
          { op: 'not', operand: { op: 'is', path: 'redirect.hopCount' } },
        ],
      },
      requiredModules: ['permissionContext', 'redirect'],
      baseWeight: 1, tier: 0, interveningTier: 0, owner: 'test', introducedIn: '0.1.0',
      lastModifiedIn: '0.1.0', lifecycleState: 'Active', rationale: 'test',
      empiricalConfidence: 'Unvalidated', knownFalsePositiveRisks: [], knownLimitations: [],
      cweMappings: [], capecMappings: [],
    },
  ],
};

const evidence = {
  ...cleanLogin,
  targetResourceId: 'res_test' as typeof cleanLogin.targetResourceId,
  analysisSessionId: 'sess_test' as typeof cleanLogin.analysisSessionId,
};

// --- Unit: matched -> exactly one finding, unmatched -> none -------------

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
  const matchResults = matchAllRules(evaluations, testRuleSet);
  const findings = generateCorrelationFindings(evidence, evaluations, matchResults, testRuleSet);

  // FAKE-SINGLE matches (isSecureScheme true); FAKE-CROSS-MODULE doesn't
  // (permissionContext/redirect both unevaluable in this evaluations set).
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, 'FAKE-SINGLE');
}

// --- Unit: no findings when nothing matches -------------------------------

{
  const evaluations = baseEvaluations(); // everything unevaluable
  const matchResults = matchAllRules(evaluations, testRuleSet);
  const findings = generateCorrelationFindings(evidence, evaluations, matchResults, testRuleSet);
  assert.deepEqual(findings, []);
}

// --- Unit: finding fields are correctly populated -------------------------

{
  const evaluations = {
    ...baseEvaluations(),
    url: {
      moduleId: 'url' as const,
      evaluationId: 'eval-url-specific',
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
  const matchResults = matchAllRules(evaluations, testRuleSet);
  const findings = generateCorrelationFindings(evidence, evaluations, matchResults, testRuleSet);
  const finding = findings[0];
  assert.ok(finding, 'FAKE-SINGLE must have matched');

  assert.equal(finding.contractVersion, '1.0.0');
  assert.equal(finding.targetResourceId, evidence.targetResourceId);
  assert.equal(finding.analysisSessionId, evidence.analysisSessionId);
  assert.equal(finding.passOrdinal, evidence.collectionContext.passOrdinal);
  assert.equal(finding.ruleId, 'FAKE-SINGLE');
  assert.deepEqual(finding.evaluationRefs, ['eval-url-specific']);
  assert.deepEqual(finding.correlationContext, {
    emergedInPass: evidence.collectionContext.passOrdinal,
    constituentConjunction: null,
  });
  assert.match(finding.findingId, UUID_V4);
}

// --- Unit: evaluationRefs pulls ALL requiredModules, even a cross-module
// OR's untaken branch (the PM-01 shape) ------------------------------------

{
  const evaluations = {
    ...baseEvaluations(),
    permissionContext: {
      moduleId: 'permissionContext' as const,
      evaluationId: 'eval-permission-1',
      result: {
        status: 'evaluated' as const,
        findings: {
          requestedPermission: 'camera' as const, requestingRegistrableDomain: null,
          precededByUserGesture: true, pageAgeMs: 5000,
        },
      },
    },
    redirect: {
      moduleId: 'redirect' as const,
      evaluationId: 'eval-redirect-1',
      result: {
        status: 'evaluated' as const,
        findings: { hopCount: 0, initialRegistrableDomain: null, finalRegistrableDomain: null, mechanisms: [], chainLength: 0 },
      },
    },
  };
  const matchResults = matchAllRules(evaluations, testRuleSet);
  const findings = generateCorrelationFindings(evidence, evaluations, matchResults, testRuleSet);
  const finding = findings.find((f) => f.ruleId === 'FAKE-CROSS-MODULE');
  assert.ok(finding, 'FAKE-CROSS-MODULE must have matched (gesture=true, hopCount=0 -> not(is(0)) -> true)');
  // Both modules referenced, in requiredModules order, regardless of which
  // conjunct actually "did the work" for this particular match.
  assert.deepEqual(finding.evaluationRefs, ['eval-permission-1', 'eval-redirect-1']);
}

// --- Unit: findingId is fresh per finding, never reused -------------------

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
  const matchResults = matchAllRules(evaluations, testRuleSet);
  const findingsA = generateCorrelationFindings(evidence, evaluations, matchResults, testRuleSet);
  const findingsB = generateCorrelationFindings(evidence, evaluations, matchResults, testRuleSet);
  assert.notEqual(findingsA[0]?.findingId, findingsB[0]?.findingId, 'two calls must not share a findingId');
}

// --- Integration: real rules-v0.1.0.json + real 4 fixtures, through the
// real Stage 1 -> Stage 2 -> Stage 3 pipeline end to end -------------------

const uncalledStoreReader: AuthStoreReader = {
  lookup: async () => { throw new Error('must not be called — every fixture has fingerprint notCollected'); },
};

const FIXTURES = {
  'clean-login': cleanLogin,
  'no-credential': noCredential,
  'off-origin-post': offOriginPost,
  'sso-flow': ssoFlow,
};

const allFindingIds = new Set<string>();

for (const [name, fixtureEvidence] of Object.entries(FIXTURES)) {
  const evaluations = await evaluateAllModules(fixtureEvidence, uncalledStoreReader);
  const matchResults = matchAllRules(evaluations, realRuleSet);
  const findings = generateCorrelationFindings(fixtureEvidence, evaluations, matchResults, realRuleSet);

  const matchedRuleIds = new Set(matchResults.filter((r) => r.status === 'matched').map((r) => r.ruleId));
  assert.equal(findings.length, matchedRuleIds.size, `${name}: one finding per matched rule, no more, no less`);

  for (const finding of findings) {
    assert.ok(matchedRuleIds.has(finding.ruleId), `${name}: finding for a rule Stage 2 didn't match`);
    assert.match(finding.findingId, UUID_V4, `${name}: findingId must be a well-formed UUIDv4`);
    assert.ok(!allFindingIds.has(finding.findingId), `${name}: findingId reused across findings`);
    allFindingIds.add(finding.findingId);

    const rule = realRuleSet.rules.find((r) => r.id === finding.ruleId);
    assert.ok(rule, `${name}: matched ruleId must exist in the rule set`);
    assert.equal(finding.evaluationRefs.length, rule.requiredModules.length, `${name}/${finding.ruleId}: evaluationRefs count`);
    for (const [i, moduleId] of rule.requiredModules.entries()) {
      assert.equal(finding.evaluationRefs[i], evaluations[moduleId].evaluationId, `${name}/${finding.ruleId}: evaluationRefs[${i}]`);
    }
    assert.equal(finding.correlationContext.constituentConjunction, null, `${name}/${finding.ruleId}: no composites at rules-v0.1`);
  }

  // CRED-04 is never matched (DEFECT-19) — confirmed again at the Stage 3
  // boundary: no finding for it, in any fixture.
  assert.ok(!findings.some((f) => f.ruleId === 'CRED-04'), `${name}: CRED-04 must never produce a finding`);
  // DL-01 never matches in these fixtures: none thread a prior committed
  // finding, so priorFindingActive is noMatch (Option C) and DL-01's `and`
  // does not complete — 'unmatched' or 'unevaluable', never 'matched'.
  assert.ok(!findings.some((f) => f.ruleId === 'DL-01'), `${name}: DL-01 must never produce a finding`);
}

console.log('all stage3 fixture assertions passed');
