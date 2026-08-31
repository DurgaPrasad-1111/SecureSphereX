/**
 * A1.1 — MV3 background service worker (Role A, the browser-facing half).
 *
 * Role A detects browser events and drives Session lifecycle; it never
 * evaluates rules (boundary contract B-9: "Role B recommends; Role A
 * executes"). For A1.1 this worker does the LIFECYCLE spine only:
 *   - a Tier 0 trigger on navigation commit (§3.2),
 *   - a Tier 1 trigger on DOM content ready (§3.2),
 *   - one Session per navigation (§3.1), persisted so it survives worker death,
 *   - reconstruction of live Sessions on every worker wake.
 * Evidence collection (A1.2), the store (A1.3), and real engine invocation
 * are deliberately NOT here yet — the D0.10 pass calls are left as marked
 * TODOs, not stubbed with fake results.
 *
 * ⚠️ MV3 lifecycle reality, and a correction to "reconstruct on the activate
 * event": an extension background service worker does NOT receive a DOM
 * ServiceWorker `activate` event the way a web-page SW does. It is simply
 * re-executed from the top on each wake after idle termination. The correct
 * "on restart" hook is therefore TOP-LEVEL execution of this module (the
 * `void reconstructOnWake()` call below), reinforced by chrome.runtime
 * .onStartup (browser start) and onInstalled (install/update). All three route
 * to the same reconstruction path.
 */

import {
  SessionStore,
  type SessionStorageBackend,
  type SessionKeyParts,
} from './session-store.ts';

/* ── chrome.storage.session adapter ────────────────────────────────────────
 * The ONE browser-specific seam. `sessionStore.ts` stays browser-free and is
 * tested with an in-memory fake implementing this same interface; here the
 * real MV3 in-memory area is plugged in. Session storage (not local) because
 * per-navigation Session state has no reason to outlive the browser, and
 * §20.2's never-transmit discipline argues for the least-persistent store that
 * meets the need. */
const chromeSessionBackend: SessionStorageBackend = {
  get: (keys) => chrome.storage.session.get(keys),
  set: (items) => chrome.storage.session.set(items),
  remove: (keys) => chrome.storage.session.remove(keys),
};

const store = new SessionStore(chromeSessionBackend);

/**
 * Derive a per-navigation identifier. webNavigation's `navigationId` is not a
 * guaranteed field on stable `onCommitted`, so `timeStamp` (ms since epoch,
 * always present, unique per navigation within a tab) is the fallback. Either
 * way the key is (tabId, <this navigation>), satisfying §3.1's "a new
 * navigation creates a new Session". Truncated to an integer for a stable
 * key string.
 */
function deriveNavigationId(details: { navigationId?: number; timeStamp: number }): number {
  return details.navigationId ?? Math.trunc(details.timeStamp);
}

/** Day-granular stamp (§20.3 temporal-minimisation convention). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ── Tier 0 — navigation commit (§3.2) ─────────────────────────────────────
 * Main frame only (frameId 0). A subframe navigation is not a new top-level
 * Analysis Session. Creates the Session; does NOT interrupt the user (§3.2:
 * only Tier 2 may). */
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  const parts: SessionKeyParts = { tabId: details.tabId, navigationId: deriveNavigationId(details) };
  void store.startSession(parts, details.url, today());
  // TODO(A1.2): runLocalPass(ctx tier 0) once evidence collection exists.
});

/* ── Tier 1 — DOM content ready (§3.2) ──────────────────────────────────────
 * Marks the Session as having reached Tier 1. A no-op if the commit was never
 * seen (updateSession returns null) — a Tier 1 event must not fabricate a
 * Session whose Tier 0 the worker missed. */
chrome.webNavigation.onDOMContentLoaded.addListener((details) => {
  if (details.frameId !== 0) return;
  const parts: SessionKeyParts = { tabId: details.tabId, navigationId: deriveNavigationId(details) };
  void store.updateSession(parts, { reachedTier: 1 });
  // TODO(A1.2): runLocalPass(ctx tier 1) once evidence collection exists.
});

/* ── Worker-wake reconstruction ────────────────────────────────────────────
 * The operation A1.1's exit criterion turns on. On every wake, rebuild the
 * live Session set from storage. For A1.1 this proves survival; A1.2+ will use
 * the reconstructed set to resume in-flight analysis. */
async function reconstructOnWake(): Promise<void> {
  const sessions = await store.reconstructAll();
  // Intentionally no console noise in the committed worker; the reconstructed
  // set is the return value A1.2 will consume. Kept as a named function so the
  // survival test drives the exact same path the worker runs on wake.
  void sessions;
}

chrome.runtime.onStartup.addListener(() => { void reconstructOnWake(); });
chrome.runtime.onInstalled.addListener(() => { void reconstructOnWake(); });

// Top-level: runs on EVERY worker wake (the real "on restart" hook in MV3,
// since there is no extension-context activate event). This is what makes
// mid-session state survive termination.
void reconstructOnWake();

export { reconstructOnWake, deriveNavigationId };
