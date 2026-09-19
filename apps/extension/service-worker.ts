/**
 * A1.1–A1.5 + first-run wiring — MV3 background service worker (Role A).
 *
 * Role A detects browser events, drives Session lifecycle, and INVOKES the
 * engine; it never evaluates rules itself (B-9). This worker now:
 *   - tracks Analysis Sessions across worker termination (A1.1),
 *   - receives live-DOM evidence from the content script,
 *   - runs the real engine (runAnalysisPass) against it, using the A1.3
 *     AuthStore as the ACEM's reader (A1.5),
 *   - reflects the verdict on the toolbar badge and stores it for the popup,
 *   - observes downloads (DL family, step 7b).
 *
 * MV3 reality (A1.1): no extension-context `activate` event — reconstruction
 * runs at top-level on every wake, plus onStartup/onInstalled.
 */

import {
  SessionStore, type SessionStorageBackend, type SessionKeyParts,
} from './session-store.ts';
import { DocumentIndex, runPassInSession, EvidenceCache } from './session-pass.ts';
import { assembleEvidence, type CollectedParts } from './assemble-evidence.ts';
import {
  handleDownloadCreated, handleDownloadChanged, mergeStoredDownloadContext,
  buildVerdict, type DownloadEnv,
} from './download-handler.ts';
import { AuthStore, chromeAuthBackend, inPrivateContext } from './auth-store.ts';
import { IncidentHistory, type IncidentStorageBackend, type IncidentTier } from './incident-history.ts';
import { RedirectTracker, computeRedirectEvidence, redirectKey } from './redirect-observer.ts';
import {
  LoginSuccessTracker, buildLoginFingerprint, buildAuthRecordRequest,
} from './login-success.ts';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { AnalysisPassOutcome } from '../../packages/engine/pass.ts';
import { recordIntervention } from '../../packages/engine/stage7-8.ts';
import { decideIntervention, type InterventionOverrideSuppression } from './intervention-logic.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { RiskTier } from '../../packages/contracts/passresult.contract.v1.ts';
import type {
  RedirectEvidence, CredentialFieldKind, AnalysisSessionId,
} from '../../packages/contracts/evidence.contract.v1.ts';

const chromeSessionBackend: SessionStorageBackend = {
  get: (keys) => chrome.storage.session.get(keys),
  set: (items) => chrome.storage.session.set(items),
  remove: (keys) => chrome.storage.session.remove(keys),
};
// Dashboard Incident History (NEW, v3): persistent, so chrome.storage.LOCAL
// (session clears on restart and would break 30-day retention).
const chromeLocalBackend: IncidentStorageBackend = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};
const incidentHistory = new IncidentHistory({ backend: chromeLocalBackend });
const store = new SessionStore(chromeSessionBackend);
const authStore = new AuthStore({ backend: chromeAuthBackend(), isPrivateContext: inPrivateContext() });
// documentId -> (tabId, navigationId). Built from onCommitted (a real browser
// event), rebuilt from persisted records on wake. Never page-supplied.
const docIndex = new DocumentIndex();
const redirectTracker = new RedirectTracker();
const loginTracker = new LoginSuccessTracker();
// DEC-45: the download-triggered re-pass reuses the most recent content-script
// evidence per session, and needs each tab's CURRENT navigation to resolve the
// download's session. Both in-memory: `tabToNav` is rebuilt on wake; the evidence
// cache is intentionally not (a download after dormancy gets no re-pass).
const evidenceCache = new EvidenceCache();
const tabToNav = new Map<number, number>();

/** The bundled rule set, loaded once and cached. */
let ruleSetPromise: Promise<RuleSet> | null = null;
function loadRuleSet(): Promise<RuleSet> {
  if (ruleSetPromise === null) {
    ruleSetPromise = fetch(chrome.runtime.getURL('rules-v0.1.0.json'))
      .then((r) => r.json() as Promise<RuleSet>);
  }
  return ruleSetPromise;
}

/**
 * The browser bindings the DEFECT-43 download path (`download-handler.ts`) needs.
 * `applyOutcome`, `maybeIntervene` and `today` are hoisted function declarations,
 * so referencing them here at module init is safe. Keeping the chrome surface in
 * this object is what lets `download-handler.ts` stay browser-free and testable.
 */
const downloadEnv: DownloadEnv = {
  storage: chromeSessionBackend,
  store,
  cache: evidenceCache,
  authStore,
  loadRuleSet,
  tabToNav,
  now: () => Date.now(),
  today,
  queryActiveTabId: async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id,
  applyOutcome: (tabId, targetUrl, outcome) => applyOutcome(tabId, targetUrl, outcome),
  maybeIntervene: (tabId, sessionParts, targetUrl, tier) => maybeIntervene(tabId, sessionParts, targetUrl, tier),
};

function deriveNavigationId(details: { navigationId?: number; timeStamp: number }): number {
  return details.navigationId ?? Math.trunc(details.timeStamp);
}
function today(): string { return new Date().toISOString().slice(0, 10); }

/* ── Tier 0 / Tier 1 lifecycle triggers ─────────────────────────────────── */
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  const parts: SessionKeyParts = { tabId: details.tabId, navigationId: deriveNavigationId(details) };
  // details.documentId is the browser-minted per-document id (Chrome 106+;
  // manifest min is 116). It is the SAME string the browser later attaches to a
  // content-script message as sender.documentId — that identity is what the
  // whole attribution design rests on. `?? ''` guards a browser that somehow
  // omits it (older-than-116, impossible per manifest, but fail-safe not crash).
  const documentId = details.documentId ?? '';
  docIndex.record(documentId, parts);
  // DEC-45: remember this tab's current navigation so a later download can be
  // attributed to the session it belongs to.
  tabToNav.set(details.tabId, parts.navigationId);
  void store.startSession(parts, details.url, today(), documentId);
  // §9.4: consume a pending "proceed" hint into a PER-NAVIGATION override for
  // this just-committed session (before the content script's pass runs).
  void consumeArmedOverride(details.tabId, parts.navigationId, details.url);
  // §20.5 conjunct 2 — a main-frame navigation is the "subsequent navigation"
  // after a credential submit. Records the time against any pending submit.
  loginTracker.recordNavigation(details.tabId, Date.now());
});
chrome.webNavigation.onDOMContentLoaded.addListener((details) => {
  if (details.frameId !== 0) return;
  const parts: SessionKeyParts = { tabId: details.tabId, navigationId: deriveNavigationId(details) };
  void store.updateSession(parts, { reachedTier: 1 });
});

/* ── Redirect evidence producer (webNavigation only, main frame) ──────────
 * onBeforeNavigate records where a navigation started; onCommitted finalizes
 * initial/final/server-redirect into RedirectEvidence and persists it per tab
 * for the analysis pass. onErrorOccurred drops pending state so a failed
 * navigation cannot leak a stale initialUrl into the next one.
 *
 * onHistoryStateUpdated is DELIBERATELY NOT wired: an SPA History API change
 * is not an HTTP/server redirect and must never be recorded as one. Subframe
 * events are excluded inside the tracker (frameId !== 0). Full multi-hop chain
 * + hopCount need chrome.webRequest — a permission decision, not made here. */
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  redirectTracker.beginNavigation(details.tabId, details.frameId, details.url);
});
chrome.webNavigation.onCommitted.addListener((details) => {
  const rec = redirectTracker.commitNavigation(
    details.tabId, details.frameId, details.url, details.transitionQualifiers ?? [],
  );
  if (rec === null) return;
  const redirect = computeRedirectEvidence(rec);
  void chrome.storage.session.set({ [redirectKey(details.tabId)]: redirect });
});
chrome.webNavigation.onErrorOccurred.addListener((details) => {
  redirectTracker.abortNavigation(details.tabId, details.frameId);
});

/* ── messages from the content script ─────────────────────────────────────
 * 'ssx-evidence'    — a page's collected evidence -> engine pass (+ landing
 *                     evaluation for §20.5).
 * 'ssx-cred-submit' — a credential-bearing form was submitted on THIS page
 *                     (§20.5 conjunct 1). Records the pending auth, capturing
 *                     G-01's input (did a CRED rule fire on this page?) from
 *                     the login page's own stored verdict. */
chrome.runtime.onMessage.addListener((msg, sender) => {
  // Tier-2 interstitial actions come from the extension's OWN intervention page
  // (a tab), which passes its target tabId explicitly — handled before the
  // content-script guard below.
  if (msg?.type === 'ssx-intervention-proceed') {
    void handleProceed(Number(msg.tabId), msg.targetUrl as string);
    return;
  }
  if (msg?.type === 'ssx-intervention-goback') {
    void handleGoBack(Number(msg.tabId));
    return;
  }
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  if (msg?.type === 'ssx-evidence') {
    // sender.documentId is browser-attached to the sending document, fixed at
    // send time — the attribution key. Never read a navigationId off `msg`.
    void analyzeAndReflect(tabId, sender.documentId, msg.targetUrl as string, msg.parts as CollectedParts, Boolean(msg.sessionStateEstablished));
  } else if (msg?.type === 'ssx-cred-submit') {
    void recordCredentialSubmit(tabId, msg.origin as string,
      msg.fieldComposition as CredentialFieldKind[], msg.titleTokens as string[]);
  }
});

async function recordCredentialSubmit(
  tabId: number, origin: string, fieldComposition: CredentialFieldKind[], titleTokens: string[],
): Promise<void> {
  // G-01 input: whether any CRED-family rule fired on the login page's own
  // analysis. Read from the verdict stored for this tab (the login page's).
  const stored = await chrome.storage.session.get(`ssx:verdict:${tabId}`);
  const verdict = stored[`ssx:verdict:${tabId}`] as { fired?: string[] } | undefined;
  const credFindingActiveInSession = (verdict?.fired ?? []).some((r) => r.startsWith('CRED-'));
  loginTracker.recordSubmit(tabId, {
    origin,
    fingerprint: buildLoginFingerprint(fieldComposition, titleTokens),
    credFindingActiveInSession,
    analysisSessionId: `sess_${origin}` as AnalysisSessionId,
    submitTimeMs: Date.now(),
  });
}

async function analyzeAndReflect(
  tabId: number, documentId: string | undefined, targetUrl: string, parts: CollectedParts, sessionStateEstablished: boolean = false,
): Promise<void> {
  try {
    const ruleSet = await loadRuleSet();
    // Merge the SW-observed redirect evidence for this tab (if any) into the
    // content script's parts. Absent -> assembler falls back to the stub
    // (notCollected), so the redirect module is honestly unevaluable.
    const stored = await chrome.storage.session.get(redirectKey(tabId));
    const redirect = stored[redirectKey(tabId)] as RedirectEvidence | undefined;
    let merged: CollectedParts = parts;
    if (redirect) merged = { ...merged, redirect };
    // DEFECT-38/43 path B (the RELIABLE trigger): merge THIS tab's persisted
    // download record (with the onChanged-confirmed filename) into this fresh
    // pass. Cache-independent — this is what raises DL-02 on a same-tab
    // navigation after a Save-As, whether or not the immediate re-pass fired.
    merged = await mergeStoredDownloadContext(downloadEnv, tabId, merged);
    const evidence = assembleEvidence(merged, targetUrl, today());

    // DEC-43 multi-pass wiring. Resolve THIS message's document to its session
    // (by the browser-attached documentId, not "current nav for tab"), thread
    // the committed priorPassState into the pass, and fold the outcome back at
    // the commit boundary. If the document can't be attributed to a session,
    // fall back to a bare pass with prior=null and no commit-back.
    const sessionParts = documentId !== undefined ? await resolveSessionParts(documentId) : null;
    // DEC-45: cache the raw content-script parts for this session so a
    // download-triggered re-pass can reuse them. Never a credential value — the
    // collector captures field composition + the page title only (§20.2/20.3).
    if (sessionParts !== null) evidenceCache.remember(sessionParts, parts, Date.now());
    const outcome = sessionParts !== null
      ? await runPassInSession({
          store, parts: sessionParts, evidence, ruleSet, storeReader: authStore,
          // Tier-2 Warn/Block UI does not exist yet, so no intervention is ever
          // presented — the plumbing is real, the value is structurally false.
          interventionWasPresented: false,
        })
      : await runAnalysisPass(evidence, ruleSet, authStore, null);

    await applyOutcome(tabId, targetUrl, outcome);

    // §20.5 conjuncts 3 + 4, evaluated on THIS (possibly landing) page against
    // any pending credential submit for the tab. On all four holding, write
    // through the EXISTING guarded store path (G-01/G-02 inside it).
    void maybeRecordLoginSuccess(tabId, parts, sessionStateEstablished);

    // Tier-2 gate (§9.4): Medium -> interstitial, High -> block. The tier is
    // already §11.3-floored, and showing the UI records the intervention so a
    // later pass in this session cannot downgrade below it.
    await maybeIntervene(tabId, sessionParts, targetUrl, outcome.aggregation.effectiveTier);
  } catch (err) {
    console.error('SSX analyze error:', err);
  }
}

async function maybeRecordLoginSuccess(
  tabId: number, parts: CollectedParts, sessionStateEstablished: boolean,
): Promise<void> {
  const li = parts.loginInterface;
  const credentialFormPresent = li.credentialFormPresent.state === 'present' && li.credentialFormPresent.value;
  const { result, pending } = loginTracker.resolveLanding(tabId, { credentialFormPresent, sessionStateEstablished });
  if (!result.success || pending === null) return;

  // G-02 (§20.6): if the user proceeded past an intervention on THIS origin in
  // the tab's CURRENT navigation session, the auth store must NOT learn trust
  // from it. Wires the previously-hardcoded-false override — proceeding never
  // teaches trust. Keyed per-navigation, so a stale prior-navigation proceed
  // cannot leak into a later session's write.
  const navId = tabToNav.get(tabId);
  const override = navId !== undefined ? await getOverride(tabId, navId) : null;
  const overridden = override !== null && override.origin === pending.origin;
  const req = buildAuthRecordRequest(pending, inPrivateContext(), overridden);
  if (req === null) return;                         // malformed origin — never write
  // The write is GUARDED inside recordAuthentication (G-01…G-05) and feeds the
  // PROVISIONAL→ESTABLISHED ramp; this producer does not bypass any of it.
  const outcome = await authStore.recordAuthentication(req);
  console.info(`SSX login-success (${pending.origin}): ${JSON.stringify(outcome)}`);
}

/* ── badge: green Low / yellow Medium / red High ────────────────────────── */
function reflectBadge(tabId: number, tier: string): void {
  const color = tier === 'High' ? '#cf222e' : tier === 'Medium' ? '#bf8700' : '#1a7f37';
  const text = tier === 'High' ? 'H' : tier === 'Medium' ? 'M' : 'L';
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setBadgeText({ tabId, text });
}

/** Persist a pass verdict for a tab and reflect its tier on the badge. Shared by
 *  the content-script-triggered pass and the DEC-45 download re-pass. */
async function applyOutcome(tabId: number, targetUrl: string, outcome: AnalysisPassOutcome): Promise<void> {
  const verdict = buildVerdict(outcome, targetUrl);
  await chrome.storage.session.set({ [`ssx:verdict:${tabId}`]: verdict });
  reflectBadge(tabId, verdict.effectiveTier);
  // Dashboard Incident History (v3): record EVERY verdict, including Safe (Low) —
  // the full-history decision. Tier LABEL + fired rules only, never the score.
  let host: string;
  try { host = new URL(targetUrl).host; } catch { host = ''; }
  await incidentHistory.record({
    url: targetUrl, domain: host,
    tier: verdict.effectiveTier as IncidentTier, fired: verdict.fired,
  });
}

/* ── Tier-2 intervention (§9.4, §11.3/§11.4) ──────────────────────────────────
 * The override suppression is keyed PER NAVIGATION SESSION (tabId, navigationId)
 * — the same model DEC-43/44 established — NOT by origin across navigations. A
 * proceed cannot pre-know the navigationId of the page it re-opens, so it writes
 * a one-shot ARMED hint (per tab); the very next onCommitted for that tab
 * consumes it into a per-navigation override record and clears the hint. The
 * override therefore dies with its navigation and never lingers as a per-origin
 * trust (the retired ssx:auth-prior: bug), and never crosses to another site. */
function overrideKey(tabId: number, navigationId: number): string { return `ssx:intv-override:${tabId}:${navigationId}`; }
function overrideArmedKey(tabId: number): string { return `ssx:intv-override-armed:${tabId}`; }

async function getOverride(tabId: number, navigationId: number): Promise<InterventionOverrideSuppression | null> {
  const k = overrideKey(tabId, navigationId);
  return ((await chrome.storage.session.get(k))[k] as InterventionOverrideSuppression | undefined) ?? null;
}

/**
 * Consume a pending armed proceed-hint at navigation commit: if the tab was armed
 * and the committed URL's origin matches, write the per-navigation override for
 * (tabId, navigationId); otherwise clear the hint (the user navigated elsewhere).
 * Called from onCommitted, so the override is in place before the content script
 * runs and maybeIntervene checks it.
 */
async function consumeArmedOverride(tabId: number, navigationId: number, committedUrl: string): Promise<void> {
  const armedRaw = (await chrome.storage.session.get(overrideArmedKey(tabId)))[overrideArmedKey(tabId)] as
    { origin: string } | undefined;
  if (armedRaw === undefined) return;
  await chrome.storage.session.remove(overrideArmedKey(tabId)); // one-shot
  let origin: string;
  try { origin = new URL(committedUrl).origin; } catch { return; }
  if (origin !== armedRaw.origin) return;                        // navigated elsewhere -> discard
  const record: InterventionOverrideSuppression = { origin, tier: 'Medium', kind: 'intervention-override-suppression', at: Date.now() };
  await chrome.storage.session.set({ [overrideKey(tabId, navigationId)]: record });
}

/**
 * Present the Tier-2 UI for a pass's EFFECTIVE tier (§9.4): Medium -> interstitial,
 * High -> hard block, Low -> nothing. The tier is already §11.3-floored by the
 * engine, so showing UI on it is monotonic by construction. When an intervention
 * is shown, it is recorded into the session (recordIntervention) so a LATER pass
 * in the SAME session cannot downgrade below it. The interstitial is a
 * chrome-extension:// page the tab is NAVIGATED to — not an in-page overlay a
 * hostile page could script away.
 */
async function maybeIntervene(
  tabId: number, sessionParts: SessionKeyParts | null, targetUrl: string, effectiveTier: RiskTier,
): Promise<void> {
  let origin: string;
  try { origin = new URL(targetUrl).origin; } catch { return; } // no origin -> nothing to scope
  const override = sessionParts !== null ? await getOverride(tabId, sessionParts.navigationId) : null;
  const action = decideIntervention(effectiveTier, override, origin);
  if (action === 'none') return;
  // §11.4 lock: record that an intervention was presented at this tier.
  if (sessionParts !== null) {
    await store.recordPassOutcome(sessionParts, (latest) => recordIntervention(latest, effectiveTier));
  }
  const url = chrome.runtime.getURL('intervention.html')
    + `?tier=${effectiveTier}&tab=${tabId}&target=${encodeURIComponent(targetUrl)}`;
  await chrome.tabs.update(tabId, { url });
}

/**
 * User proceeded past a Medium interstitial. Arms a one-shot override hint for
 * the tab (consumed by the next onCommitted into a PER-NAVIGATION override), then
 * returns the tab to the page. The resulting override (a) suppresses a
 * re-interstitial for that navigation only, and (b) is the G-02 signal that the
 * auth store must NOT learn trust from this session. It changes no scoring, grants
 * no trust, never touches the engine suppression pipeline (the real A-01 / DEC-16
 * stays open), and never persists as a per-origin record across navigations.
 */
async function handleProceed(tabId: number, targetUrl: string): Promise<void> {
  let origin: string;
  try { origin = new URL(targetUrl).origin; } catch { return; }
  await chrome.storage.session.set({ [overrideArmedKey(tabId)]: { origin, at: Date.now() } });
  console.info(`SSX intervention override armed (user proceeded) origin=${origin} tab=${tabId} — per-navigation only; trust NOT taught (G-02 blocks any store write)`);
  await chrome.tabs.update(tabId, { url: targetUrl });
}

/** User chose safety. Leave the flagged page entirely (a neutral blank page). */
async function handleGoBack(tabId: number): Promise<void> {
  await chrome.tabs.update(tabId, { url: 'about:blank' });
}

/** Drop a closed tab's per-navigation override records + any armed hint. */
async function clearTabOverrides(tabId: number): Promise<void> {
  const all = await chrome.storage.session.get(null);
  const prefix = `ssx:intv-override:${tabId}:`;
  const keys = Object.keys(all).filter((k) => k.startsWith(prefix) || k === overrideArmedKey(tabId));
  if (keys.length > 0) await chrome.storage.session.remove(keys);
}

/* ── DL family (step 7b): observe downloads. Requires the "downloads"
 * permission (already in the manifest).
 *
 * DEFECT-38: scoped to the tab that had FOCUS at event time, keyed by tabId —
 * NOT a global last-write-wins key. DownloadItem carries no tabId, so
 * chrome.tabs.query({active,currentWindow}) at onCreated is the attribution
 * heuristic (chrome.tabs.query returns tab .id without the "tabs" permission).
 * It is a HEURISTIC and bounded honestly: a background-triggered or
 * non-focused-tab download has no confident active tab, so NOTHING is stored —
 * the producer then yields notCollected and the module is unevaluable, never a
 * misattributed guess. Referrer/URL string correlation was rejected (empty
 * referrers, ambiguous domains — the self-declared-heuristic class this project
 * requires be labelled, not silently trusted). ── */
// DEFECT-43/44: both handlers live in the browser-free `download-handler.ts`
// (driven by `downloadEnv`), so the whole path — tab attribution, the
// downloadId->tabId map, the onChanged filename confirmation, and the re-pass —
// is exercised by `download-sametab-e2e.test.ts` without a browser. These
// listeners are the thin chrome bindings. onChanged fires many deltas
// (progress/state/filename); the handler acts only on a filename confirmation.
chrome.downloads.onCreated.addListener((item) => { void handleDownloadCreated(downloadEnv, item); });
chrome.downloads.onChanged.addListener((delta) => { void handleDownloadChanged(downloadEnv, delta); });

/**
 * Resolve a message's document to its session by the browser-attached
 * documentId. On a cold worker the in-memory index is empty, so rebuild it once
 * from persisted records (each carries its documentId) and re-resolve. A
 * still-unresolved documentId is the diagnostic the whole design turns on: it
 * means the onCommitted documentId and the onMessage sender.documentId did NOT
 * match (or onCommitted was never seen for this document) — logged, and the pass
 * falls back to prior=null rather than mis-attributing to another navigation.
 */
async function resolveSessionParts(documentId: string): Promise<SessionKeyParts | null> {
  let parts = docIndex.resolve(documentId);
  if (parts === null) {
    docIndex.rebuildFrom(await store.reconstructAll());
    parts = docIndex.resolve(documentId);
    if (parts === null) {
      console.warn('SSX: unresolved documentId (no session attribution) —', documentId);
    }
  }
  return parts;
}

/* ── worker-wake reconstruction (A1.1) ──────────────────────────────────── */
async function reconstructOnWake(): Promise<void> {
  // Rebuild the documentId index so a message arriving right after wake can be
  // attributed without a per-message reconstruct.
  const sessions = await store.reconstructAll();
  docIndex.rebuildFrom(sessions);
  // DEC-45: rebuild each tab's current (latest) navigation so a download arriving
  // right after wake resolves to the tab's current session. The evidence cache
  // itself is deliberately NOT rebuilt — a download after dormancy gets no
  // re-pass (no fresh evidence to combine), the safe direction.
  for (const s of sessions) {
    const cur = tabToNav.get(s.tabId);
    if (cur === undefined || s.navigationId > cur) tabToNav.set(s.tabId, s.navigationId);
  }
}
chrome.runtime.onStartup.addListener(() => { void reconstructOnWake(); });
chrome.runtime.onInstalled.addListener(() => { void reconstructOnWake(); });
void reconstructOnWake();

/* ── toolbar icon: open the full dashboard tab (v3) ───────────────────────
 * No default_popup in the manifest, so onClicked fires for EVERY tier and opens
 * the dashboard as a full tab rather than a small popup. */
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

/* ── tab close: drop that tab's session records + index entries ──────────── */
chrome.tabs.onRemoved.addListener((tabId) => {
  docIndex.forgetTab(tabId);
  evidenceCache.forgetTab(tabId);
  tabToNav.delete(tabId);
  void clearTabOverrides(tabId);
  void store.endTabSessions(tabId);
});

export { reconstructOnWake, deriveNavigationId };
