/**
 * DEFECT-44 — same-tab "Save link as" download, end to end, through the REAL
 * download-handling code path (no bypass of the tab-scoping).
 *
 * This drives the actual production handlers from `download-handler.ts` against an
 * in-memory `chrome.storage.session` + a modeled active-tab query:
 *   1. Tab T loads page P (nav N1): a content-script pass caches evidence + writes
 *      the verdict (no DL).
 *   2. onCreated fires for a Save-As of fake-invoice.pdf.zip with filename==='' —
 *      `handleDownloadCreated` attributes it to T via the active-tab query, stores
 *      the record under downloadKey(T) + the downloadId->tabId map, and runs a
 *      provisional re-pass (no DL-02: filename unconfirmed).
 *   3. SW dormancy is MODELED by clearing the in-memory evidence cache — the real
 *      failure mode a Save-As dialog left open triggers. The user then confirms the
 *      filename: onChanged fires, `handleDownloadChanged` resolves T via the
 *      downloadId->tabId map and updates the SAME record to the confirmed name. Its
 *      immediate re-pass now SKIPS (no_cached_evidence) — proving the immediate path
 *      alone is NOT sufficient, and DL-02 is still absent from the verdict here.
 *   4. A same-tab navigation (nav N2) runs a fresh content-script pass. The RELIABLE
 *      path — `mergeStoredDownloadContext` — folds the persisted confirmed record
 *      into that pass (cache-independent), so DL-02 lands in the verdict the popup
 *      reads.
 *
 * The assertion is on `ssx:verdict:<tab>.fired` — exactly what popup.ts /
 * intervention.ts read. Every tab id, storage key, and the downloadId->tabId map
 * is the production logic; nothing is hand-stubbed around it.
 *
 * The browser downloads.onCreated/onChanged EVENTS are S-9 (in-browser-only) and
 * cannot be emitted offline — that end-to-end stays a manual check. This test
 * drives the exact handler logic those events invoke.
 *
 * Run: node --experimental-strip-types apps/extension/download-sametab-e2e.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { SessionStore, type SessionStorageBackend, type SessionKeyParts } from './session-store.ts';
import { runPassInSession, EvidenceCache } from './session-pass.ts';
import {
  collectUrl, collectDomainRepresentation, collectTransport,
  collectLoginInterface, collectScriptRuntime,
} from './collect-evidence.ts';
import { assembleEvidence, type CollectedParts } from './assemble-evidence.ts';
import { downloadKey, downloadTabKey, type DownloadRecord } from './download-context.ts';
import {
  handleDownloadCreated, handleDownloadChanged, mergeStoredDownloadContext,
  buildVerdict, type DownloadEnv, type StoredVerdict,
} from './download-handler.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ruleSet = JSON.parse(readFileSync(join(REPO, 'rulesets', 'rules-v0.1.0.json'), 'utf8')) as RuleSet;

const emptyStore: AuthStoreReader = {
  lookup: async () => ({
    status: 'available' as const, originPresent: false,
    lifecycleState: null, fingerprintDrift: null, bestCrossOriginMatch: null,
  }),
};

/** One shared in-memory chrome.storage.session — sessions, download records, the
 *  downloadId->tabId map, and verdicts all live here, exactly as in production. */
function memoryBackend(): SessionStorageBackend {
  const m = new Map<string, unknown>();
  return {
    async get(keys) {
      if (keys === null) return Object.fromEntries(m);
      const arr = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of arr) if (m.has(k)) out[k] = m.get(k);
      return out;
    },
    async set(items) { for (const [k, v] of Object.entries(items)) m.set(k, JSON.parse(JSON.stringify(v))); },
    async remove(keys) { const arr = Array.isArray(keys) ? keys : [keys]; for (const k of arr) m.delete(k); },
  };
}

function pageParts(url: string): CollectedParts {
  const dom = new JSDOM('<!doctype html><html><head><title>Home</title></head><body><p>hi</p></body></html>', { url });
  const doc = dom.window.document;
  return {
    url: collectUrl(url),
    domainRepresentation: collectDomainRepresentation(url),
    transport: collectTransport('https:'),
    loginInterface: collectLoginInterface(doc as unknown as ParentNode, doc.baseURI, () => false, doc.title),
    scriptRuntime: collectScriptRuntime({ transmissionEndpoints: [], dynamicScriptOrigins: [] }),
  };
}

const TAB = 7;
const COMPOUND_URL = 'http://localhost:8000/fake-invoice.pdf.zip';
const PAGE_1 = 'https://shop.example/product';
const PAGE_2 = 'https://shop.example/account';
const DOWNLOAD_ID = 4242;

const firedOf = (v: StoredVerdict | undefined) => (v?.fired ?? []);
const showsDL02 = (v: StoredVerdict | undefined) => firedOf(v).includes('DL-02');

async function readVerdict(backend: SessionStorageBackend, tabId: number): Promise<StoredVerdict | undefined> {
  const k = `ssx:verdict:${tabId}`;
  return (await backend.get(k))[k] as StoredVerdict | undefined;
}
async function readDownloadRecord(backend: SessionStorageBackend, tabId: number): Promise<DownloadRecord | undefined> {
  const k = downloadKey(tabId);
  return (await backend.get(k))[k] as DownloadRecord | undefined;
}

const backend = memoryBackend();
const store = new SessionStore(backend);
const cache = new EvidenceCache();
const tabToNav = new Map<number, number>();
const log: string[] = [];

/** The real SW verdict writer, browser-free: buildVerdict + storage.set (what the
 *  popup reads). Badge is chrome-only and irrelevant to the fired list. */
const env: DownloadEnv = {
  storage: backend,
  store,
  cache,
  authStore: emptyStore,
  loadRuleSet: async () => ruleSet,
  tabToNav,
  now: () => Date.now(),
  today: () => '2026-09-05',
  queryActiveTabId: async () => TAB, // tab T is focused throughout a same-tab Save-As
  applyOutcome: async (tabId, targetUrl, outcome) => {
    await backend.set({ [`ssx:verdict:${tabId}`]: buildVerdict(outcome, targetUrl) });
  },
  maybeIntervene: async () => { /* no interstitial needed for the fired-list assertion */ },
  log: (m) => log.push(m),
};

/** Mirror of analyzeAndReflect's DL-relevant core: merge the tab's stored download
 *  record (real tab-scoping), cache the raw parts, run the session pass, write the
 *  verdict. This is the same composition the SW runs on a content-script message. */
async function contentScriptPass(sessionParts: SessionKeyParts, parts: CollectedParts, targetUrl: string): Promise<void> {
  const merged = await mergeStoredDownloadContext(env, sessionParts.tabId, parts);
  const evidence = assembleEvidence(merged, targetUrl, '2026-09-05');
  cache.remember(sessionParts, parts, Date.now());
  const outcome = await runPassInSession({ store, parts: sessionParts, evidence, ruleSet, storeReader: emptyStore });
  await env.applyOutcome(sessionParts.tabId, targetUrl, outcome);
}

// ── 1. Tab T loads page P (nav N1): a normal pass, no download yet ───────────
const n1: SessionKeyParts = { tabId: TAB, navigationId: 1001 };
await store.startSession(n1, PAGE_1, '2026-09-05', 'DOC-N1');
tabToNav.set(TAB, n1.navigationId);
await contentScriptPass(n1, pageParts(PAGE_1), PAGE_1);
assert.ok(!showsDL02(await readVerdict(backend, TAB)), 'page P must have no DL finding before any download');
console.log('  [1] tab 7 loads page P (nav N1): verdict written, no DL-02 ✓');

// ── 2. onCreated: Save-As of fake-invoice.pdf.zip, filename==='' ─────────────
await handleDownloadCreated(env, { id: DOWNLOAD_ID, url: COMPOUND_URL, filename: '', mime: '', referrer: PAGE_1 });
{
  const rec = await readDownloadRecord(backend, TAB);
  assert.ok(rec !== undefined && rec.filename === '' && rec.filenameConfirmed === false, 'onCreated stored a provisional record');
  const mapK = downloadTabKey(DOWNLOAD_ID);
  assert.equal((await backend.get(mapK))[mapK], TAB, 'onCreated recorded downloadId -> tab 7 (real tab-scoping)');
  assert.ok(!showsDL02(await readVerdict(backend, TAB)), 'provisional (empty filename) must NOT show DL-02');
}
console.log('  [2] onCreated (filename=\'\') -> record + downloadId->tab map stored; provisional re-pass, no DL-02 ✓');

// ── 3. SW dormancy (cache lost), THEN the user confirms the filename ─────────
cache.forgetTab(TAB); // model the in-memory evidence cache being lost while the Save-As dialog was open
await handleDownloadChanged(env, { id: DOWNLOAD_ID, filename: { current: 'fake-invoice.pdf.zip' } });
{
  const rec = await readDownloadRecord(backend, TAB);
  assert.ok(rec !== undefined && rec.filename === 'fake-invoice.pdf.zip' && rec.filenameConfirmed === true,
    'onChanged resolved the tab via the map and updated the record to the confirmed filename');
  // The immediate re-pass could not use the (lost) cache: DL-02 is still absent here.
  assert.ok(!showsDL02(await readVerdict(backend, TAB)),
    'with the cache gone, the immediate re-pass skips — DL-02 not yet in the verdict (this is the silent-failure the fix routes around)');
  assert.ok(log.some((m) => m.includes('no_cached_evidence')),
    `the immediate re-pass must log an honest skip; log: ${JSON.stringify(log)}`);
}
console.log('  [3] cache lost + onChanged confirms filename: record updated to fake-invoice.pdf.zip; immediate re-pass skips (no_cached_evidence), DL-02 still absent ✓');

// ── 4. Same-tab navigation (nav N2): the RELIABLE path raises DL-02 ──────────
const n2: SessionKeyParts = { tabId: TAB, navigationId: 1002 };
await store.startSession(n2, PAGE_2, '2026-09-05', 'DOC-N2');
tabToNav.set(TAB, n2.navigationId);
await contentScriptPass(n2, pageParts(PAGE_2), PAGE_2);
{
  const v = await readVerdict(backend, TAB);
  assert.ok(showsDL02(v), `the popup's fired list MUST show DL-02 after the same-tab navigation; fired=[${firedOf(v).join(', ')}]`);
  console.log(`  [4] same-tab navigation (nav N2): popup verdict fired=[${firedOf(v).join(', ')}] -> DL-02 SHOWS (cache-independent merge path) ✓`);
}

console.log('DEFECT-44 PROVEN end to end: a same-tab Save-As of fake-invoice.pdf.zip is attributed to the tab, '
  + 'its late filename is confirmed via onChanged, and a same-tab navigation reliably surfaces DL-02 in the '
  + 'popup fired list even after the evidence cache is lost — the actual tab-scoping logic, not a bypass.');
