/**
 * DEFECT-43 — late-filename handling for "Save link as" downloads, tested through
 * the REAL SW-path composition (computeDownloadContextEvidence + the DEFECT-43
 * confirmation fold + runDownloadRepass + the session lock), not a hand-composed
 * engine call. It reproduces the exact case that failed in live manual testing:
 * a Save-As download of http://localhost:8000/fake-invoice.pdf.zip whose
 * onCreated fired with filename==='' — proving:
 *
 *   1. PROVISIONAL: with filename==='' the compound-extension disguise does NOT
 *      fire DL-02 — the URL-derived signal is computed and traceable but is NOT
 *      treated as authoritative (a rule must not fire just because a URL looked
 *      suspicious).
 *   2. CONFIRMED: once downloads.onChanged supplies the real filename, the
 *      re-pass fires DL-02 — the exact regression, now fixed.
 *   3. IDEMPOTENT: a repeated identical filename delta is a no-op (no redundant
 *      re-pass), so only a meaningful confirmation re-triggers analysis.
 *   4. NO FALSE POSITIVE: a genuine report.pdf Save-As stays silent throughout —
 *      provisionally and after confirmation.
 *   5. STALENESS: a late onChanged past EVIDENCE_CACHE_MAX_AGE_MS skips honestly
 *      (evidence_stale) — the same existing bound, no special-casing.
 *
 * Note: the browser downloads.onCreated/onChanged EVENTS themselves are a live-
 * Chrome surface (S-9, in-browser-only) that this offline harness cannot emit —
 * that end-to-end remains a manual check (DEC-45). This test drives the exact
 * logic those listeners run, with the onChanged filename confirmation modeled by
 * applyFilenameConfirmation (the pure fold the listener calls).
 *
 * Run: node --experimental-strip-types apps/extension/download-onchanged.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { SessionStore, type SessionStorageBackend, type SessionKeyParts } from './session-store.ts';
import { runDownloadRepass, EvidenceCache, EVIDENCE_CACHE_MAX_AGE_MS } from './session-pass.ts';
import {
  collectUrl, collectDomainRepresentation, collectTransport,
  collectLoginInterface, collectScriptRuntime,
} from './collect-evidence.ts';
import { type CollectedParts } from './assemble-evidence.ts';
import {
  computeDownloadContextEvidence, provisionalExtensionFromUrl,
  applyFilenameConfirmation, type DownloadRecord,
} from './download-context.ts';
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

const PAGE_URL = 'https://plain.example/home';
function pageParts(): CollectedParts {
  const dom = new JSDOM('<!doctype html><html><head><title>Home</title></head><body><p>hi</p></body></html>', { url: PAGE_URL });
  const doc = dom.window.document;
  return {
    url: collectUrl(PAGE_URL),
    domainRepresentation: collectDomainRepresentation(PAGE_URL),
    transport: collectTransport('https:'),
    loginInterface: collectLoginInterface(doc as unknown as ParentNode, doc.baseURI, () => false, doc.title),
    scriptRuntime: collectScriptRuntime({ transmissionEndpoints: [], dynamicScriptOrigins: [] }),
  };
}

const COMPOUND_URL = 'http://localhost:8000/fake-invoice.pdf.zip';
const BENIGN_DL_URL = 'http://localhost:8000/report.pdf';

/** A "Save link as" download as it arrives at onCreated: no filename yet. */
function saveAsProvisional(url: string): DownloadRecord {
  return { url, filename: '', mime: '', referrer: '', observedAt: 1, filenameConfirmed: false };
}

const fired = (o: { findings: readonly { ruleId: string }[] }, id: string) => o.findings.some((f) => f.ruleId === id);

/** Stand up a session with cached page evidence, ready for a download re-pass. */
async function freshSession(tabId: number, at: number): Promise<{ store: SessionStore; cache: EvidenceCache; parts: SessionKeyParts }> {
  const store = new SessionStore(memoryBackend());
  const cache = new EvidenceCache();
  const parts: SessionKeyParts = { tabId, navigationId: tabId * 1000 };
  await store.startSession(parts, PAGE_URL, '2026-09-05', `DOC-${tabId}`);
  cache.remember(parts, pageParts(), at);
  return { store, cache, parts };
}

// ══ 1–3. The fake-invoice.pdf.zip Save-As: provisional silent, confirmed fires, idempotent ══
{
  const at = 10_000_000;
  const { store, cache, parts } = await freshSession(1, at);

  // (1) PROVISIONAL — onCreated fired with filename==='' (the observed live case).
  const prov = saveAsProvisional(COMPOUND_URL);
  const provResult = await runDownloadRepass({
    store, cache, parts, downloadContext: computeDownloadContextEvidence(prov),
    ruleSet, storeReader: emptyStore, now: at + 1_000, collectedOn: '2026-09-05',
  });
  assert.ok(provResult.status === 'ran', `provisional re-pass must run; got ${JSON.stringify(provResult)}`);
  assert.ok(!fired(provResult.outcome, 'DL-02'),
    `provisional (filename==='') must NOT fire DL-02; fired [${provResult.outcome.findings.map((f) => f.ruleId).join(', ')}]`);
  // The URL-derived signal DOES see the disguise — but it is not authoritative.
  const sig = provisionalExtensionFromUrl(COMPOUND_URL);
  assert.equal(sig.hasCompoundExtension, true, "the URL path DOES look like a compound-extension disguise (pdf.zip)");
  console.log(`  [1] provisional Save-As filename='' : URL-derived compoundExt=${sig.hasCompoundExtension} `
    + 'yet DL-02 does NOT fire — URL signal is not treated as authoritative ✓');

  // (2) CONFIRMED — downloads.onChanged delivers the real filename.
  const { rec: confirmed, changed } = applyFilenameConfirmation(prov, 'fake-invoice.pdf.zip');
  assert.equal(changed, true, 'a real filename is a meaningful confirmation');
  assert.equal(confirmed.filenameConfirmed, true, 'the record is now marked filename-confirmed');
  const confResult = await runDownloadRepass({
    store, cache, parts, downloadContext: computeDownloadContextEvidence(confirmed),
    ruleSet, storeReader: emptyStore, now: at + 2_000, collectedOn: '2026-09-05',
  });
  assert.ok(confResult.status === 'ran', `confirmed re-pass must run; got ${JSON.stringify(confResult)}`);
  const firedIds = confResult.outcome.findings.map((f) => f.ruleId);
  assert.ok(fired(confResult.outcome, 'DL-02'),
    `DL-02 must FIRE once the real filename arrives; fired [${firedIds.join(', ')}]`);
  // The exact verdict shape the popup consumes (ssx:verdict:<tab>.fired):
  console.log(`  [2] onChanged confirms 'fake-invoice.pdf.zip' -> popup verdict fired=[${firedIds.join(', ')}] `
    + `score=${confResult.outcome.aggregation.score} effectiveTier=${confResult.outcome.aggregation.effectiveTier} `
    + '— DL-02 present; the exact regression, now fixed ✓ (DL-02 is a baseWeight-20 aggravator, so Low on its own)');

  // (3) IDEMPOTENT — a repeated identical filename delta is a no-op.
  const again = applyFilenameConfirmation(confirmed, 'fake-invoice.pdf.zip');
  assert.equal(again.changed, false, 'a repeated identical confirmation must not re-trigger a re-pass');
  console.log('  [3] repeated identical filename delta -> changed=false, no redundant re-pass ✓');
}

// ══ 4. A genuine report.pdf Save-As stays silent throughout ══════════════════
{
  const at = 20_000_000;
  const { store, cache, parts } = await freshSession(2, at);

  const prov = saveAsProvisional(BENIGN_DL_URL);
  const provR = await runDownloadRepass({
    store, cache, parts, downloadContext: computeDownloadContextEvidence(prov),
    ruleSet, storeReader: emptyStore, now: at + 1_000, collectedOn: '2026-09-05',
  });
  assert.ok(provR.status === 'ran' && !fired(provR.outcome, 'DL-02'), 'benign report.pdf must be silent provisionally');

  const { rec: conf } = applyFilenameConfirmation(prov, 'report.pdf');
  const confR = await runDownloadRepass({
    store, cache, parts, downloadContext: computeDownloadContextEvidence(conf),
    ruleSet, storeReader: emptyStore, now: at + 2_000, collectedOn: '2026-09-05',
  });
  assert.ok(confR.status === 'ran' && !fired(confR.outcome, 'DL-02'), 'benign report.pdf must stay silent after confirmation');
  assert.equal(provisionalExtensionFromUrl(BENIGN_DL_URL).hasCompoundExtension, false, 'report.pdf is not a compound extension');
  console.log('  [4] genuine report.pdf Save-As: silent provisionally AND after confirmation ✓');
}

// ══ 5. A late onChanged past the staleness bound skips honestly ══════════════
{
  const at = 30_000_000;
  const { store, cache, parts } = await freshSession(3, at);
  const { rec: conf } = applyFilenameConfirmation(saveAsProvisional(COMPOUND_URL), 'fake-invoice.pdf.zip');
  const staleR = await runDownloadRepass({
    store, cache, parts, downloadContext: computeDownloadContextEvidence(conf),
    ruleSet, storeReader: emptyStore, now: at + EVIDENCE_CACHE_MAX_AGE_MS + 1, collectedOn: '2026-09-05',
  });
  assert.equal(staleR.status, 'skipped', `a late onChanged past the bound must skip; got ${JSON.stringify(staleR)}`);
  assert.equal(staleR.status === 'skipped' ? staleR.reason : '', 'evidence_stale', 'skip reason must be evidence_stale');
  console.log(`  [5] onChanged past ${EVIDENCE_CACHE_MAX_AGE_MS}ms -> re-pass skipped (evidence_stale), no special-casing ✓`);
}

console.log('DEFECT-43 PROVEN: a Save-As compound-extension disguise (fake-invoice.pdf.zip) is silent while '
  + 'filename is unconfirmed (URL-derived signal recorded but non-authoritative), fires DL-02 once '
  + 'downloads.onChanged confirms the real filename, is idempotent on repeat deltas, never false-positives on '
  + 'a genuine report.pdf, and honors the existing staleness bound.');
