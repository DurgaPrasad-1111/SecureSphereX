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
import { DocumentIndex, runPassInSession, EvidenceCache, runDownloadRepass } from './session-pass.ts';
import { assembleEvidence, type CollectedParts } from './assemble-evidence.ts';
import { computeDownloadContextEvidence, downloadKey, type DownloadRecord } from './download-context.ts';
import { AuthStore, chromeAuthBackend, inPrivateContext } from './auth-store.ts';
import { RedirectTracker, computeRedirectEvidence, redirectKey } from './redirect-observer.ts';
import {
  LoginSuccessTracker, buildLoginFingerprint, buildAuthRecordRequest,
} from './login-success.ts';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { AnalysisPassOutcome } from '../../packages/engine/pass.ts';
import { recordIntervention } from '../../packages/engine/stage7-8.ts';
import { decideIntervention, type ProceedRecord } from './intervention-logic.ts';
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
    // DEFECT-38: merge THIS tab's scoped download record (if any) into parts.
    // Absent -> assembler stub -> notCollected -> module unevaluable, honestly.
    const dlStored = await chrome.storage.session.get(downloadKey(tabId));
    const dlRec = dlStored[downloadKey(tabId)] as DownloadRecord | undefined;
    const downloadContext = dlRec ? computeDownloadContextEvidence(dlRec) : undefined;
    let merged: CollectedParts = parts;
    if (redirect) merged = { ...merged, redirect };
    if (downloadContext) merged = { ...merged, downloadContext };
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

  // G-02 (§20.6): if the user proceeded past an intervention on THIS origin this
  // session (an A-01 record), the auth store must NOT learn trust from it. This
  // wires the previously-hardcoded-false override — proceeding never teaches trust.
  const proceeded = await getProceeded(tabId);
  const overridden = proceeded !== null && proceeded.origin === pending.origin;
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
  const effectiveTier = outcome.aggregation.effectiveTier;
  const verdict = {
    effectiveTier,
    rawTier: outcome.aggregation.rawTier,
    score: outcome.aggregation.score,
    fired: outcome.findings.map((f) => f.ruleId),
    unevaluable: Object.entries(outcome.evaluations)
      .filter(([, e]) => e.result.status === 'unevaluable')
      .map(([module, e]) => ({ module, reason: e.result.status === 'unevaluable' ? e.result.reason : '' })),
    targetUrl,
  };
  await chrome.storage.session.set({ [`ssx:verdict:${tabId}`]: verdict });
  reflectBadge(tabId, effectiveTier);
}

/* ── Tier-2 intervention (§9.4, §11.3/§11.4) ──────────────────────────────── */
function proceededKey(tabId: number): string { return `ssx:proceeded:${tabId}`; }

async function getProceeded(tabId: number): Promise<ProceedRecord | null> {
  const raw = await chrome.storage.session.get(proceededKey(tabId));
  return (raw[proceededKey(tabId)] as ProceedRecord | undefined) ?? null;
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
  const action = decideIntervention(effectiveTier, await getProceeded(tabId), origin);
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
 * User proceeded past a Medium interstitial. Logs the A-01 user-trusted-origin
 * record (§6.4), scoped to this origin + this session in chrome.storage.session:
 * it (a) suppresses a re-interstitial for the origin, and (b) is the G-02 signal
 * that the auth store must NOT learn trust from this session. It never writes
 * cross-session trust and never touches the engine suppression pipeline
 * (DEC-16 stays open). Then returns the tab to the page the user chose to trust.
 */
async function handleProceed(tabId: number, targetUrl: string): Promise<void> {
  let origin: string;
  try { origin = new URL(targetUrl).origin; } catch { return; }
  const record: ProceedRecord = { origin, tier: 'Medium', suppressionId: 'A-01', at: Date.now() };
  await chrome.storage.session.set({ [proceededKey(tabId)]: record });
  console.info(`SSX A-01 logged (user proceeded) origin=${origin} tab=${tabId} — trust NOT taught (G-02 blocks any store write)`);
  await chrome.tabs.update(tabId, { url: targetUrl });
}

/** User chose safety. Leave the flagged page entirely (a neutral blank page). */
async function handleGoBack(tabId: number): Promise<void> {
  await chrome.tabs.update(tabId, { url: 'about:blank' });
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
chrome.downloads.onCreated.addListener((item) => {
  void (async () => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = activeTab?.id;
    // Not confidently attributable to a focused tab -> record NOTHING. The
    // pass will see no download for any tab and downloadContext stays
    // notCollected (module unevaluable). Never the old global key.
    if (tabId === undefined) return;
    const rec: DownloadRecord = {
      url: item.url, filename: item.filename, mime: item.mime,
      referrer: item.referrer, observedAt: Date.now(),
    };
    await chrome.storage.session.set({ [downloadKey(tabId)]: rec });

    // DEC-45 (DEFECT-41 Option A): a download does not, on its own, produce an
    // analysis pass. Run a combined re-pass for this tab's CURRENT session,
    // reusing that session's cached content-script evidence + this download,
    // through runPassInSession — so the SAME per-session #withKeyLock serializes
    // it against a concurrent content-script pass (binding req 1). The FIRST
    // SW-initiated analysis trigger. Skipped honestly (logged) when there is no
    // current session, no cached evidence, or the evidence is too stale (req 3).
    const navId = tabToNav.get(tabId);
    if (navId === undefined) return;
    const ruleSet = await loadRuleSet();
    const result = await runDownloadRepass({
      store, cache: evidenceCache, parts: { tabId, navigationId: navId },
      downloadContext: computeDownloadContextEvidence(rec),
      ruleSet, storeReader: authStore, now: Date.now(), collectedOn: today(),
    });
    if (result.status === 'ran') {
      await applyOutcome(tabId, result.targetUrl, result.outcome);
      // A download re-pass can raise the tier (DL-01/DL-02) — gate on it too.
      await maybeIntervene(tabId, { tabId, navigationId: navId }, result.targetUrl, result.outcome.aggregation.effectiveTier);
    } else {
      console.info(`SSX download re-pass skipped (${result.reason}) for tab ${tabId}`);
    }
  })();
});

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

/* ── tab close: drop that tab's session records + index entries ──────────── */
chrome.tabs.onRemoved.addListener((tabId) => {
  docIndex.forgetTab(tabId);
  evidenceCache.forgetTab(tabId);
  tabToNav.delete(tabId);
  void store.endTabSessions(tabId);
});

export { reconstructOnWake, deriveNavigationId };
