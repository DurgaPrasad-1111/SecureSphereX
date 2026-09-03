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
  assembleEvaluationSet,
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

// ---------------------------------------------------------------------------
// 2b. The FULL SecurityEvaluation<M> envelope — constructible as of
//     2026-08-28, and with it invariant E-8 testable for the first time.
//
// Every earlier version of this file asserted that assembleSecurityEvaluation
// THREW: DEC-15 left envelope fields unresolved, so no real
// SecurityEvaluation could exist and E-8 ("Exactly one evaluation per module
// per pass. Never zero, never two.", evaluation.contract.v1.ts:307) could
// only be approximated by counting ModuleDispatchResults. `consistency` was
// the last blocked field, resolved via consistency.ts's per-module
// internal-coherence relations (DEC-21).
// ---------------------------------------------------------------------------

const evaluationDispatch = await evaluateAllModules(ssoFlow, uncalledStoreReader);
const evaluationSet = assembleEvaluationSet(ssoFlow, evaluationDispatch);

// E-8, asserted directly on real SecurityEvaluation objects.
assert.equal(Object.keys(evaluationSet).length, 10, 'E-8: exactly ten evaluations, never zero, never two');
assert.deepEqual([...Object.keys(evaluationSet)].sort(), [...ALL_MODULE_IDS].sort(),
  'E-8: exactly one evaluation per ModuleId');
assert.equal(new Set(ALL_MODULE_IDS.map((m) => evaluationSet[m].evaluationId)).size, 10,
  'E-8: ten evaluations must carry ten distinct evaluationIds');

for (const moduleId of ALL_MODULE_IDS) {
  const evaluation = evaluationSet[moduleId];
  // E-1: one evaluation originates from exactly one module.
  assert.equal(evaluation.moduleId, moduleId, `${moduleId}: E-1 — filed under the wrong module`);
  assert.equal(evaluation.contractVersion, '1.1.0', `${moduleId}: contractVersion`);
  assert.equal(evaluation.targetResourceId, ssoFlow.targetResourceId, `${moduleId}`);
  assert.equal(evaluation.analysisSessionId, ssoFlow.analysisSessionId, `${moduleId}`);
  assert.equal(evaluation.passOrdinal, ssoFlow.collectionContext.passOrdinal, `${moduleId}`);
  assert.equal(evaluation.moduleVersion, '0.1.0', `${moduleId}: per-module version`);
  assert.equal(evaluation.evidenceRefs.length, 1, `${moduleId}: E-5 — references its evidence`);
  assert.deepEqual(evaluation.indicators, [], `${moduleId}: indicators`);
  assert.match(evaluation.summary, /^\[DEC-15 UNRESOLVED\]/, `${moduleId}: summary placeholder`);
  assert.deepEqual(evaluation.collectionContext, ssoFlow.collectionContext, `${moduleId}`);

  // E-6 / DEC-21: the evaluability status and the consistency verdict must
  // agree — unevaluable is exactly the indeterminate case, and nothing else.
  assert.equal(evaluation.result.status, EXPECTED_STATUS[moduleId], `${moduleId}: evaluability`);
  if (evaluation.result.status === 'unevaluable') {
    assert.equal(evaluation.consistency, 'indeterminate',
      `${moduleId}: unevaluable must be indeterminate`);
  } else {
    assert.equal(evaluation.consistency, 'consistent',
      `${moduleId}: sso-flow's evidence is internally coherent, so every evaluated module must be consistent`);
  }
}

// sso-flow is a well-formed fixture: no module may report an internal
// contradiction. Stated as its own assertion so a future fixture edit that
// introduces one fails here rather than passing silently.
assert.equal(
  ALL_MODULE_IDS.filter((m) => evaluationSet[m].consistency === 'inconsistent').length, 0,
  'sso-flow: no module may be internally inconsistent',
);
// The four unevaluable modules are exactly the indeterminate ones.
assert.deepEqual(
  ALL_MODULE_IDS.filter((m) => evaluationSet[m].consistency === 'indeterminate').sort(),
  ['authContext', 'dns', 'downloadContext', 'ssl'],
  'sso-flow: indeterminate is exactly the unevaluable set',
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
//  CRED-03 unmatched — homograph.confusableSkeleton is absent() -> null, so
//          `neq(..., null)` is false; isIdn/containsNonAscii/isMixedScript are
//          all present(false). The whole first `or` fails. (Before the
//          fixtures were corrected this fired on 3 of 4 fixtures, because
//          they emitted present(<the domain itself>) rather than absent() —
//          see DEC-20 and the deceptive-IDN control in section 8.)
//  CRED-04 unmatched — hopCount 1 < redirect_hop_min 2 (and DEFECT-19's two
//          null domains independently make the notSameSite conjunct false).
//  CRED-05 unmatched — javascript.listenerOnCredentialField is present(false).
//  CRED-06 unmatched — url.isSecureScheme is true, so `not(is(...))` is false.
//  CRED-07 unmatched — neither form field is hidden or autocomplete-disabled.
//  CRED-A1 unmatched — javascript.credentialInterfaceInjected is present(false).
//  DL-01   unevaluable — §15.2 pre-check: its requiredModules include
//          downloadContext, which is unevaluable on this fixture (no download
//          evidence), so the rule is unevaluable BEFORE the predicate is
//          touched (asserted below). priorFindingActive is never reached here.
//          (Option C, 2026-09-03: priorFindingActive no longer throws — it
//          resolves against a threaded prior-pass boolean — so the former
//          'blocked' status is gone entirely. A fixture WITH real
//          downloadContext evidence would reach priorFindingActive and simply
//          resolve to match/noMatch from that boolean, never throw.)
//  DL-02   unmatched — downloadContext is unevaluable, so
//          `not(is(downloadContext.extensionMimeConsistent))` is unevaluable,
//          not a match. Before the DEFECT-22 fix this rule fabricated a match
//          on ALL FOUR fixtures, none of which has any download evidence.
//  PM-01   unmatched — permissionContext.requestedPermission is null, so
//          `neq(..., null)` is false.
//
// E-6 / §15.2 (added 2026-08-27): rules whose requiredModules include an
// unevaluable module are 'unevaluable', NOT 'unmatched'. On sso-flow that is
// CRED-02 (authContext) and DL-01/DL-02 (downloadContext). The distinction is
// mandated by evaluation.contract.v1.ts's invariant E-6 — "Stage 2 MUST
// distinguish it from evaluated-with-negative-findings" — and by §15.2's
// "a rule that could not be tested MUST NOT be recorded as a rule that found
// nothing." These three previously reported 'unmatched'.
assert.equal(statusOf('CRED-01'), 'unmatched');
assert.equal(statusOf('CRED-02'), 'unevaluable');
assert.equal(statusOf('CRED-03'), 'unmatched');
assert.equal(statusOf('CRED-06'), 'unmatched');
assert.equal(statusOf('CRED-07'), 'unmatched');
assert.equal(statusOf('DL-01'), 'unevaluable');
assert.equal(statusOf('DL-02'), 'unevaluable');
assert.equal(statusOf('PM-01'), 'unmatched');

// The unevaluable outcomes must name WHICH required modules were unevaluable
// and carry the module's own reason — RuleOutcome's `unevaluable` variant
// (passresult.contract.v1.ts:74-77) is typed exactly this way, so Stage 2's
// output can feed it without invention.
const outcomeOf = (ruleId: string) => matchResults.find((r) => r.ruleId === ruleId)!;
for (const [ruleId, expectedModule] of [
  ['CRED-02', 'authContext'], ['DL-01', 'downloadContext'], ['DL-02', 'downloadContext'],
] as const) {
  const outcome = outcomeOf(ruleId);
  assert.equal(outcome.status, 'unevaluable', `${ruleId}`);
  assert.ok(outcome.status === 'unevaluable' && outcome.unevaluableModules.includes(expectedModule),
    `${ruleId}: must name ${expectedModule} in unevaluableModules (§15.2)`);
  assert.equal(outcome.status === 'unevaluable' ? outcome.reason : null,
    'required_evidence_not_collected', `${ruleId}: carries the module's own reason`);
}

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
assert.deepEqual(firedRuleIds, [], 'sso-flow is a BENIGN fixture — no rule should fire on it');
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
//   NO rule fires on sso-flow. It is the benign cross-domain-SSO fixture:
//   the redirect crossing is real but expected, the login form is same-site
//   to the IdP, the domain is plain ASCII with no distinct skeleton, and no
//   download or permission request occurs.
//     primarySum = 0, aggravatorSum = 0, score = 0
//     thresholds: medium 30, high 60  ->  0 < 30  ->  Low
//
// Two rules that DID fire here earlier were both defects, now fixed:
//   DL-02   fabricated by DEFECT-22 (not() over unevaluable downloadContext)
//   CRED-03 fabricated by the fixture bug in DEC-20 (skeleton emitted as
//           present(<the domain>) instead of absent())
//
// Note this is NOT the "CRED-02 alone = 50" case: CRED-02 cannot fire on this
// fixture at all, because authContext is unevaluable without a fingerprint.

assert.equal(scoring.length, 0, 'no scoring entries — nothing fired on the benign fixture');
assert.equal(
  scoring.find((s) => s.ruleId === 'DL-02'), undefined,
  'DL-02 must produce no scoring entry: downloadContext is unevaluable (DEFECT-22)',
);
assert.equal(
  scoring.find((s) => s.ruleId === 'CRED-03'), undefined,
  'CRED-03 must produce no scoring entry: skeleton is null on a plain ASCII domain (DEC-20)',
);

assert.equal(aggregation.primarySum, 0, 'primarySum');
assert.equal(aggregation.aggravatorSum, 0, 'aggravatorSum');
assert.equal(aggregation.score, 0, 'score');
assert.deepEqual(aggregation.thresholds, { medium: 30, high: 60 });
assert.equal(aggregation.rawTier, 'Low', 'rawTier for sso-flow — a benign page must score Low');
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
// 'unevaluable', not 'unmatched': post-E-6 the §15.2 pre-check fires first
// (CRED-06 declares requiredModules ['loginForm','url']). Either way the
// DEFECT-22 property holds — it is not a match — but the reported status is
// now the honest one.
assert.equal(statusIn(urlBlindStatuses, 'CRED-06'), 'unevaluable',
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
assert.equal(statusOf('DL-02'), 'unevaluable',
  'DL-02 must not fire when downloadContext is unevaluable (DEFECT-22; E-6 status)');

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
assert.equal(statusIn(await statusesFor(pcBlind), 'PM-01'), 'unevaluable',
  'PM-01 must not fabricate a match when permissionContext is unevaluable');

// ---------------------------------------------------------------------------
// 8. DEC-20 regression control — CRED-03 on a genuinely deceptive domain.
//
//    The fixture correction (skeleton present(<domain>) -> absent()) stopped
//    CRED-03 firing on benign pages. That is only half the requirement: the
//    rule must still fire when a domain IS deceptive. Both directions are
//    asserted here, the same way section 7 does for the not() rules.
// ---------------------------------------------------------------------------

// A punycode IDN whose confusable skeleton collides with a different, real
// brand — 'xn--accunts-h1a.example.com' skeletonises to 'accounts.example.com'.
// The skeleton is genuinely DISTINCT from the domain, so present() is correct
// here (unlike the four benign fixtures, where absent() is correct).
const deceptiveIdn = structuredClone(ssoFlow);
(deceptiveIdn as unknown as { evidence: { domainRepresentation: Record<string, unknown> } })
  .evidence.domainRepresentation = {
    unicodeDomain: { state: 'present', value: 'ассounts.example.com' },
    punycodeDomain: { state: 'present', value: 'xn--accunts-h1a.example.com' },
    isIdn: { state: 'present', value: true },
    containsNonAscii: { state: 'present', value: true },
    scriptsUsed: { state: 'present', value: ['Latin', 'Cyrillic'] },
    isMixedScript: { state: 'present', value: true },
    confusableSkeleton: { state: 'present', value: 'accounts.example.com' },
  };

const deceptiveStatuses = await statusesFor(deceptiveIdn);
assert.equal(statusIn(deceptiveStatuses, 'CRED-03'), 'matched',
  'CRED-03 must still fire on a genuinely deceptive IDN — the fixture fix must not disable the rule');

// And the benign direction, on the corrected fixture as committed.
assert.equal(statusOf('CRED-03'), 'unmatched',
  'CRED-03 must not fire on a plain ASCII domain with no distinct skeleton (DEC-20)');

// Isolate the skeleton conjunct specifically: with the mixed-script and IDN
// signals forced false, a genuinely distinct skeleton must STILL carry the
// rule on its own — proving the neq(..., null) arm is doing real work rather
// than riding on isIdn/containsNonAscii.
const skeletonOnly = structuredClone(deceptiveIdn);
(skeletonOnly as unknown as { evidence: { domainRepresentation: Record<string, { state: string; value: unknown }> } })
  .evidence.domainRepresentation.isIdn = { state: 'present', value: false };
(skeletonOnly as unknown as { evidence: { domainRepresentation: Record<string, { state: string; value: unknown }> } })
  .evidence.domainRepresentation.containsNonAscii = { state: 'present', value: false };
(skeletonOnly as unknown as { evidence: { domainRepresentation: Record<string, { state: string; value: unknown }> } })
  .evidence.domainRepresentation.isMixedScript = { state: 'present', value: false };
assert.equal(statusIn(await statusesFor(skeletonOnly), 'CRED-03'), 'matched',
  'CRED-03 must fire on a distinct skeleton alone, with every other homograph signal false');

console.log('all sso-flow end-to-end pipeline assertions passed');
console.log(
  `  fired=${firedRuleIds.join(',')}  primarySum=${aggregation.primarySum}` +
  `  aggravatorSum=${aggregation.aggravatorSum}  score=${aggregation.score}` +
  `  rawTier=${aggregation.rawTier}`,
);
