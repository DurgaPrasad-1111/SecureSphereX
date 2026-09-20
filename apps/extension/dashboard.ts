/**
 * Dashboard browser glue (v3, authorized 2026-09-19; NEW this session). Thin: it
 * reads already-stored data and calls the tested pure renderers in
 * dashboard-model.ts. No evidence is collected here and NO score is shown.
 *
 *   - Right now: the focused tab's verdict, read from ssx:verdict:<tabId>
 *     (chrome.storage.session), updated live on tab switch / navigation /
 *     re-analysis. Reuses existing verdict data — no new collection.
 *   - History: IncidentHistory (chrome.storage.local), newest first; Clear all.
 *   - Saved sites: AuthStore.listEntries() (read-only) with per-row Forget
 *     (AuthStoreUserControl.deleteEntry) — an existing store, a new view.
 *   - Techniques: static reference cards.
 */

import { AuthStore, chromeAuthBackend } from './auth-store.ts';
import { IncidentHistory, type IncidentStorageBackend } from './incident-history.ts';
import {
  renderRightNow, renderIncidents, renderSavedSites, renderTechniqueCards,
  rightNowForTab, nextFocusedTab, pickInitialRealTab,
} from './dashboard-model.ts';
import type { StoredVerdict } from './verdict-view.ts';
import { toOrigin } from '../../packages/contracts/evidence.contract.v1.ts';

const localBackend: IncidentStorageBackend = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};
const authStore = new AuthStore({ backend: chromeAuthBackend(), isPrivateContext: false });
const incidents = new IncidentHistory({ backend: localBackend });

const INCIDENTS_CHANGED_KEY = 'ssx:incidents';
const VERDICT_PREFIX = 'ssx:verdict:';
/** The last-focused REAL (non-dashboard) tab whose status Right Now shows. */
let focusedTabId: number | null = null;
/** This dashboard's own tab id — excluded from Right Now entirely. */
let ownTabId: number | null = null;

function verdictKey(tabId: number): string { return `${VERDICT_PREFIX}${tabId}`; }
function el(id: string): HTMLElement { return document.getElementById(id)!; }

async function readVerdict(tabId: number): Promise<StoredVerdict | undefined> {
  const got = await chrome.storage.session.get(verdictKey(tabId));
  return got[verdictKey(tabId)] as StoredVerdict | undefined;
}

async function refreshRightNow(): Promise<void> {
  const map: Record<number, StoredVerdict | undefined> = {};
  if (focusedTabId !== null) map[focusedTabId] = await readVerdict(focusedTabId);
  el('rightnow').innerHTML = renderRightNow(rightNowForTab(map, focusedTabId));
}
async function refreshIncidents(): Promise<void> {
  el('incidents').innerHTML = renderIncidents(await incidents.list());
}
async function refreshSaved(): Promise<void> {
  el('saved').innerHTML = renderSavedSites(await authStore.listEntries());
}

/* static + initial paint */
el('techniques').innerHTML = renderTechniqueCards();
void refreshIncidents();
void refreshSaved();

/* Seed Right Now from the most-recently-focused REAL tab (not the dashboard tab
 * that is literally active now), so it shows a real page's status immediately.
 * A tab "has a verdict" iff the SW analysed it — that is our proxy for a real
 * http/https page, since tab URLs are not readable without host permissions. */
async function seedRightNow(): Promise<void> {
  ownTabId = (await chrome.tabs.getCurrent())?.id ?? null;
  const [tabs, sess] = await Promise.all([chrome.tabs.query({}), chrome.storage.session.get(null)]);
  const verdictTabIds = new Set(
    Object.keys(sess)
      .filter((k) => k.startsWith(VERDICT_PREFIX))
      .map((k) => Number(k.slice(VERDICT_PREFIX.length)))
      .filter((n) => !Number.isNaN(n)),
  );
  focusedTabId = pickInitialRealTab(tabs, ownTabId, (id) => verdictTabIds.has(id));
  await refreshRightNow();
}
void seedRightNow();

/* live focused-tab tracking — the dashboard's own tab is ignored, so switching
 * to it keeps the last real tab's status on screen (tabId is enough; the verdict
 * carries its own URL). */
chrome.tabs.onActivated.addListener((info) => {
  focusedTabId = nextFocusedTab(focusedTabId, info.tabId, ownTabId);
  void refreshRightNow();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId !== ownTabId && tabId === focusedTabId && (changeInfo.status === 'complete' || changeInfo.url !== undefined)) void refreshRightNow();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && focusedTabId !== null && changes[verdictKey(focusedTabId)]) void refreshRightNow();
  if (area === 'local' && changes[INCIDENTS_CHANGED_KEY]) void refreshIncidents();
});

/* controls */
el('clear-history').addEventListener('click', () => { void incidents.clearAll().then(refreshIncidents); });
el('saved').addEventListener('click', (e) => {
  const t = e.target;
  if (t instanceof HTMLElement && t.classList.contains('del')) {
    const raw = t.getAttribute('data-origin');
    const origin = raw === null ? null : toOrigin(raw); // validate, never an unchecked cast (G-2)
    if (origin !== null) void authStore.deleteEntry(origin).then(refreshSaved);
  }
});
