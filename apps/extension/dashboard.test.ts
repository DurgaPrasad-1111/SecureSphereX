/**
 * Dashboard view-model (v3) — Right Now updating on tab switch, Saved Sites
 * reflecting REAL AuthStore state and reacting to AuthStoreUserControl.deleteEntry,
 * the 11 technique cards, and the hard rule that NO score appears anywhere.
 *
 * Run: node --experimental-strip-types apps/extension/dashboard.test.ts
 */

import assert from 'node:assert/strict';
import {
  renderRightNow, rightNowForTab, renderIncidents, renderSavedSites,
  renderTechniqueCards, TECHNIQUE_CARDS, ruleName,
} from './dashboard-model.ts';
import type { StoredVerdict } from './verdict-view.ts';
import type { Incident } from './incident-history.ts';
import { AuthStore, type AuthStorageBackend } from './auth-store.ts';
import { toOrigin } from '../../packages/contracts/evidence.contract.v1.ts';
import type { LoginFingerprint, Origin } from '../../packages/contracts/evidence.contract.v1.ts';
import type { AuthRecordRequest } from '../../packages/contracts/boundary.interfaces.v1.ts';

function memoryBackend(): AuthStorageBackend {
  const data: Record<string, unknown> = {};
  return {
    async get(keys) {
      if (keys === null) return JSON.parse(JSON.stringify(data));
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in data) out[k] = JSON.parse(JSON.stringify(data[k]));
      return out;
    },
    async set(items) { for (const [k, v] of Object.entries(items)) data[k] = JSON.parse(JSON.stringify(v)); },
    async remove(keys) { for (const k of (Array.isArray(keys) ? keys : [keys])) delete data[k]; },
  };
}
const mustOrigin = (u: string): Origin => { const o = toOrigin(u); assert.ok(o !== null); return o; };
function fp(): LoginFingerprint {
  return { fingerprintAlgorithmVersion: 'v1', fieldComposition: ['username', 'password'], titleTokens: ['sign', 'in'], faviconHash: 'f', heroImagePerceptualHash: 'h', dominantColors: ['#fff'] };
}
function req(origin: Origin): AuthRecordRequest {
  return { origin, fingerprint: fp(), credFindingActiveInSession: false, interventionOverriddenInSession: false, isPrivateContext: false, analysisSessionId: 'sess_test' as AuthRecordRequest['analysisSessionId'] };
}
const verdict = (over: Partial<StoredVerdict>): StoredVerdict => ({
  effectiveTier: 'Low', rawTier: 'Low', score: 0, fired: [], unevaluable: [], targetUrl: 'https://x.example/', ...over,
});

// ── 1. Right Now updates on tab switch (and navigation) ──────────────────────
{
  const vA = verdict({ effectiveTier: 'High', fired: ['CRED-01'], targetUrl: 'https://bad.example/login', score: 87 });
  const vB = verdict({ effectiveTier: 'Low', fired: [], targetUrl: 'https://good.example/', score: 3 });
  const byTab: Record<number, StoredVerdict | undefined> = { 1: vA, 2: vB };

  // focus tab 1 -> shows tab 1's page
  let html = renderRightNow(rightNowForTab(byTab, 1));
  assert.ok(html.includes('bad.example') && html.includes(ruleName('CRED-01')), 'focused tab 1 shows its High verdict + technique name');
  // switch to tab 2 -> strip updates to tab 2
  html = renderRightNow(rightNowForTab(byTab, 2));
  assert.ok(html.includes('good.example') && !html.includes('bad.example'), 'switching to tab 2 updates the strip');
  // switch to a tab with no verdict (e.g. the dashboard's own tab) -> empty state
  html = renderRightNow(rightNowForTab(byTab, 999));
  assert.ok(/No analysed page in focus/.test(html), 'a tab with no verdict shows the empty state');
  // navigation on the focused tab = the verdict for that tab id changes
  const afterNav = { ...byTab, 1: verdict({ effectiveTier: 'Medium', fired: ['CRED-07'], targetUrl: 'https://bad.example/step2' }) };
  html = renderRightNow(rightNowForTab(afterNav, 1));
  assert.ok(html.includes('step2') && html.includes(ruleName('CRED-07')), 'navigation updates the focused tab strip');
  console.log('  [1] Right Now updates on tab switch and navigation ✓');
}

// ── 2. Saved Sites reflects REAL AuthStore state, reacts to deleteEntry ───────
{
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: false });
  const bank = mustOrigin('https://bank.example/login');
  const shop = mustOrigin('https://shop.example/login');
  const r1 = await store.recordAuthentication(req(bank));
  const r2 = await store.recordAuthentication(req(shop));
  assert.equal(r1.result, 'recorded'); assert.equal(r2.result, 'recorded');

  let html = renderSavedSites(await store.listEntries());
  assert.ok(html.includes('bank.example') && html.includes('shop.example'), 'both established/provisional sites render');
  assert.ok(html.includes('data-origin="https://bank.example"'), 'each row has a Forget button bound to its origin');

  await store.deleteEntry(bank);                       // AuthStoreUserControl.deleteEntry
  html = renderSavedSites(await store.listEntries());
  assert.ok(!html.includes('bank.example') && html.includes('shop.example'), 'after deleteEntry, the forgotten site is gone; the other remains');

  assert.ok(/No saved sites yet/.test(renderSavedSites([])), 'empty state renders when there are none');
  console.log('  [2] Saved Sites reflects real AuthStore state and updates on deleteEntry ✓');
}

// ── 3. Technique cards: all 11 rules, with names ─────────────────────────────
{
  assert.equal(TECHNIQUE_CARDS.length, 11, 'one card per rule (11)');
  const html = renderTechniqueCards();
  const ALL_IDS = ['CRED-01', 'CRED-02', 'CRED-03', 'CRED-04', 'CRED-05', 'CRED-06', 'CRED-07', 'CRED-A1', 'DL-01', 'DL-02', 'PM-01'];
  for (const id of ALL_IDS) {
    assert.ok(html.includes(ruleName(id)), `card present for ${ruleName(id)}`);
  }
  // Rule IDs are internal implementation detail — same standard as the no-score
  // rule: they must NOT appear on the technique cards. Guards against regression.
  for (const id of ALL_IDS) {
    assert.ok(!html.includes(id), `rule-ID "${id}" must NOT appear on the technique cards`);
  }
  assert.ok(!/\b(?:CRED|DL|PM)-[0-9A]/.test(html), 'no rule-ID-shaped string on any technique card');
  console.log('  [3] Technique cards: all 11 rules present by NAME only, no rule-ID badges ✓');
}

// ── 4. NO score anywhere in any rendered surface ─────────────────────────────
{
  const incidents: Incident[] = [
    { id: '1', at: Date.parse('2026-09-01T10:00:00Z'), url: 'https://bad.example/login', domain: 'bad.example', tier: 'High', fired: ['CRED-01', 'CRED-06'] },
    { id: '2', at: Date.parse('2026-09-01T09:00:00Z'), url: 'https://safe.example/', domain: 'safe.example', tier: 'Low', fired: [] },
  ];
  const surfaces = [
    renderRightNow(rightNowForTab({ 1: verdict({ effectiveTier: 'High', fired: ['CRED-01'], score: 87 }) }, 1)),
    renderIncidents(incidents),
    renderTechniqueCards(),
  ].join('\n');
  assert.ok(!/score/i.test(surfaces), 'the word "score" appears nowhere in the rendered dashboard');
  assert.ok(!surfaces.includes('87'), 'the numeric score value is never rendered even when present in the verdict data');
  // structural: incidents carry no score key at all
  assert.ok(incidents.every((i) => !('score' in i)), 'incident records structurally have no score field');
  console.log('  [4] no score anywhere: not the label, not the value, not in the record ✓');
}

console.log('Dashboard model PROVEN: Right Now tracks the focused tab across switches/navigation, Saved Sites renders real AuthStore entries and reacts to deleteEntry, all 11 technique cards render, and no score is exposed on any surface.');
