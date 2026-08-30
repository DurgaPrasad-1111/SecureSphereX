/**
 * Fixture test for Stage 5+6 — Effective Weight Calculation + Aggregation
 * (packages/engine/stage5-6.ts).
 *
 * Two parts: (1) unit-level coverage of computeScoringAndAggregation's
 * distinct behaviors (subsumption — exercised with a SYNTHETIC non-empty
 * table, since the real one is genuinely empty; aggravator qualification
 * — present/absent/suppressed-to-zero parent; score/threshold
 * boundaries); (2) a real end-to-end run: Stage 1 -> 2 -> 3 -> 4 -> 5/6,
 * real rule set, all 4 fixtures, against hand-computed expected scores.
 *
 * Run directly:
 *   node --experimental-strip-types packages/engine/stage5-6.fixture.test.ts
 * Exits 0 and prints "all stage5-6 fixture assertions passed" on
 * success; throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthStoreReader } from '../contracts/boundary.interfaces.v1.ts';
import type { CorrelationFinding, SuppressionApplication } from '../contracts/passresult.contract.v1.ts';
import type { RuleSet, RuleDefinition } from '../contracts/ruleset.format.v1.ts';
import { evaluateAllModules } from './orchestrator.ts';
import { matchAllRules } from './stage2.ts';
import { generateCorrelationFindings } from './stage3.ts';
import { generateSuppressionApplications } from './stage4.ts';
import { computeScoringAndAggregation } from './stage5-6.ts';
import { cleanLogin } from '../../fixtures/clean-login.ts';
import { noCredential } from '../../fixtures/no-credential.ts';
import { offOriginPost } from '../../fixtures/off-origin-post.ts';
import { ssoFlow } from '../../fixtures/sso-flow.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const realRuleSet = JSON.parse(
  readFileSync(join(REPO_ROOT, 'rulesets', 'rules-v0.1.0.json'), 'utf8'),
) as RuleSet;

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

// A minimal rule set for unit tests: two primaries (PARENT-RULE weight
// 40, CHILD-RULE weight 20 — the latter used as a subsumed constituent),
// one composite (COMPOSITE-RULE, weight 50, declared to subsume
// CHILD-RULE), and one aggravator (AGG-RULE, weight 15, parent
// PARENT-RULE) — enough to exercise subsumption, aggravator
// qualification, and score summation together.
const RULE_DEF_BASE = {
  family: 'CRED', name: 'test', type: 'primary', parent: null,
  predicate: { op: 'is', path: 'url.isSecureScheme' }, requiredModules: [],
  baseWeight: 1, tier: 0, interveningTier: 0, owner: 'test', introducedIn: '0.1.0',
  lastModifiedIn: '0.1.0', lifecycleState: 'Active', rationale: 'test',
  empiricalConfidence: 'Unvalidated', knownFalsePositiveRisks: [], knownLimitations: [],
  cweMappings: [], capecMappings: [],
} as const;

function ruleDef(overrides: Partial<RuleDefinition> & { id: string }): RuleDefinition {
  return { ...RULE_DEF_BASE, ...overrides };
}

const testRuleSet: RuleSet = {
  ...realRuleSet,
  rules: [
    ruleDef({ id: 'PARENT-RULE', baseWeight: 40 }),
    ruleDef({ id: 'CHILD-RULE', baseWeight: 20 }),
    ruleDef({ id: 'COMPOSITE-RULE', baseWeight: 50 }),
    ruleDef({ id: 'AGG-RULE', type: 'aggravator', baseWeight: 15, parent: 'PARENT-RULE' }),
  ],
  suppressions: [],
  subsumption: [{ composite: 'COMPOSITE-RULE', subsumes: ['CHILD-RULE'] }],
};

const noApplications: readonly SuppressionApplication[] = [];

// --- Unit: subsumption — synthetic non-empty table, genuinely checked ----

{
  // COMPOSITE-RULE and CHILD-RULE both fire -> CHILD-RULE must be
  // excluded from the sum; COMPOSITE-RULE counted alone.
  const findings = [
    fakeFinding({ findingId: 'f-composite' as CorrelationFinding['findingId'], ruleId: 'COMPOSITE-RULE' }),
    fakeFinding({ findingId: 'f-child' as CorrelationFinding['findingId'], ruleId: 'CHILD-RULE' }),
  ];
  const { scoring, aggregation } = computeScoringAndAggregation(findings, noApplications, testRuleSet);

  const composite = scoring.find((s) => s.ruleId === 'COMPOSITE-RULE')!;
  const child = scoring.find((s) => s.ruleId === 'CHILD-RULE')!;
  assert.equal(composite.subsumed, false, 'the composite itself is never subsumed');
  assert.equal(composite.countedInScore, true);
  assert.equal(child.subsumed, true, 'CHILD-RULE is declared subsumed by COMPOSITE-RULE, which fired');
  assert.equal(child.countedInScore, false, '§10.3: excluded from the sum, but still recorded — not deleted');
  assert.equal(aggregation.primarySum, 50, 'COMPOSITE-RULE (50) only — CHILD-RULE (20) excluded, not double-counted');
  assert.deepEqual(aggregation.subsumptionApplied, [{ composite: 'COMPOSITE-RULE', subsumed: ['CHILD-RULE'] }]);
}

// --- Unit: subsumption declared but composite did NOT fire this pass -----

{
  // CHILD-RULE fires alone -> the declared subsumption never applies,
  // since the composite it would be subsumed by isn't present.
  const findings = [fakeFinding({ ruleId: 'CHILD-RULE' })];
  const { scoring, aggregation } = computeScoringAndAggregation(findings, noApplications, testRuleSet);
  assert.equal(scoring[0]?.subsumed, false, 'not subsumed — the composite never fired');
  assert.equal(scoring[0]?.countedInScore, true);
  assert.equal(aggregation.primarySum, 20);
  assert.deepEqual(aggregation.subsumptionApplied, [], 'no subsumption relation was actually exercised');
}

// --- Unit: real rule set — subsumption table genuinely empty, checked not skipped

{
  const findings = [fakeFinding({ ruleId: 'CRED-01' })];
  const { scoring, aggregation } = computeScoringAndAggregation(findings, noApplications, realRuleSet);
  assert.equal(realRuleSet.subsumption.length, 0, 'sanity: the real table is genuinely empty');
  assert.equal(scoring[0]?.subsumed, false);
  assert.deepEqual(aggregation.subsumptionApplied, []);
}

// --- Unit: aggravator qualification — parent present, healthy ------------

{
  const findings = [
    fakeFinding({ findingId: 'f-parent' as CorrelationFinding['findingId'], ruleId: 'PARENT-RULE' }),
    fakeFinding({ findingId: 'f-agg' as CorrelationFinding['findingId'], ruleId: 'AGG-RULE' }),
  ];
  const { scoring, aggregation } = computeScoringAndAggregation(findings, noApplications, testRuleSet);
  const agg = scoring.find((s) => s.ruleId === 'AGG-RULE')!;
  assert.equal(agg.parentQualified, true);
  assert.equal(agg.countedInScore, true);
  assert.equal(aggregation.primarySum, 40, 'PARENT-RULE');
  assert.equal(aggregation.aggravatorSum, 15, 'AGG-RULE, raw baseWeight — see stage5-6.ts header comment');
  assert.equal(aggregation.score, 55);
}

// --- Unit: aggravator qualification — parent absent -----------------------

{
  const findings = [fakeFinding({ ruleId: 'AGG-RULE' })]; // PARENT-RULE never fired
  const { scoring, aggregation } = computeScoringAndAggregation(findings, noApplications, testRuleSet);
  const agg = scoring[0]!;
  assert.equal(agg.parentQualified, false);
  assert.equal(agg.countedInScore, false);
  assert.equal(aggregation.aggravatorSum, 0);
}

// --- Unit: aggravator qualification — parent present but fully suppressed

{
  const parentFindingId = 'f-parent-suppressed';
  const findings = [
    fakeFinding({ findingId: parentFindingId as CorrelationFinding['findingId'], ruleId: 'PARENT-RULE' }),
    fakeFinding({ findingId: 'f-agg-2' as CorrelationFinding['findingId'], ruleId: 'AGG-RULE' }),
  ];
  const applications: readonly SuppressionApplication[] = [{
    suppressionId: 'FAKE-NULLIFY',
    targetFindingId: parentFindingId,
    targetRuleId: 'PARENT-RULE',
    guardEvaluations: [],
    blockedByRuleId: null,
    applied: true,
    declaredReduction: 1.0, // nullifies
  }];
  const { scoring, aggregation } = computeScoringAndAggregation(findings, applications, testRuleSet);
  const parent = scoring.find((s) => s.ruleId === 'PARENT-RULE')!;
  const agg = scoring.find((s) => s.ruleId === 'AGG-RULE')!;
  assert.equal(parent.effectiveWeight, 0, 'nullified');
  assert.equal(parent.countedInScore, true, 'still counted — 0 contribution, not excluded (only subsumption excludes)');
  assert.equal(agg.parentQualified, false, '§9.3: parent effective weight must be > 0');
  assert.equal(agg.countedInScore, false);
  assert.equal(aggregation.primarySum, 0);
  assert.equal(aggregation.aggravatorSum, 0);
}

// --- Unit: non-destructive — suppressed/subsumed/unqualified findings still recorded

{
  const findings = [
    fakeFinding({ findingId: 'f-composite-2' as CorrelationFinding['findingId'], ruleId: 'COMPOSITE-RULE' }),
    fakeFinding({ findingId: 'f-child-2' as CorrelationFinding['findingId'], ruleId: 'CHILD-RULE' }),
  ];
  const { scoring } = computeScoringAndAggregation(findings, noApplications, testRuleSet);
  assert.equal(scoring.length, 2, 'both findings recorded, including the subsumed one — never deleted');
}

// --- Unit: score/threshold boundaries (real rule set's own parameters) ----

{
  assert.equal(realRuleSet.parameters.find((p) => p.id === 'threshold_medium')?.value, 30);
  assert.equal(realRuleSet.parameters.find((p) => p.id === 'threshold_high')?.value, 60);

  const scoreCases: readonly [number, 'Low' | 'Medium' | 'High'][] = [[0, 'Low'], [29, 'Low'], [30, 'Medium'], [59, 'Medium'], [60, 'High'], [90, 'High']];
  for (const [targetScore, expectedTier] of scoreCases) {
    const scaledRuleSet: RuleSet = {
      ...testRuleSet,
      rules: [ruleDef({ id: 'SCORE-RULE', baseWeight: targetScore })],
    };
    const { aggregation } = computeScoringAndAggregation([fakeFinding({ ruleId: 'SCORE-RULE' })], noApplications, scaledRuleSet);
    assert.equal(aggregation.score, targetScore);
    assert.equal(aggregation.rawTier, expectedTier, `score ${targetScore} should be ${expectedTier}`);
  }
}

// --- Integration: real rules-v0.1.0.json + real 4 fixtures, through the
// real Stage 1 -> 2 -> 3 -> 4 -> 5/6 pipeline end to end -------------------

const uncalledStoreReader: AuthStoreReader = {
  lookup: async () => { throw new Error('must not be called — every fixture has fingerprint notCollected'); },
};

// Hand-computed against the real rule set's baseWeight/threshold values
// (CRED-01=45, CRED-03=45, both primary, unsuppressed against these
// fixtures per stage4.fixture.test.ts's own findings; DL-02's parent
// DL-01 never fires, so DL-02 is never counted) and the real matched-rule
// sets already confirmed empirically during Stage 4's work.
// CORRECTED 2026-08-27. The previous table encoded two defects as expected
// behaviour, both since fixed:
//   - DEFECT-22: not() over the unevaluable downloadContext module fabricated
//     a DL-02 match on all four fixtures (scored 0, so invisible here).
//   - DEC-20: the fixtures emitted confusableSkeleton as present(<the domain
//     itself>) instead of absent(), so CRED-03's neq(..., null) conjunct was
//     true for every domain and the rule fired on 3 of 4 fixtures.
// The old table therefore asserted that clean-login — the deliberately BENIGN
// baseline fixture — scored 45/Medium, and that off-origin-post scored
// 90/High on CRED-01 + a fabricated CRED-03. Both were false positives.
const EXPECTED: Readonly<Record<string, { score: number; rawTier: 'Low' | 'Medium' | 'High' }>> = {
  'clean-login': { score: 0, rawTier: 'Low' },        // benign baseline — nothing fires
  'no-credential': { score: 0, rawTier: 'Low' },      // no primary rule matches at all
  'off-origin-post': { score: 45, rawTier: 'Medium' },// CRED-01 only (weight 45)
  'sso-flow': { score: 0, rawTier: 'Low' },           // benign SSO — nothing fires
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
  const { scoring, aggregation } = computeScoringAndAggregation(findings, applications, realRuleSet);

  assert.equal(scoring.length, findings.length, `${name}: one ScoringEntry per finding, none dropped`);
  assert.equal(aggregation.ruleSetVersion, realRuleSet.ruleSetVersion, `${name}`);
  assert.deepEqual(aggregation.subsumptionApplied, [], `${name}: real subsumption table is empty`);

  const expected = EXPECTED[name]!;
  assert.equal(aggregation.score, expected.score, `${name}: aggregate score`);
  assert.equal(aggregation.rawTier, expected.rawTier, `${name}: raw tier`);

  // DL-02, when present, is never counted — its parent DL-01 never fires
  // against any of these 4 fixtures (confirmed during Stage 2's work).
  const dl02 = scoring.find((s) => s.ruleId === 'DL-02');
  if (dl02 !== undefined) {
    assert.equal(dl02.parentQualified, false, `${name}: DL-02's parent DL-01 never fires`);
    assert.equal(dl02.countedInScore, false, `${name}`);
  }
}

// --- B1.3-1: determinism — byte-identical recomputation ------------------
//
// NOT "good practice" — a CONTRACT requirement. passresult.contract.v1.ts's
// invariant P-13: "Replay of a Pass Result under its recorded ruleSetVersion,
// against its referenced evaluations, MUST reproduce identical scoring,
// identical findings, and an identical effectiveTier (§12.4, §17.2)." §9.1
// backs it from the other side: aggregation is "a pure function over the
// complete finding set... SHALL NOT be implemented as an incremental
// accumulator". Replay is only meaningful if recomputation is bit-stable, so
// this asserts the serialised output, not a field-by-field spot check.

{
  const findings = [
    fakeFinding({ findingId: 'det-1' as CorrelationFinding['findingId'], ruleId: 'PARENT-RULE' }),
    fakeFinding({ findingId: 'det-2' as CorrelationFinding['findingId'], ruleId: 'CHILD-RULE' }),
    fakeFinding({ findingId: 'det-3' as CorrelationFinding['findingId'], ruleId: 'AGG-RULE' }),
  ];
  const applications: readonly SuppressionApplication[] = [{
    suppressionId: 'S-01', targetFindingId: 'det-1', targetRuleId: 'PARENT-RULE',
    guardEvaluations: [{ guardIndex: 0, held: true }], blockedByRuleId: null,
    applied: true, declaredReduction: 0.5,
  }];

  const first = computeScoringAndAggregation(findings, applications, testRuleSet);
  const second = computeScoringAndAggregation(findings, applications, testRuleSet);

  assert.equal(
    JSON.stringify(first), JSON.stringify(second),
    'P-13: recomputation over the same finding set must be byte-identical',
  );
  // Guard against the assertion passing vacuously on empty output.
  assert.ok(first.scoring.length > 0, 'determinism check must run over a non-empty result');
  assert.ok(first.aggregation.score > 0, 'determinism check must run over a non-zero score');

  // Order-independence is the same property from §9.1's other side: a pure
  // function over the SET, so a reordered input must give the same score.
  const reordered = computeScoringAndAggregation([...findings].reverse(), applications, testRuleSet);
  assert.equal(reordered.aggregation.score, first.aggregation.score,
    '§9.1: score must not depend on finding order');
}

// --- B1.3-2: empty finding table -----------------------------------------
//
// Zero matched rules is an ordinary outcome, not an error: three of the four
// committed fixtures produce it. It must yield a valid zero-score result.

{
  const { scoring, aggregation } = computeScoringAndAggregation([], noApplications, realRuleSet);

  assert.deepEqual(scoring, [], 'no findings -> no scoring entries');
  assert.equal(aggregation.primarySum, 0);
  assert.equal(aggregation.aggravatorSum, 0);
  assert.equal(aggregation.score, 0, 'empty finding set scores zero, not NaN or undefined');
  assert.equal(aggregation.rawTier, 'Low', 'zero score is below threshold_medium -> Low');
  assert.deepEqual(aggregation.subsumptionApplied, [], 'nothing fired, so nothing subsumes');
  assert.equal(aggregation.ruleSetVersion, realRuleSet.ruleSetVersion);
  // Empty must also be deterministic — the degenerate case of P-13.
  assert.equal(
    JSON.stringify(computeScoringAndAggregation([], noApplications, realRuleSet)),
    JSON.stringify({ scoring, aggregation }),
    'P-13 holds for the empty case too',
  );
}

// --- B1.2-2: suppression may only REDUCE — engine-side range check --------
//
// V-7 (validate-ruleset.py) already constrains every declared `reduction` to
// (0, 1], which makes effectiveWeight necessarily within [0, baseWeight]. This
// asserts the ENGINE catches a violation independently, on its own execution
// path, rather than trusting that single point.
//
// The precedent is DEFECT-17: compute-ruleset-digest.mjs could verify a rule
// set's integrityDigest, but validate-ruleset.py never called it, so a
// hand-edited digest passed G-8 CONFORMANT regardless. Verification that
// exists somewhere is not verification that runs where it matters. V-14 closed
// that; this is the same reasoning applied to `reduction`.
//
// Both directions are exercised: a NEGATIVE reduction (suppression increasing
// weight — the property B1.2-2 names) and a reduction ABOVE 1 (driving
// effectiveWeight negative). The rule set is bypassed deliberately: these
// values could never come from a G-8-conformant rule set, which is the point.

for (const [label, badReduction] of [
  ['negative reduction (would INCREASE weight)', -0.5],
  ['reduction above 1 (would drive weight negative)', 1.5],
] as const) {
  const applications: readonly SuppressionApplication[] = [{
    suppressionId: 'S-BAD', targetFindingId: 'finding-1', targetRuleId: 'PARENT-RULE',
    guardEvaluations: [{ guardIndex: 0, held: true }], blockedByRuleId: null,
    applied: true, declaredReduction: badReduction,
  }];

  assert.throws(
    () => computeScoringAndAggregation(
      [fakeFinding({ ruleId: 'PARENT-RULE' })], applications, testRuleSet,
    ),
    /Suppression may only reduce weight/,
    `engine must reject ${label} independently of V-7`,
  );
}

// Control: the boundary values V-7 DOES permit must still pass cleanly.
for (const goodReduction of [0.0001, 0.5, 1] as const) {
  const applications: readonly SuppressionApplication[] = [{
    suppressionId: 'S-OK', targetFindingId: 'finding-1', targetRuleId: 'PARENT-RULE',
    guardEvaluations: [{ guardIndex: 0, held: true }], blockedByRuleId: null,
    applied: true, declaredReduction: goodReduction,
  }];
  const { scoring } = computeScoringAndAggregation(
    [fakeFinding({ ruleId: 'PARENT-RULE' })], applications, testRuleSet,
  );
  const entry = scoring[0]!;
  assert.ok(entry.effectiveWeight <= entry.baseWeight && entry.effectiveWeight >= 0,
    `reduction ${goodReduction} must stay within [0, baseWeight]`);
}

console.log('all stage5-6 fixture assertions passed');
