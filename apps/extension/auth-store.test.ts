/**
 * A1.3 EXIT CRITERION: "Guards G-01…G-05 unit-tested, including negative
 * cases." Each guard has at least one test where it correctly REJECTS/BLOCKS,
 * not merely a happy path. Plus §20.8 private-context write suppression (B-6),
 * lifecycle promotion (§20.4), G-04 demotion/eviction, versionMismatch (B-4),
 * and the §11.4 intervention lock via the engine's PriorPassState.
 *
 * In-memory backend (the A1.1 shim pattern), so no browser is needed.
 *
 * Run:
 *   node --experimental-strip-types apps/extension/auth-store.test.ts
 */

import assert from 'node:assert/strict';

import {
  AuthStore, computeFingerprintSimilarity, DEFAULT_AUTH_STORE_CONFIG,
  type AuthStorageBackend, type AuthStoreConfig,
} from './auth-store.ts';
import { toOrigin } from '../../packages/contracts/evidence.contract.v1.ts';
import type { LoginFingerprint, Origin } from '../../packages/contracts/evidence.contract.v1.ts';
import type { AuthRecordRequest } from '../../packages/contracts/boundary.interfaces.v1.ts';

function memoryBackend(): AuthStorageBackend {
  let data: Record<string, unknown> = {};
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

function mustOrigin(url: string): Origin {
  const o = toOrigin(url);
  assert.ok(o !== null, `toOrigin(${url}) should succeed`);
  return o;
}

function fp(over: Partial<LoginFingerprint> = {}): LoginFingerprint {
  return {
    fingerprintAlgorithmVersion: 'v1',
    fieldComposition: ['username', 'password'],
    titleTokens: ['sign', 'in'],
    faviconHash: 'favicon-A',
    heroImagePerceptualHash: 'hero-A',
    dominantColors: ['#fff', '#00f'],
    ...over,
  };
}

function req(over: Partial<AuthRecordRequest> & { origin: Origin }): AuthRecordRequest {
  return {
    fingerprint: fp(),
    credFindingActiveInSession: false,
    interventionOverriddenInSession: false,
    isPrivateContext: false,
    analysisSessionId: 'sess_test' as AuthRecordRequest['analysisSessionId'],
    ...over,
  };
}

const bankOrigin = mustOrigin('https://bank.example/login');
const evilOrigin = mustOrigin('https://bank-secure.example/login');

/** A permissive config so establishment is reachable in a short test, but the
 *  RATE bound is deliberately tiny so G-05 can be provoked. */
function cfg(over: Partial<AuthStoreConfig> = {}): AuthStoreConfig {
  return { ...DEFAULT_AUTH_STORE_CONFIG, establishAuthCount: 1, establishDistinctDays: 1, establishmentsPerWindow: 2, rateWindowDays: 1, ...over };
}

let day = '2026-08-01';
const clock = () => day;

/* ══ G-01 — no learning from a flagged session ═══════════════════════════ */
{
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: false, config: cfg(), today: clock });
  // NEGATIVE (must block):
  const blocked = await store.recordAuthentication(req({ origin: bankOrigin, credFindingActiveInSession: true }));
  assert.deepEqual(blocked, { result: 'blocked', guard: 'G-01', detail: blocked.result === 'blocked' ? blocked.detail : '' });
  assert.equal(blocked.result === 'blocked' && blocked.guard, 'G-01');
  // POSITIVE (must record): same origin, clean session.
  const ok = await store.recordAuthentication(req({ origin: bankOrigin }));
  assert.equal(ok.result, 'recorded', 'a clean session must record');
  // And the flagged attempt wrote NOTHING: only the clean one is present.
  const list = await store.listEntries();
  assert.equal(list.length, 1);
}

/* ══ G-02 — no learning from an overridden intervention ══════════════════ */
{
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: false, config: cfg(), today: clock });
  // NEGATIVE (must block):
  const blocked = await store.recordAuthentication(req({ origin: bankOrigin, interventionOverriddenInSession: true }));
  assert.equal(blocked.result === 'blocked' && blocked.guard, 'G-02', 'override must block with G-02');
  assert.equal((await store.listEntries()).length, 0, 'nothing recorded from an overridden intervention');
}

/* ══ G-03 — fingerprint collision at write ═══════════════════════════════ */
{
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: false, config: cfg(), today: clock });
  // Establish the real bank (identical fingerprint) so it is ESTABLISHED.
  const first = await store.recordAuthentication(req({ origin: bankOrigin, fingerprint: fp() }));
  assert.equal(first.result === 'recorded' && first.newState, 'ESTABLISHED');
  // NEGATIVE (must block): a NEW origin presenting the SAME login fingerprint.
  const blocked = await store.recordAuthentication(req({ origin: evilOrigin, fingerprint: fp() }));
  assert.equal(blocked.result === 'blocked' && blocked.guard, 'G-03', 'a clone fingerprint at a new origin must block with G-03');
  assert.equal((await store.listEntries()).find((e) => e.origin === evilOrigin), undefined, 'the impersonating origin was not written');
  // POSITIVE (must record): a genuinely DIFFERENT fingerprint at a new origin.
  const ok = await store.recordAuthentication(req({
    origin: mustOrigin('https://shop.example/login'),
    fingerprint: fp({ faviconHash: 'favicon-Z', heroImagePerceptualHash: 'hero-Z', fieldComposition: ['email'], titleTokens: ['checkout'] }),
  }));
  assert.equal(ok.result, 'recorded', 'a distinct fingerprint at a new origin must record');
}

/* ══ G-04 — asymmetric unlearning (immediate revocation) ═════════════════ */
{
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: false, config: cfg(), today: clock });
  await store.recordAuthentication(req({ origin: bankOrigin }));
  let entry = (await store.listEntries()).find((e) => e.origin === bankOrigin)!;
  assert.equal(entry.lifecycleState, 'ESTABLISHED', 'precondition: established');
  // NEGATIVE for trust (must strip it): a high-confidence finding demotes.
  await store.demoteOrEvict(bankOrigin, 'high_confidence_finding');
  entry = (await store.listEntries()).find((e) => e.origin === bankOrigin)!;
  assert.equal(entry.lifecycleState, 'PROVISIONAL', 'high-confidence finding demotes ESTABLISHED -> PROVISIONAL');
  // A second finding on the now-PROVISIONAL entry evicts it entirely.
  await store.demoteOrEvict(bankOrigin, 'high_confidence_finding');
  assert.equal((await store.listEntries()).find((e) => e.origin === bankOrigin), undefined, 'a provisional entry with a finding is evicted');
  // user_action evicts outright.
  await store.recordAuthentication(req({ origin: bankOrigin }));
  await store.demoteOrEvict(bankOrigin, 'user_action');
  assert.equal((await store.listEntries()).length, 0, 'user deletion evicts');
}

/* ══ G-05 — establishment rate bound ═════════════════════════════════════ */
{
  // establishmentsPerWindow: 2 — the third establishment in the window is a burst.
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: false, config: cfg({ establishmentsPerWindow: 2 }), today: clock });
  day = '2026-09-01';
  const a = await store.recordAuthentication(req({ origin: mustOrigin('https://a.example/l'), fingerprint: fp({ faviconHash: 'fa', heroImagePerceptualHash: 'ha' }) }));
  const b = await store.recordAuthentication(req({ origin: mustOrigin('https://b.example/l'), fingerprint: fp({ faviconHash: 'fb', heroImagePerceptualHash: 'hb' }) }));
  assert.equal(a.result === 'recorded' && a.newState, 'ESTABLISHED');
  assert.equal(b.result === 'recorded' && b.newState, 'ESTABLISHED');
  // NEGATIVE (must withhold establishment): the third within the window.
  const c = await store.recordAuthentication(req({ origin: mustOrigin('https://c.example/l'), fingerprint: fp({ faviconHash: 'fc', heroImagePerceptualHash: 'hc' }) }));
  assert.equal(c.result === 'recorded' && c.newState, 'PROVISIONAL',
    'G-05: an establishment burst withholds ESTABLISHED, entry stays PROVISIONAL');
}

/* ══ §20.8 / B-6 — private context suppresses writes, reads proceed ══════ */
{
  const backend = memoryBackend();
  // Seed via a NORMAL store, then reopen as private over the SAME backend.
  const normal = new AuthStore({ backend, isPrivateContext: false, config: cfg(), today: clock });
  await normal.recordAuthentication(req({ origin: bankOrigin }));

  const priv = new AuthStore({ backend, isPrivateContext: true, config: cfg(), today: clock });
  const write = await priv.recordAuthentication(req({ origin: mustOrigin('https://new.example/l') }));
  assert.deepEqual(write, { result: 'suppressed_private_context' }, 'B-6: private write is suppressed');
  assert.equal((await priv.listEntries()).find((e) => e.origin.includes('new.example')), undefined, 'nothing was written in private context');
  // Reads proceed normally — the seeded ESTABLISHED origin is still visible.
  const read = await priv.lookup(bankOrigin, fp());
  assert.equal(read.status, 'available');
  assert.equal(read.status === 'available' && read.originPresent, true, 'private-context reads see the persistent store');
}

/* ══ B-4 / §20.11 — versionMismatch is NEVER "absent" ═══════════════════ */
{
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: false, config: cfg(), today: clock });
  await store.recordAuthentication(req({ origin: bankOrigin, fingerprint: fp({ fingerprintAlgorithmVersion: 'v1' }) }));
  // Looking up with a DIFFERENT algorithm version must not be reported absent.
  const r = await store.lookup(mustOrigin('https://unknown.example/l'), fp({ fingerprintAlgorithmVersion: 'v2' }));
  assert.equal(r.status, 'versionMismatch', 'a version mismatch must be reported as such, never as no-match');
  assert.ok(r.status === 'versionMismatch' && r.storedAlgorithmVersions.includes('v1'));
}

/* ══ cross-origin match on lookup (the CRED-02 read signal) ══════════════ */
{
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: false, config: cfg(), today: clock });
  await store.recordAuthentication(req({ origin: bankOrigin, fingerprint: fp() }));  // ESTABLISHED
  const r = await store.lookup(evilOrigin, fp());  // same fingerprint, unknown origin
  assert.equal(r.status === 'available' && r.originPresent, false);
  assert.ok(r.status === 'available' && r.bestCrossOriginMatch !== null, 'an absent origin with a clone fingerprint yields a cross-origin match');
  assert.equal(r.status === 'available' && r.bestCrossOriginMatch?.origin, bankOrigin);
  assert.ok(r.status === 'available' && (r.bestCrossOriginMatch?.similarity ?? 0) >= 0.9);
}

/* ══ §11.4 intervention lock via engine PriorPassState ══════════════════ */
{
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: false, config: cfg(), today: clock });
  const first = await store.reportInterventionPresented('sess_x', 'Medium');
  assert.deepEqual(first, { highestInterventionTier: 'Medium', interventionPresented: true });
  // Monotonic (§11.3): a later lower tier does not lower the recorded maximum.
  const second = await store.reportInterventionPresented('sess_x', 'Low');
  assert.equal(second.highestInterventionTier, 'Medium', 'intervention tier is a session maximum, never lowered');
  const third = await store.reportInterventionPresented('sess_x', 'High');
  assert.equal(third.highestInterventionTier, 'High', 'a higher tier raises it');
}

/* ══ fingerprint similarity stub sanity ══════════════════════════════════ */
{
  assert.equal(computeFingerprintSimilarity(fp(), fp()), 1, 'identical fingerprints -> 1');
  assert.equal(computeFingerprintSimilarity(fp(), fp({ fingerprintAlgorithmVersion: 'v2' })), 0, 'different algo version -> 0');
  const partial = computeFingerprintSimilarity(fp(), fp({ faviconHash: 'other', heroImagePerceptualHash: 'other', titleTokens: ['x'] }));
  assert.ok(partial > 0 && partial < 1, 'partial overlap -> strictly between 0 and 1');
}

console.log('A1.3 PROVEN: guards G-01..G-05 each unit-tested WITH a negative (reject/block/withhold) case;');
console.log('  + B-6 private-write suppression, B-4 versionMismatch, G-04 demote/evict, cross-origin match,');
console.log('  + §11.4 intervention lock via the engine PriorPassState (reused, not copied). All assertions passed.');
