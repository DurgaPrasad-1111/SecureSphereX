/**
 * Tier-2 intervention (§9.4, §11.3/§11.4): the tier→action decision, the Medium
 * three-action semantics, High-has-no-bypass, monotonic escalation across passes,
 * and that proceeding logs an A-01 record whose effect is to make the auth-store
 * write carry interventionOverriddenInSession=true — proceeding NEVER teaches trust.
 *
 *   node --experimental-strip-types apps/extension/intervention.test.ts
 */

import assert from 'node:assert/strict';

import { decideIntervention, type ProceedRecord } from './intervention-logic.ts';
import { computeEffectiveTier, recordIntervention } from '../../packages/engine/stage7-8.ts';
import type { PriorPassState } from '../../packages/engine/stage7-8.ts';
import { buildAuthRecordRequest, buildLoginFingerprint, type PendingAuth } from './login-success.ts';
import type { AnalysisSessionId } from '../../packages/contracts/evidence.contract.v1.ts';

const ORIGIN = 'https://login.acmebank.example';
const proceed: ProceedRecord = { origin: ORIGIN, tier: 'Medium', suppressionId: 'A-01', at: 1 };

// ── 1. tier → action matrix (§9.4) ──────────────────────────────────────────
assert.equal(decideIntervention('Low', null, ORIGIN), 'none', 'Low (<30) -> passive badge only');
assert.equal(decideIntervention('Medium', null, ORIGIN), 'interstitial', 'Medium (30-59) -> interstitial');
assert.equal(decideIntervention('High', null, ORIGIN), 'block', 'High (>=60) -> hard block');
console.log('  [1] tier matrix: Low none / Medium interstitial / High block ✓');

// ── 2. Medium three-action semantics ────────────────────────────────────────
// PROCEED: an A-01 record for THIS origin suppresses the re-interstitial.
assert.equal(decideIntervention('Medium', proceed, ORIGIN), 'none', 'proceed on this origin -> no re-interstitial');
// A proceed on a DIFFERENT origin must NOT carry over.
assert.equal(decideIntervention('Medium', { ...proceed, origin: 'https://evil.example' }, ORIGIN), 'interstitial',
  'a proceed on another origin must not suppress this one');
// GO BACK / VIEW FINDINGS create no proceed record, so the interstitial stands.
assert.equal(decideIntervention('Medium', null, ORIGIN), 'interstitial', 'go-back / view-findings do not proceed');
console.log('  [2] Medium actions: proceed suppresses (this origin only); go-back / view-findings keep the interstitial ✓');

// ── 3. High has NO bypass — a Medium proceed cannot unlock a later High ─────
assert.equal(decideIntervention('High', proceed, ORIGIN), 'block',
  'High must BLOCK even with an A-01 proceed record for the origin (§6.4: A-01 never applies to the High-only rules)');
console.log('  [3] High no-bypass: an A-01 proceed does not unlock a High block ✓');

// ── 4. Monotonic escalation across passes (§11.3) ───────────────────────────
// pass 1: raw Medium -> effective Medium -> interstitial -> record the intervention.
let prior: PriorPassState | null = null;
const p1 = computeEffectiveTier('Medium', prior);
assert.equal(decideIntervention(p1.effectiveTier, null, ORIGIN), 'interstitial');
prior = recordIntervention(prior, p1.effectiveTier);
// pass 2: raw LOW (a de-escalation attempt) -> effective FLOORED to Medium -> still interstitial.
const p2 = computeEffectiveTier('Low', prior);
assert.equal(p2.effectiveTier, 'Medium', 'a later Low pass must NOT downgrade below the intervened Medium');
assert.equal(decideIntervention(p2.effectiveTier, null, ORIGIN), 'interstitial', 'monotonic: no downgrade to none');
// pass 3: raw High -> effective High -> block (escalation is unconstrained).
const p3 = computeEffectiveTier('High', prior);
assert.equal(p3.effectiveTier, 'High');
assert.equal(decideIntervention(p3.effectiveTier, null, ORIGIN), 'block', 'escalation to a High block is allowed');
console.log('  [4] monotonic: Medium held across a later Low pass; escalates freely to a High block ✓');

// ── 5. Proceeding NEVER teaches trust (G-02) ────────────────────────────────
const pending: PendingAuth = {
  origin: ORIGIN, fingerprint: buildLoginFingerprint(['password'], ['login']),
  credFindingActiveInSession: false, analysisSessionId: 'sess_x' as AnalysisSessionId,
  submitTimeMs: 0, navTimeMs: 1,
};
assert.equal(buildAuthRecordRequest(pending, false)?.interventionOverriddenInSession, false,
  'default (no intervention context): interventionOverriddenInSession = false');
assert.equal(buildAuthRecordRequest(pending, false, true)?.interventionOverriddenInSession, true,
  'a proceeded session sets interventionOverriddenInSession=true -> the auth store G-02 refuses to learn (never teaches trust)');
console.log('  [5] never teaches trust: a proceed sets interventionOverriddenInSession=true (G-02 blocks the store write) ✓');

console.log('Tier-2 intervention PROVEN: §9.4 tier gating (Low/Medium/High), Medium three-action semantics, '
  + 'High no-bypass, §11.3 monotonic escalation, and an A-01 proceed that never teaches auth-store trust.');
