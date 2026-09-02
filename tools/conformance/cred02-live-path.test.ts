/**
 * LIVE-PATH proof for CRED-02 (unfamiliar cross-origin impersonation), the
 * mirror of cred-live-path.test.ts for CRED-01. Runs the EXACT extension
 * collectors (collectUrl / collectDomainRepresentation / collectTransport /
 * collectLoginInterface WITH a page title / collectScriptRuntime →
 * assembleEvidence) over a jsdom DOM, feeds the REAL engine (runAnalysisPass)
 * with the REAL AuthStore as the ACEM's reader, and asserts whether CRED-02
 * fires. No browser, no credentials, no network — fully deterministic.
 *
 * WHAT THIS SETTLES. CRED-02 was structurally unfirable because the extension's
 * collectLoginInterface returned `fingerprint: notCollected`, so authContext was
 * unevaluable before any store lookup. Wiring the read-path fingerprint (built
 * the SAME way the write path stores it) makes authContext evaluable; this test
 * proves the whole chain end to end.
 *
 * The scenarios encode §20.5's restrictive lifecycle and CRED-02's rule table:
 *   1. POSITIVE — an ESTABLISHED cross-origin match on a different registrable
 *      domain fires CRED-02.
 *   2. PROVISIONAL-only — a single-success entry is NOT an eligible cross-origin
 *      match (bestCrossOriginMatch is "best ESTABLISHED elsewhere"), so CRED-02
 *      does NOT fire. The §20.5 restrictive ramp, proven.
 *   3. REQUIRES BOTH — authContext matches an ESTABLISHED entry, but the page
 *      has no credential form, so loginForm.credentialFormPresent is false and
 *      CRED-02 does NOT fire. AuthContext alone is insufficient.
 *   4. VERSION MISMATCH — a stored fingerprint of another algorithm version
 *      yields `versionMismatch` → authContext unevaluable → CRED-02 cannot fire
 *      (B-4 / §20.11; the A1.5 guard, exercised through the live path).
 *   5. COLD START — an empty store fires nothing.
 *
 * The store is seeded through its OWN guarded write path (recordAuthentication),
 * not by poking internals — so the PROVISIONAL→ESTABLISHED ramp that gates the
 * positive case is genuine, not asserted into place. No guard is modified.
 *
 * WHY tools/conformance: it imports BOTH the extension and the engine; the
 * dependency matrix forbids either package importing the other, and this neutral
 * location may import both (same rationale as the other conformance tests).
 *
 * Run:
 *   node --experimental-strip-types tools/conformance/cred02-live-path.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  collectUrl, collectDomainRepresentation, collectTransport,
  collectLoginInterface, collectScriptRuntime,
} from '../../apps/extension/collect-evidence.ts';
import { assembleEvidence } from '../../apps/extension/assemble-evidence.ts';
import { AuthStore, type AuthStorageBackend } from '../../apps/extension/auth-store.ts';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import { toOrigin } from '../../packages/contracts/evidence.contract.v1.ts';
import type { LoginFingerprint, AnalysisSessionId } from '../../packages/contracts/evidence.contract.v1.ts';
import type { AuthRecordRequest } from '../../packages/contracts/boundary.interfaces.v1.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ruleSet = JSON.parse(readFileSync(join(REPO, 'rulesets', 'rules-v0.1.0.json'), 'utf8')) as RuleSet;

// The legit bank the user has authenticated at; the phish is on an unrelated
// registrable domain (`attacker.example`) got up to look like a subdomain.
const LEGIT_ORIGIN = 'https://login.trustedbank.example';
const PHISH_URL = 'https://login.trustedbank.attacker.example/signin';
const PHISH_ORIGIN = new URL(PHISH_URL).origin;

// The phish is a byte copy of the legit login page — so the fingerprint observed
// at each is identical, which IS the impersonation signal CRED-02 keys on.
const LOGIN_HTML = `<!doctype html><html><head><title>TrustedBank — Secure Sign In</title></head><body>
  <form method="POST" action="/auth">
    <input type="text" name="username" autocomplete="username">
    <input type="password" name="password" autocomplete="current-password">
    <button type="submit">Sign in</button>
  </form></body></html>`;

// Same page with the password field removed: a credential-free page whose
// fingerprint still matches a stored entry — isolates the loginForm conjunct.
const NO_CREDENTIAL_HTML = `<!doctype html><html><head><title>TrustedBank — Secure Sign In</title></head><body>
  <form method="POST" action="/auth">
    <input type="text" name="username" autocomplete="username">
  </form></body></html>`;

/** In-memory chrome.storage.local stand-in (the AuthStorageBackend shape). */
function makeAuthBackend(): AuthStorageBackend {
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

/** The fingerprint the extension produces for a page (title supplied). */
function pageFingerprint(url: string, html: string): LoginFingerprint {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const ev = collectLoginInterface(doc as unknown as ParentNode, doc.baseURI, () => false, doc.title);
  assert.equal(ev.fingerprint.state, 'present', 'a title-supplied collect must yield a present fingerprint');
  return ev.fingerprint.state === 'present' ? ev.fingerprint.value : (undefined as never);
}

/** Seed `origin` with `times` successful auths across `days`, through the store's
 *  OWN guarded write path. Returns the store (usable as the ACEM's reader). */
async function seed(
  backend: AuthStorageBackend, origin: string, fp: LoginFingerprint,
  opts: { times: number; days: readonly string[] },
): Promise<AuthStore> {
  let i = 0;
  const store = new AuthStore({
    backend, isPrivateContext: false,
    today: () => opts.days[Math.min(i, opts.days.length - 1)] as string,
  });
  const o = toOrigin(origin);
  assert.ok(o !== null, `test origin must be valid: ${origin}`);
  for (let n = 0; n < opts.times; n += 1) {
    const req: AuthRecordRequest = {
      origin: o, fingerprint: fp,
      credFindingActiveInSession: false, interventionOverriddenInSession: false,
      isPrivateContext: false, analysisSessionId: `seed_${n}` as AnalysisSessionId,
    };
    const outcome = await store.recordAuthentication(req);
    assert.equal(outcome.result, 'recorded', `seed write ${n} must record, got ${JSON.stringify(outcome)}`);
    i += 1;
  }
  return store;
}

/** The FULL extension collection path (title supplied) + the real engine. */
async function livePass(pageUrl: string, html: string, storeReader: AuthStore) {
  const dom = new JSDOM(html, { url: pageUrl });
  const doc = dom.window.document;
  const parts = {
    url: collectUrl(pageUrl),
    domainRepresentation: collectDomainRepresentation(pageUrl),
    transport: collectTransport(new URL(pageUrl).protocol),
    loginInterface: collectLoginInterface(doc as unknown as ParentNode, doc.baseURI, () => false, doc.title),
    scriptRuntime: collectScriptRuntime({ transmissionEndpoints: [], dynamicScriptOrigins: [] }),
  };
  const evidence = assembleEvidence(parts, pageUrl, '2026-08-31');
  const outcome = await runAnalysisPass(evidence, ruleSet, storeReader, null);
  return { evidence, fired: outcome.findings.map((f) => f.ruleId), outcome };
}

const phishOriginTyped = toOrigin(PHISH_ORIGIN);
assert.ok(phishOriginTyped !== null, 'phish origin must be valid');

/* ── 1. POSITIVE: ESTABLISHED cross-origin impersonation → CRED-02 fires ───── */
{
  const backend = makeAuthBackend();
  const fp = pageFingerprint(PHISH_URL, LOGIN_HTML);           // == legit fp (copy)
  const store = await seed(backend, LEGIT_ORIGIN, fp, { times: 3, days: ['2026-07-01', '2026-07-01', '2026-07-02'] });

  const summaries = await store.listEntries();
  assert.equal(summaries[0]?.lifecycleState, 'ESTABLISHED', 'seed must have reached ESTABLISHED');

  // The store side, directly: the phish origin is absent, and the best
  // cross-origin match is the ESTABLISHED legit entry at/above tau_sim.
  const look = await store.lookup(phishOriginTyped, fp);
  assert.equal(look.status, 'available');
  assert.ok(look.status === 'available' && look.originPresent === false, 'phish origin must be absent');
  assert.ok(look.status === 'available' && look.bestCrossOriginMatch !== null
    && look.bestCrossOriginMatch.similarity >= 0.85, 'an ESTABLISHED cross-origin match at/above tau_sim');

  const { fired } = await livePass(PHISH_URL, LOGIN_HTML, store);
  assert.ok(fired.includes('CRED-02'),
    `CRED-02 MUST fire on an ESTABLISHED cross-origin impersonation; fired = [${fired.join(', ')}]`);
  console.log(`  1. POSITIVE (${PHISH_ORIGIN} impersonating ${LEGIT_ORIGIN}, ESTABLISHED): fired [${fired.join(', ')}] — CRED-02 present ✓`);
}

/* ── 2. PROVISIONAL only → CRED-02 does NOT fire (§20.5 restrictive ramp) ───── */
{
  const backend = makeAuthBackend();
  const fp = pageFingerprint(PHISH_URL, LOGIN_HTML);
  const store = await seed(backend, LEGIT_ORIGIN, fp, { times: 1, days: ['2026-07-01'] }); // one success

  const summaries = await store.listEntries();
  assert.equal(summaries[0]?.lifecycleState, 'PROVISIONAL', 'one success must be PROVISIONAL, not ESTABLISHED');

  const look = await store.lookup(phishOriginTyped, fp);
  assert.ok(look.status === 'available' && look.bestCrossOriginMatch === null,
    'a PROVISIONAL entry is NOT an eligible cross-origin match');

  const { fired } = await livePass(PHISH_URL, LOGIN_HTML, store);
  assert.ok(!fired.includes('CRED-02'),
    `CRED-02 must NOT fire against a PROVISIONAL-only target; fired = [${fired.join(', ')}]`);
  console.log(`  2. PROVISIONAL only: fired [${fired.join(', ')}] — CRED-02 correctly absent (restrictive ramp) ✓`);
}

/* ── 3. REQUIRES BOTH: authContext matches, no credential form → no fire ────── */
{
  const backend = makeAuthBackend();
  const fp = pageFingerprint(PHISH_URL, NO_CREDENTIAL_HTML);   // composition ['username'], same title
  const store = await seed(backend, LEGIT_ORIGIN, fp, { times: 3, days: ['2026-07-01', '2026-07-01', '2026-07-02'] });

  // AuthContext side is fully satisfied: an ESTABLISHED cross-origin match ≥ tau.
  const look = await store.lookup(phishOriginTyped, fp);
  assert.ok(look.status === 'available' && look.bestCrossOriginMatch !== null
    && look.bestCrossOriginMatch.similarity >= 0.85, 'authContext match holds for the no-credential page too');

  const { evidence, fired } = await livePass(PHISH_URL, NO_CREDENTIAL_HTML, store);
  const cfp = evidence.evidence.loginInterface.credentialFormPresent;
  assert.ok(cfp.state === 'present' && cfp.value === false, 'the no-credential page has credentialFormPresent = false');
  assert.ok(!fired.includes('CRED-02'),
    `CRED-02 requires loginForm.credentialFormPresent — an authContext match alone must NOT fire it; fired = [${fired.join(', ')}]`);
  console.log(`  3. REQUIRES BOTH (authContext matches, no credential form): fired [${fired.join(', ')}] — CRED-02 correctly absent ✓`);
}

/* ── 4. VERSION MISMATCH → authContext unevaluable → no fire (B-4/§20.11) ───── */
{
  const backend = makeAuthBackend();
  const current = pageFingerprint(PHISH_URL, LOGIN_HTML);      // 'ssx-ext-fp-1'
  const oldVersion: LoginFingerprint = { ...current, fingerprintAlgorithmVersion: 'ssx-ext-fp-0-legacy' };
  const store = await seed(backend, LEGIT_ORIGIN, oldVersion, { times: 3, days: ['2026-07-01', '2026-07-01', '2026-07-02'] });

  const look = await store.lookup(phishOriginTyped, current);
  assert.equal(look.status, 'versionMismatch', 'a store holding only another algorithm version returns versionMismatch');

  const { fired, outcome } = await livePass(PHISH_URL, LOGIN_HTML, store);
  assert.equal(outcome.evaluations.authContext.result.status, 'unevaluable',
    'version mismatch must leave authContext unevaluable, never an absent match (B-4)');
  assert.ok(!fired.includes('CRED-02'),
    `CRED-02 cannot fire when authContext is unevaluable; fired = [${fired.join(', ')}]`);
  console.log(`  4. VERSION MISMATCH: authContext unevaluable, fired [${fired.join(', ')}] — CRED-02 correctly absent ✓`);
}

/* ── 5. COLD START: empty store fires nothing from authContext ─────────────── */
{
  const store = new AuthStore({ backend: makeAuthBackend(), isPrivateContext: false });
  const { fired } = await livePass(PHISH_URL, LOGIN_HTML, store);
  assert.ok(!fired.includes('CRED-02'),
    `CRED-02 must NOT fire with no stored history (cold start); fired = [${fired.join(', ')}]`);
  console.log(`  5. COLD START (empty store): fired [${fired.join(', ')}] — CRED-02 correctly absent ✓`);
}

console.log('CRED-02 live-path PROVEN: through the real extension collectors (now producing the login '
  + 'fingerprint) + the real AuthStore + engine, CRED-02 fires on an ESTABLISHED cross-origin impersonation '
  + 'and correctly does NOT fire against a PROVISIONAL-only target, a page without a credential form, a '
  + 'version-mismatched store, or a cold start. §20.5 ramp and the loginForm∧authContext rule table both hold.');
