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
import { assembleEvidence, type CollectedParts } from './assemble-evidence.ts';
import { computeDownloadContextEvidence, downloadKey, type DownloadRecord } from './download-context.ts';
import { AuthStore, chromeAuthBackend, inPrivateContext } from './auth-store.ts';
import { RedirectTracker, computeRedirectEvidence, redirectKey } from './redirect-observer.ts';
import {
  LoginSuccessTracker, buildLoginFingerprint, buildAuthRecordRequest,
} from './login-success.ts';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
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
const redirectTracker = new RedirectTracker();
const loginTracker = new LoginSuccessTracker();

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
  void store.startSession(parts, details.url, today());
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
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  if (msg?.type === 'ssx-evidence') {
    void analyzeAndReflect(tabId, msg.targetUrl as string, msg.parts as CollectedParts, Boolean(msg.sessionStateEstablished));
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
  tabId: number, targetUrl: string, parts: CollectedParts, sessionStateEstablished: boolean = false,
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
    // A1.5: the real AuthStore is the ACEM's reader. prior=null for a first
    // pass; the §11.4 lock is A1.1's concern and not wired into this minimal
    // first-run path yet.
    const outcome = await runAnalysisPass(evidence, ruleSet, authStore, null);

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

    // §20.5 conjuncts 3 + 4, evaluated on THIS (possibly landing) page against
    // any pending credential submit for the tab. On all four holding, write
    // through the EXISTING guarded store path (G-01/G-02 inside it).
    void maybeRecordLoginSuccess(tabId, parts, sessionStateEstablished);
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

  const req = buildAuthRecordRequest(pending, inPrivateContext());
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
    await chrome.storage.session.set({
      [downloadKey(tabId)]: {
        url: item.url, filename: item.filename, mime: item.mime,
        referrer: item.referrer, observedAt: Date.now(),
      },
    });
  })();
});

/* ── worker-wake reconstruction (A1.1) ──────────────────────────────────── */
async function reconstructOnWake(): Promise<void> {
  const sessions = await store.reconstructAll();
  void sessions;
}
chrome.runtime.onStartup.addListener(() => { void reconstructOnWake(); });
chrome.runtime.onInstalled.addListener(() => { void reconstructOnWake(); });
void reconstructOnWake();

export { reconstructOnWake, deriveNavigationId };
