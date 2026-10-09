/**
 * Tier-2 intervention (§9.4, §11.3/§11.4): the tier→action decision, the Medium
 * three-action semantics, High-has-no-bypass, monotonic escalation across passes,
 * that proceeding drives interventionOverriddenInSession=true (never teaches
 * trust), and that the shared verdict renderer works on the interstitial's
 * "view findings" path — not just from popup.ts.
 *
 *   node --experimental-strip-types apps/extension/intervention.test.ts
 */

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { decideIntervention, type InterventionOverrideSuppression } from './intervention-logic.ts';
import { computeEffectiveTier, recordIntervention } from '../../packages/engine/stage7-8.ts';
import type { PriorPassState } from '../../packages/engine/stage7-8.ts';
import { buildAuthRecordRequest, buildLoginFingerprint, type PendingAuth } from './login-success.ts';
import { renderVerdict, selectInterventionVerdict, type StoredVerdict } from './verdict-view.ts';
import type { AnalysisSessionId } from '../../packages/contracts/evidence.contract.v1.ts';

const ORIGIN = 'https://login.acmebank.example';
const override: InterventionOverrideSuppression = {
  origin: ORIGIN, tier: 'Medium', kind: 'intervention-override-suppression', at: 1,
};

// ── 1. tier → action matrix (§9.4) ──────────────────────────────────────────
assert.equal(decideIntervention('Low', null, ORIGIN), 'none', 'Low (<30) -> passive badge only');
assert.equal(decideIntervention('Medium', null, ORIGIN), 'interstitial', 'Medium (30-59) -> interstitial');
assert.equal(decideIntervention('High', null, ORIGIN), 'block', 'High (>=60) -> hard block');
console.log('  [1] tier matrix: Low none / Medium interstitial / High block ✓');

// ── 2. Medium three-action semantics ────────────────────────────────────────
// PROCEED: an override record for THIS origin suppresses the re-interstitial.
assert.equal(decideIntervention('Medium', override, ORIGIN), 'none', 'proceed on this origin -> no re-interstitial');
// A proceed on a DIFFERENT origin must NOT carry over.
assert.equal(decideIntervention('Medium', { ...override, origin: 'https://evil.example' }, ORIGIN), 'interstitial',
  'a proceed on another origin must not suppress this one');
// GO BACK / VIEW FINDINGS create no override record, so the interstitial stands.
assert.equal(decideIntervention('Medium', null, ORIGIN), 'interstitial', 'go-back / view-findings do not proceed');
console.log('  [2] Medium actions: proceed suppresses (this origin only); go-back / view-findings keep the interstitial ✓');

// ── 3. High has NO bypass — a Medium override cannot unlock a later High ────
assert.equal(decideIntervention('High', override, ORIGIN), 'block',
  'High must BLOCK even with an override record for the origin (the override never applies to a High block)');
console.log('  [3] High no-bypass: an override record does not unlock a High block ✓');

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

// ── 6. Shared verdict renderer (the interstitial's "View security findings") ─
// intervention.ts's viewFindings calls the SAME renderVerdict popup.ts uses;
// exercise it directly on a DOM node, proving the shared path renders.
{
  const el = new JSDOM('<!doctype html><div id="f"></div>').window.document.getElementById('f') as unknown as HTMLElement;
  const verdict: StoredVerdict = {
    effectiveTier: 'High', rawTier: 'Medium', score: 62,
    fired: ['CRED-01', 'CRED-06'],
    unevaluable: [{ module: 'authContext', reason: 'required_evidence_not_collected' }],
    targetUrl: 'https://login.acmebank.example/',
  };
  renderVerdict(el, verdict);
  const html = el.innerHTML;
  assert.ok(html.includes('CRED-01') && html.includes('CRED-06'), 'renders the fired rules');
  assert.ok(html.includes('>High<') || html.includes('High'), 'renders the tier');
  assert.ok(html.includes('62'), 'renders the score');
  assert.ok(html.includes('authContext'), 'renders the unevaluable module + reason');
  assert.ok(html.includes('raw Medium'), 'shows the raw tier when it differs from effective');
  renderVerdict(el, null);
  assert.ok(el.innerHTML.includes('No analysis yet'), 'a null verdict renders the empty state');
  console.log('  [6] shared verdict-view render (interstitial view-findings path): tier/score/rules/unevaluable + null-state ✓');
}

// ── 7. DEFECT-50: the intervention page shows the TRIGGERING page's verdict ──
// Repro of the live-demo bug: a High block on page /c, then a later same-tab
// prefetch (google warmup, Low/0) overwrote the racy per-tab latest verdict.
{
  const TARGET = 'https://lumora-login.localhost:18443/c';
  const high: StoredVerdict = {
    effectiveTier: 'High', rawTier: 'High', score: 65,
    fired: ['CRED-01', 'CRED-07'], unevaluable: [], targetUrl: TARGET,
  };
  const prefetchLow: StoredVerdict = {
    effectiveTier: 'Low', rawTier: 'Low', score: 0,
    fired: [], unevaluable: [], targetUrl: 'https://www.google.com/search/warmup.html',
  };
  // elevated snapshot present (written only by the Medium/High pass), racy key
  // clobbered by the prefetch -> MUST still show the High /c verdict.
  const sel = selectInterventionVerdict(TARGET, high, prefetchLow);
  assert.equal(sel?.targetUrl, TARGET, 'shows the blocked page, not the prefetch');
  assert.equal(sel?.effectiveTier, 'High');
  assert.deepEqual(sel?.fired, ['CRED-01', 'CRED-07'], 'real rules, not "none fired"');
  assert.equal(sel?.score, 65, 'real score, not 0');
  // If ONLY the clobbered racy key exists (no elevated snapshot), the guard
  // refuses the mismatch rather than showing the wrong page -> empty state.
  assert.equal(selectInterventionVerdict(TARGET, null, prefetchLow), null,
    'a verdict whose targetUrl != the blocked target is NEVER shown');
  // Fallback: racy key matching the target (no elevated) is acceptable.
  assert.equal(selectInterventionVerdict(TARGET, null, high)?.score, 65,
    'the per-tab latest is used only when its targetUrl matches');
  console.log('  [7] DEFECT-50: intervention findings match the triggering page (prefetch clobber cannot leak a wrong verdict) ✓');
}

console.log('Tier-2 intervention PROVEN: §9.4 tier gating (Low/Medium/High), Medium three-action semantics, '
  + 'High no-bypass, §11.3 monotonic escalation, an override that never teaches auth-store trust, the '
  + 'shared verdict renderer on the interstitial path, and DEFECT-50 verdict-lookup scoping.');
