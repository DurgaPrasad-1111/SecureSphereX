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
import { AuthStore, chromeAuthBackend, inPrivateContext } from './auth-store.ts';
import { RedirectTracker, computeRedirectEvidence, redirectKey } from './redirect-observer.ts';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { RedirectEvidence } from '../../packages/contracts/evidence.contract.v1.ts';

const chromeSessionBackend: SessionStorageBackend = {
  get: (keys) => chrome.storage.session.get(keys),
  set: (items) => chrome.storage.session.set(items),
  remove: (keys) => chrome.storage.session.remove(keys),
};
const store = new SessionStore(chromeSessionBackend);
const authStore = new AuthStore({ backend: chromeAuthBackend(), isPrivateContext: inPrivateContext() });
const redirectTracker = new RedirectTracker();

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

/* ── evidence from the content script → real engine pass ─────────────────── */
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'ssx-evidence') return;
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  void analyzeAndReflect(tabId, msg.targetUrl as string, msg.parts as CollectedParts);
});

async function analyzeAndReflect(tabId: number, targetUrl: string, parts: CollectedParts): Promise<void> {
  try {
    const ruleSet = await loadRuleSet();
    // Merge the SW-observed redirect evidence for this tab (if any) into the
    // content script's parts. Absent -> assembler falls back to the stub
    // (notCollected), so the redirect module is honestly unevaluable.
    const stored = await chrome.storage.session.get(redirectKey(tabId));
    const redirect = stored[redirectKey(tabId)] as RedirectEvidence | undefined;
    const evidence = assembleEvidence(redirect ? { ...parts, redirect } : parts, targetUrl, today());
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
  } catch (err) {
    console.error('SSX analyze error:', err);
  }
}

/* ── badge: green Low / yellow Medium / red High ────────────────────────── */
function reflectBadge(tabId: number, tier: string): void {
  const color = tier === 'High' ? '#cf222e' : tier === 'Medium' ? '#bf8700' : '#1a7f37';
  const text = tier === 'High' ? 'H' : tier === 'Medium' ? 'M' : 'L';
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setBadgeText({ tabId, text });
}

/* ── DL family (step 7b): observe downloads. Requires the "downloads"
 * permission, declared in the manifest. This records the most recent download
 * per initiating tab; wiring it into a full downloadContext evidence pass is a
 * follow-up (the DL modules are S-9 in-browser-only and become real HERE). ── */
chrome.downloads.onCreated.addListener((item) => {
  void chrome.storage.session.set({
    'ssx:last-download': { url: item.url, filename: item.filename, mime: item.mime, referrer: item.referrer },
  });
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
