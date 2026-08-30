/**
 * End-to-end fixture test for `runAnalysisPass` — the engine's first
 * production entry point.
 *
 * Distinct from `e2e.sso-flow.fixture.test.ts`, which manually sequences the
 * stages for ONE fixture and stops at Stage 6. This exercises all FOUR
 * committed fixtures through the real entry point, including Stages 7 and 8,
 * and asserts the full ten-field `AggregationRecord`.
 *
 * The central claim under test is that this is a PURE WIRING exercise: every
 * score and tier must be byte-identical to what the stages already produced
 * when driven by hand. A difference here would mean the wiring changed
 * behaviour, which it must not.
 *
 * Run directly:
 *   node --experimental-strip-types packages/engine/pass.fixture.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAnalysisPass } from './pass.ts';
import { recordIntervention } from './stage7-8.ts';
import type { PriorPassState } from './stage7-8.ts';
import type { ModuleId } from '../contracts/evaluation.contract.v1.ts';
import type { RuleSet } from '../contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../contracts/boundary.interfaces.v1.ts';
import type { RiskTier } from '../contracts/passresult.contract.v1.ts';
import { cleanLogin } from '../../fixtures/clean-login.ts';
import { noCredential } from '../../fixtures/no-credential.ts';
import { offOriginPost } from '../../fixtures/off-origin-post.ts';
import { ssoFlow } from '../../fixtures/sso-flow.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ruleSet = JSON.parse(
  readFileSync(join(REPO_ROOT, 'rulesets', 'rules-v0.1.0.json'), 'utf8'),
) as RuleSet;

const ALL_MODULE_IDS: readonly ModuleId[] = [
  'url', 'ssl', 'dns', 'redirect', 'loginForm',
  'javascript', 'homograph', 'authContext', 'downloadContext', 'permissionContext',
];

/**
 * Throws if called. Every committed fixture has `loginInterface.fingerprint`
 * as `notCollected`, so `authContext` returns `unevaluable` BEFORE reaching
 * the store — this reader proves the pipeline genuinely never touches it, so
 * a first pass needs no persistence of any kind.
 */
const uncalledStoreReader: AuthStoreReader = {
  lookup: async () => {
    throw new Error('storeReader.lookup() must not be called — every fixture has fingerprint notCollected');
  },
};

const FIXTURES = {
  'clean-login': cleanLogin,
  'no-credential': noCredential,
  'off-origin-post': offOriginPost,
  'sso-flow': ssoFlow,
};

/**
 * The scores and tiers already established by the per-stage tests. Restated
 * here as an INDEPENDENT expectation, hand-carried rather than recomputed:
 * if the wiring changed behaviour, these are what would move.
 */
const EXPECTED: Readonly<Record<string, { score: number; tier: RiskTier; fired: readonly string[] }>> = {
  'clean-login': { score: 0, tier: 'Low', fired: [] },
  'no-credential': { score: 0, tier: 'Low', fired: [] },
  'off-origin-post': { score: 45, tier: 'Medium', fired: ['CRED-01'] },
  'sso-flow': { score: 0, tier: 'Low', fired: [] },
};

// --- Part 1: all four fixtures, prior = null (first pass of a Session) ----

for (const [name, evidence] of Object.entries(FIXTURES)) {
  const outcome = await runAnalysisPass(evidence, ruleSet, uncalledStoreReader, null);
  const expected = EXPECTED[name]!;
  const agg = outcome.aggregation;

  // Zero behaviour change — the whole point of this file.
  assert.equal(agg.score, expected.score, `${name}: score must be unchanged by wiring`);
  assert.equal(agg.rawTier, expected.tier, `${name}: rawTier must be unchanged by wiring`);
  assert.deepEqual(
    [...outcome.findings.map((f) => f.ruleId)].sort(), [...expected.fired].sort(),
    `${name}: the same rules must fire`,
  );

  // §11.3 imposes NO floor when no intervention has ever been presented —
  // which is every first pass, and every Session of Tier 0/1 passes.
  assert.equal(agg.effectiveTier, agg.rawTier,
    `${name}: null prior -> effectiveTier IS rawTier, no floor exists to apply`);
  assert.equal(agg.monotonicFloorApplied, false, `${name}: nothing was floored`);
  assert.equal(agg.interventionLocked, false, `${name}: no intervention has been presented`);

  // The AggregationRecord is COMPLETE — all ten fields, not a partial.
  assert.deepEqual(
    Object.keys(agg).sort(),
    ['aggravatorSum', 'effectiveTier', 'interventionLocked', 'monotonicFloorApplied',
      'primarySum', 'rawTier', 'ruleSetVersion', 'score', 'subsumptionApplied', 'thresholds'].sort(),
    `${name}: AggregationRecord must carry all ten contract fields`,
  );
  assert.equal(agg.ruleSetVersion, ruleSet.ruleSetVersion, `${name}: ruleSetVersion carried through`);
  assert.deepEqual(agg.thresholds, { medium: 30, high: 60 }, `${name}: thresholds from the rule set (§13.2)`);
  assert.equal(agg.primarySum + agg.aggravatorSum, agg.score, `${name}: score is the sum of its parts`);

  // ── DEFECT-30's positive proof: ONE dispatch per module per pass ───────
  //
  // Asserted DIRECTLY, not inferred from the fixtures still scoring the same.
  // Each module's envelope must carry the SAME evaluationId that the dispatch
  // feeding Stages 2-4 used for that module — which is only possible if Stage
  // 1 ran once and was threaded, not run twice.
  //
  // The cross-check is `findings[].evaluationRefs`: stage3.ts builds those
  // from the DISPATCH results, while `outcome.evaluations` are the ENVELOPES.
  // Before the fix these came from two independent dispatches and could never
  // match; every ref below matching an envelope id is the duplication being
  // gone, observed rather than assumed.
  const envelopeIds = new Set(ALL_MODULE_IDS.map((m) => outcome.evaluations[m].evaluationId));
  for (const finding of outcome.findings) {
    for (const ref of finding.evaluationRefs) {
      assert.ok(
        envelopeIds.has(ref),
        `${name}: finding ${finding.ruleId} references evaluationId ${ref}, which is in NO envelope — ` +
        'Stage 1 dispatched more than once (DEFECT-30)',
      );
    }
  }

  // E-8 through the NEW entry point. NOW TRUE BY CONSTRUCTION, not merely
  // empirically: runAnalysisPass makes exactly one `evaluateAllModules` call,
  // which yields exactly one ModuleDispatchResult per ModuleId, and
  // `assembleEvaluationSet` maps those one-to-one. No code path in the pass
  // can produce a second evaluation for any module. Asserted anyway — a
  // structural guarantee that nothing checks is one refactor from being
  // untrue.
  assert.equal(Object.keys(outcome.evaluations).length, 10, `${name}: E-8 — ten evaluations, never zero, never two`);
  assert.deepEqual([...Object.keys(outcome.evaluations)].sort(), [...ALL_MODULE_IDS].sort(),
    `${name}: E-8 — exactly one per ModuleId`);
  for (const moduleId of ALL_MODULE_IDS) {
    // E-1: an evaluation originates from exactly one module, and is filed
    // under the module it came from.
    assert.equal(outcome.evaluations[moduleId].moduleId, moduleId, `${name}/${moduleId}: E-1`);
  }
  assert.equal(
    new Set(ALL_MODULE_IDS.map((m) => outcome.evaluations[m].evaluationId)).size, 10,
    `${name}: E-8 — ten distinct evaluationIds`,
  );

  // Structural coherence of the rest of the outcome.
  assert.equal(outcome.ruleOutcomes.length, ruleSet.rules.length, `${name}: one outcome per rule`);
  assert.equal(outcome.scoring.length, outcome.findings.length, `${name}: P-3 — one ScoringEntry per finding`);
  const matched = outcome.ruleOutcomes.filter((r) => r.status === 'matched').map((r) => r.ruleId).sort();
  assert.deepEqual([...outcome.findings.map((f) => f.ruleId)].sort(), matched,
    `${name}: P-2 — every matched outcome has a corresponding finding`);
}

// --- Part 2: a real SECOND pass, prior != null, hand-constructed ----------
//
// The floor must apply through the FULL pipeline, not only in stage7-8.ts's
// isolated unit tests. No store is involved: `prior` is built by calling
// `recordIntervention`, exactly as a Session-owning caller would.

{
  // Pass 1 — sso-flow scores 0/Low on its own.
  const pass1 = await runAnalysisPass(ssoFlow, ruleSet, uncalledStoreReader, null);
  assert.equal(pass1.aggregation.rawTier, 'Low');
  assert.equal(pass1.aggregation.effectiveTier, 'Low');

  // Between passes: a Tier 2 gate presented a warning at Medium. Only the
  // client can observe this (boundary.interfaces.v1.ts's InterventionReporter),
  // so it arrives as a value, never a store read.
  const prior: PriorPassState = recordIntervention(null, 'Medium');
  assert.equal(prior.highestInterventionTier, 'Medium');
  assert.equal(prior.interventionPresented, true);

  // Pass 2 — same evidence, same rule set, but now inside a Session that has
  // already intervened at Medium.
  const pass2 = await runAnalysisPass(ssoFlow, ruleSet, uncalledStoreReader, prior);

  assert.equal(pass2.aggregation.score, 0, 'the score itself is unaffected by escalation');
  assert.equal(pass2.aggregation.rawTier, 'Low', 'rawTier still reflects the score alone');
  assert.equal(pass2.aggregation.effectiveTier, 'Medium',
    '§11.3: the tier SHALL NOT be lowered below one that produced an intervention');
  assert.equal(pass2.aggregation.monotonicFloorApplied, true, '§11.3: the floor was applied');
  assert.equal(pass2.aggregation.interventionLocked, true, '§11.4: the intervention is final for the Session');
  assert.notEqual(pass2.aggregation.rawTier, pass2.aggregation.effectiveTier,
    'P-9: both tiers recorded distinctly, never collapsed');

  // Pass 3 — the intervention escalates to High; the floor rises with it.
  const priorAfterEscalation = recordIntervention(prior, 'High');
  const pass3 = await runAnalysisPass(ssoFlow, ruleSet, uncalledStoreReader, priorAfterEscalation);
  assert.equal(pass3.aggregation.effectiveTier, 'High',
    '§11.3 floors at the HIGHEST intervened tier, not the most recent');
  assert.equal(pass3.aggregation.monotonicFloorApplied, true);

  // A Session that never intervened imposes no floor, even at a high tier —
  // the distinction §11.3 actually draws (see DEFECT-28's sibling reasoning
  // in stage7-8.ts's header).
  const neverIntervened: PriorPassState = { highestInterventionTier: null, interventionPresented: false };
  const pass4 = await runAnalysisPass(ssoFlow, ruleSet, uncalledStoreReader, neverIntervened);
  assert.equal(pass4.aggregation.effectiveTier, 'Low',
    'no intervention -> no floor, even with a prior pass on record');
  assert.equal(pass4.aggregation.monotonicFloorApplied, false);
  assert.equal(pass4.aggregation.interventionLocked, false);
}

// --- Part 3: off-origin-post as a second pass — floor BELOW rawTier ------
//
// Confirms the floor does not DEPRESS a genuinely higher tier: §11.3
// constrains de-escalation only ("A later pass MAY raise the tier freely").

{
  const prior = recordIntervention(null, 'Low');
  const outcome = await runAnalysisPass(offOriginPost, ruleSet, uncalledStoreReader, prior);
  assert.equal(outcome.aggregation.rawTier, 'Medium');
  assert.equal(outcome.aggregation.effectiveTier, 'Medium',
    'rawTier above the floor is kept — escalation is unconstrained');
  assert.equal(outcome.aggregation.monotonicFloorApplied, false, 'nothing was raised');
  assert.equal(outcome.aggregation.interventionLocked, true, 'the lock is still reported');
}

console.log('all runAnalysisPass end-to-end assertions passed (4 fixtures, first pass + escalated passes)');
