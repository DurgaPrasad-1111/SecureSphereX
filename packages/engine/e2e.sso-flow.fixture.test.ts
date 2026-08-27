/**
 * END-TO-END pipeline test for the `sso-flow` fixture — the first test in
 * this repo that runs ONE fixture through the WHOLE chain in a single pass:
 *
 *   orchestrator dispatch (all 10 modules)
 *     -> Stage 2  predicate matching against the real rules-v0.1.0.json
 *     -> Stage 3  correlation finding generation
 *     -> Stage 4  contextual suppression
 *     -> Stage 5+6 effective weight + aggregation
 *     -> raw tier
 *
 * WHY THIS FILE EXISTS — `tools/ci/test-fixtures.ts`'s four "round-trip"
 * checks (G-7) do NOT exercise the engine at all. They are pure JSON
 * serialization identity checks (`JSON.stringify(f) === JSON.stringify(
 * JSON.parse(JSON.stringify(f)))`) plus three Observation-state spot checks
 * (F-5/F-6/F-7). No module, no orchestrator, and no stage is imported by
 * that script. The per-module and per-stage `*.fixture.test.ts` files each
 * cover their own unit in isolation, with hand-built inputs. Nothing before
 * this file connected them.
 *
 * EXPECTED VALUES ARE HAND-COMPUTED, NOT OBSERVED — every assertion below
 * was derived by reading rulesets/rules-v0.1.0.json and fixtures/sso-flow.ts
 * BEFORE the file was first run, so a passing run is evidence about the
 * pipeline rather than a transcript of whatever it happened to emit. The
 * derivation is recorded at each assertion.
 *
 * Run directly:
 *   node --experimental-strip-types packages/engine/e2e.sso-flow.fixture.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ssoFlow } from '../../fixtures/sso-flow.ts';
import {
  evaluateAllModules,
  assembleSecurityEvaluation,
  Stage1EnvelopeBlockedError,
} from './orchestrator.ts';
import { matchAllRules, matchRule } from './stage2.ts';
import { generateCorrelationFindings } from './stage3.ts';
import { generateSuppressionApplications } from './stage4.ts';
import { computeScoringAndAggregation } from './stage5-6.ts';
import type { ModuleId } from '../contracts/evaluation.contract.v1.ts';
import type { RuleSet } from '../contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../contracts/boundary.interfaces.v1.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const ruleSet = JSON.parse(
  readFileSync(join(REPO_ROOT, 'rulesets', 'rules-v0.1.0.json'), 'utf8'),
) as RuleSet;

const ALL_MODULE_IDS: readonly ModuleId[] = [
  'url', 'ssl', 'dns', 'redirect', 'loginForm',
  'javascript', 'homograph', 'authContext', 'downloadContext', 'permissionContext',
];

/**
 * sso-flow's `loginInterface.fingerprint` is `notCollected('tier_not_reached')`,
 * so authContext.ts returns unevaluable BEFORE ever reaching the store.
 * A reader that throws proves the store is genuinely never consulted —
 * the same convention authContext.fixture.test.ts already uses.
 */
const uncalledStoreReader: AuthStoreReader = {
  lookup: async () => {
    throw new Error('storeReader.lookup() must not be called — sso-flow has fingerprint notCollected');
  },
};

// ---------------------------------------------------------------------------
// 1. Orchestrator dispatch — the REAL dispatch layer, not manual compute* calls
// ---------------------------------------------------------------------------

const evaluations = await evaluateAllModules(ssoFlow, uncalledStoreReader);

// 2. Exactly one dispatch result per module, per pass.
assert.equal(Object.keys(evaluations).length, 10, 'expected exactly 10 module results');
for (const moduleId of ALL_MODULE_IDS) {
  const dispatch = evaluations[moduleId];
  assert.ok(dispatch !== undefined, `${moduleId}: missing from the evaluation set`);
  assert.equal(dispatch.moduleId, moduleId, `${moduleId}: result is tagged with the wrong moduleId`);
}

// One evaluationId per module, all distinct — "exactly one evaluation per
// module per pass" is only meaningful if the ids don't collide.
const evaluationIds = ALL_MODULE_IDS.map((m) => evaluations[m].evaluationId);
assert.equal(new Set(evaluationIds).size, 10, 'evaluationIds are not distinct across the 10 modules');

// Per-module evaluability, hand-derived from fixtures/sso-flow.ts:
//   url/redirect/loginForm/javascript/homograph  — all required fields present
//   permissionContext — requestedPermission/precededByUserGesture absent (not
//     notCollected) and pageAgeMs present, so the module is EVALUABLE with
//     nulls, per its own nullable-field convention
//   ssl/dns — every field notCollected('api_unavailable')
//   downloadContext — every field notCollected('not_applicable')
//   authContext — fingerprint notCollected('tier_not_reached')
const EXPECTED_STATUS: Readonly<Record<ModuleId, 'evaluated' | 'unevaluable'>> = {
  url: 'evaluated',
  redirect: 'evaluated',
  loginForm: 'evaluated',
  javascript: 'evaluated',
  homograph: 'evaluated',
  permissionContext: 'evaluated',
  ssl: 'unevaluable',
  dns: 'unevaluable',
  downloadContext: 'unevaluable',
  authContext: 'unevaluable',
};
for (const moduleId of ALL_MODULE_IDS) {
  assert.equal(
    evaluations[moduleId].result.status,
    EXPECTED_STATUS[moduleId],
    `${moduleId}: unexpected evaluability status`,
  );
}

// The FULL SecurityEvaluation<M> envelope is still unreachable — DEC-15's
// four unresolved fields. assembleSecurityEvaluation is typed Promise<never>
// and always throws. Asserted rather than skipped, so that the day DEC-15 is
// resolved this test fails loudly and gets updated instead of silently
// continuing to describe a pipeline that has changed shape.
await assert.rejects(
  () => assembleSecurityEvaluation(ssoFlow, 'url', uncalledStoreReader),
  (err: unknown) => {
    assert.ok(err instanceof Stage1EnvelopeBlockedError, 'expected Stage1EnvelopeBlockedError');
    assert.deepEqual(err.missingFields, ['moduleVersion', 'indicators', 'consistency', 'summary']);
    return true;
  },
  'assembleSecurityEvaluation should still be blocked by DEC-15',
);

// ---------------------------------------------------------------------------
// 3. Stage 2 — predicate matching against the REAL rule set
// ---------------------------------------------------------------------------

const matchResults = matchAllRules(evaluations, ruleSet);
assert.equal(matchResults.length, ruleSet.rules.length, 'one match result per rule');

const statusOf = (ruleId: string): string => {
  const found = matchResults.find((r) => r.ruleId === ruleId);
  assert.ok(found !== undefined, `no match result for ${ruleId}`);
  return found.status;
};

// Hand-derived, rule by rule, against fixtures/sso-flow.ts:
//
//  CRED-01 unmatched — form.actionRegistrableDomain 'idp-example.com' ===
//          url.registrableDomain 'idp-example.com', so notSameSite is false.
//  CRED-02 unmatched — authContext is unevaluable, so `eq
//          authContext.originPresent false` resolves to the UNEVALUABLE
//          sentinel and returns false (stage2.ts's eq/neq branch).
//  CRED-03 MATCHED  — homograph.confusableSkeleton is present(
//          'login.idp-example.com'), i.e. non-null, satisfying `neq(...,null)`;
//          loginForm.credentialFormPresent is true. Both conjuncts hold.
//  CRED-04 unmatched — hopCount 1 < redirect_hop_min 2 (and DEFECT-19's two
//          null domains independently make the notSameSite conjunct false).
//  CRED-05 unmatched — javascript.listenerOnCredentialField is present(false).
//  CRED-06 unmatched — url.isSecureScheme is true, so `not(is(...))` is false.
//  CRED-07 unmatched — neither form field is hidden or autocomplete-disabled.
//  CRED-A1 unmatched — javascript.credentialInterfaceInjected is present(false).
//  DL-01   unmatched — NOT 'blocked'. Its predicate does contain
//          priorFindingActive, but that operand is never reached: the `and`
//          is evaluated by Array.every, which short-circuits on the FIRST
//          false conjunct, and `inSet(downloadContext.declaredExtension,
//          executableTypes)` is already false because downloadContext is
//          unevaluable (the UNEVALUABLE sentinel is not a string). So the
//          store-dependency throw never fires on this fixture. Worth stating
//          explicitly: DL-01's blocked-ness is INPUT-DEPENDENT, not a
//          property of the rule — a fixture with real downloadContext
//          evidence would reach priorFindingActive and throw.
//  DL-02   unmatched — downloadContext is unevaluable, so
//          `not(is(downloadContext.extensionMimeConsistent))` is unevaluable,
//          not a match. Before the DEFECT-22 fix this rule fabricated a match
//          on ALL FOUR fixtures, none of which has any download evidence.
//  PM-01   unmatched — permissionContext.requestedPermission is null, so
//          `neq(..., null)` is false.
assert.equal(statusOf('CRED-01'), 'unmatched');
assert.equal(statusOf('CRED-02'), 'unmatched');
assert.equal(statusOf('CRED-03'), 'matched');
assert.equal(statusOf('CRED-06'), 'unmatched');
assert.equal(statusOf('CRED-07'), 'unmatched');
assert.equal(statusOf('DL-01'), 'unmatched');
assert.equal(statusOf('DL-02'), 'unmatched');
assert.equal(statusOf('PM-01'), 'unmatched');

// ---------------------------------------------------------------------------
// 4. The three known-dead rules: prove NO CRASH, then prove NO MATCH.
//    "No output" is not evidence of "no crash" — each is invoked on its own,
//    outside matchAllRules' try/catch, so a throw would surface here.
// ---------------------------------------------------------------------------

for (const ruleId of ['CRED-04', 'CRED-05', 'CRED-A1'] as const) {
  const rule = ruleSet.rules.find((r) => r.id === ruleId);
  assert.ok(rule !== undefined, `${ruleId} missing from the rule set`);

  let threw: unknown = null;
  let matched: boolean | null = null;
  try {
    matched = matchRule(rule, evaluations, ruleSet);
  } catch (err) {
    threw = err;
  }

  assert.equal(threw, null, `${ruleId}: matchRule threw instead of returning cleanly`);
  assert.equal(matched, false, `${ruleId}: expected a clean non-match, got ${matched}`);
  assert.equal(statusOf(ruleId), 'unmatched', `${ruleId}: matchAllRules disagrees with matchRule`);
}

// ---------------------------------------------------------------------------
// 5. Stage 3 -> Stage 4 -> Stage 5+6
// ---------------------------------------------------------------------------

const findings = generateCorrelationFindings(ssoFlow, evaluations, matchResults, ruleSet);
const firedRuleIds = findings.map((f) => f.ruleId).sort();

// One finding per matched rule; blocked and unmatched produce none.
assert.deepEqual(firedRuleIds, ['CRED-03'], 'unexpected set of fired rules');
assert.equal(new Set(findings.map((f) => f.findingId)).size, findings.length, 'findingIds are not distinct');
for (const finding of findings) {
  assert.equal(finding.targetResourceId, ssoFlow.targetResourceId);
  assert.equal(finding.analysisSessionId, ssoFlow.analysisSessionId);
  assert.equal(finding.passOrdinal, ssoFlow.collectionContext.passOrdinal);
}

const suppressionApplications = generateSuppressionApplications(findings, evaluations, ruleSet);

// Neither fired rule is a suppression target: S-01 targets CRED-02/01/04 and
// lists CRED-03 in neverApplies; S-02 targets CRED-01 only. So no application
// may be recorded as `applied` against either finding.
for (const application of suppressionApplications) {
  assert.equal(application.applied, false, `${application.suppressionId} unexpectedly applied to a fired finding`);
}

const { scoring, aggregation } = computeScoringAndAggregation(findings, suppressionApplications, ruleSet);

// ---------------------------------------------------------------------------
// 6. Final score and tier — the hand-computed value
// ---------------------------------------------------------------------------
//
//   CRED-03  primary,    baseWeight 45, no suppression -> effectiveWeight 45,
//            not subsumed (subsumption table is empty) -> counted.
//              primarySum = 45
//   DL-02    does not fire at all post-DEFECT-22 — downloadContext is
//            unevaluable, so its `not(is(...))` operand is unevaluable rather
//            than a fabricated match.
//              aggravatorSum = 0
//   score = 45 + 0 = 45
//   thresholds: medium 30, high 60  ->  30 <= 45 < 60  ->  Medium
//
// Note this is NOT the "CRED-02 alone = 50" case: CRED-02 cannot fire on this
// fixture at all, because authContext is unevaluable without a fingerprint.

const cred03 = scoring.find((s) => s.ruleId === 'CRED-03');
assert.ok(cred03 !== undefined, 'no scoring entry for CRED-03');
assert.equal(cred03.ruleType, 'primary');
assert.equal(cred03.baseWeight, 45);
assert.equal(cred03.maxReduction, 0);
assert.equal(cred03.effectiveWeight, 45);
assert.equal(cred03.subsumed, false);
assert.equal(cred03.countedInScore, true);

assert.equal(scoring.length, 1, 'exactly one scoring entry — only CRED-03 fired');
assert.equal(
  scoring.find((s) => s.ruleId === 'DL-02'), undefined,
  'DL-02 must produce no scoring entry: downloadContext is unevaluable (DEFECT-22)',
);

assert.equal(aggregation.primarySum, 45, 'primarySum');
assert.equal(aggregation.aggravatorSum, 0, 'aggravatorSum');
assert.equal(aggregation.score, 45, 'score');
assert.deepEqual(aggregation.thresholds, { medium: 30, high: 60 });
assert.equal(aggregation.rawTier, 'Medium', 'rawTier for sso-flow');
assert.equal(aggregation.subsumptionApplied.length, 0, 'subsumption table is empty at this rule-set version');

// ---------------------------------------------------------------------------
// 7. DEFECT-22 regression matrix — every not()-wrapped predicate in
//    rules-v0.1.0.json, on BOTH an evaluable and an unevaluable operand.
//
//    Exactly three not() nodes exist across all 11 rules (and none in either
//    suppression guard set), each wrapping a bare `is`:
//      CRED-06  not(is(url.isSecureScheme))                      module: url
//      DL-02    not(is(downloadContext.extensionMimeConsistent))  module: downloadContext
//      PM-01    not(is(permissionContext.precededByUserGesture)) module: permissionContext
//
//    For each: the negated field must drive a real match when its module is
//    evaluable, and must NOT fabricate one when the module is unevaluable.
// ---------------------------------------------------------------------------

const statusIn = (results: readonly { ruleId: string; status: string }[], ruleId: string): string => {
  const found = results.find((r) => r.ruleId === ruleId);
  assert.ok(found !== undefined, `no match result for ${ruleId}`);
  return found.status;
};

async function statusesFor(evidence: unknown): Promise<readonly { ruleId: string; status: string }[]> {
  const ev = await evaluateAllModules(evidence as typeof ssoFlow, uncalledStoreReader);
  return matchAllRules(ev, ruleSet);
}

// --- CRED-06: not(is(url.isSecureScheme)) ---------------------------------

// Evaluable + insecure -> the negation is a REAL match (rule fires).
const httpEvidence = structuredClone(ssoFlow) as typeof ssoFlow & Record<string, never>;
(httpEvidence as unknown as { evidence: { url: { scheme: { value: string } } } }).evidence.url.scheme.value = 'http';
assert.equal(statusIn(await statusesFor(httpEvidence), 'CRED-06'), 'matched',
  'CRED-06 must still fire on a genuinely insecure scheme — the fix must not disable real matches');

// Evaluable + secure -> a real noMatch.
assert.equal(statusOf('CRED-06'), 'unmatched', 'CRED-06 on https (evaluable) must not match');

// Unevaluable url module -> must NOT fabricate a match. This is the latent
// case DEFECT-22 exposed: CRED-06 is a PRIMARY at weight 40 that counts in
// score, so a fabricated match here would corrupt the tier directly.
const urlBlind = structuredClone(ssoFlow);
(urlBlind as unknown as { evidence: { url: { scheme: { state: string; reason: string } } } })
  .evidence.url.scheme = { state: 'notCollected', reason: 'api_unavailable' };
const urlBlindStatuses = await statusesFor(urlBlind);
assert.equal(statusIn(urlBlindStatuses, 'CRED-06'), 'unmatched',
  'CRED-06 must not fabricate a match when the url module is unevaluable (DEFECT-22)');

// --- DL-02: not(is(downloadContext.extensionMimeConsistent)) --------------

// Evaluable, with a genuinely inconsistent extension/MIME pair -> real match.
const realDownload = structuredClone(ssoFlow);
(realDownload as unknown as { evidence: { downloadContext: Record<string, unknown> } }).evidence.downloadContext = {
  downloadUrl: { state: 'present', value: 'https://cdn.evil.tld/installer.exe' },
  downloadRegistrableDomain: { state: 'present', value: 'evil.tld' },
  referrerUrl: { state: 'present', value: 'https://app.example.com/dashboard' },
  referrerRegistrableDomain: { state: 'present', value: 'example.com' },
  declaredFilename: { state: 'present', value: 'installer.exe' },
  declaredExtension: { state: 'present', value: 'exe' },
  declaredMimeType: { state: 'present', value: 'image/png' },
  hasCompoundExtension: { state: 'present', value: false },
};
const realDownloadStatuses = await statusesFor(realDownload);
assert.equal(statusIn(realDownloadStatuses, 'DL-02'), 'matched',
  'DL-02 must still fire on a genuinely inconsistent extension/MIME pair');

// Unevaluable downloadContext -> must NOT fire. The original DEFECT-22 case.
assert.equal(statusOf('DL-02'), 'unmatched',
  'DL-02 must not fire when downloadContext is unevaluable (DEFECT-22)');

// --- PM-01: not(is(permissionContext.precededByUserGesture)) --------------

// Evaluable, permission requested with no gesture and a young page -> match.
const realPermission = structuredClone(ssoFlow);
(realPermission as unknown as { evidence: { permissionContext: Record<string, unknown> } })
  .evidence.permissionContext = {
    requestedPermission: { state: 'present', value: 'camera' },
    requestingOrigin: { state: 'present', value: 'https://login.idp-example.com' },
    precededByUserGesture: { state: 'present', value: false },
    pageAgeMs: { state: 'present', value: 400 },
  };
assert.equal(statusIn(await statusesFor(realPermission), 'PM-01'), 'matched',
  'PM-01 must still fire on a real no-gesture permission request');

// Unevaluable permissionContext -> must not match. PM-01 was already
// protected here, but only accidentally: its FIRST conjunct
// (neq requestedPermission null) short-circuits before the not() is reached.
// Asserted so that reordering the conjuncts can never silently expose it.
const pcBlind = structuredClone(ssoFlow);
(pcBlind as unknown as { evidence: { permissionContext: { requestedPermission: unknown } } })
  .evidence.permissionContext.requestedPermission = { state: 'notCollected', reason: 'api_unavailable' };
assert.equal(statusIn(await statusesFor(pcBlind), 'PM-01'), 'unmatched',
  'PM-01 must not fabricate a match when permissionContext is unevaluable');

console.log('all sso-flow end-to-end pipeline assertions passed');
console.log(
  `  fired=${firedRuleIds.join(',')}  primarySum=${aggregation.primarySum}` +
  `  aggravatorSum=${aggregation.aggravatorSum}  score=${aggregation.score}` +
  `  rawTier=${aggregation.rawTier}`,
);
