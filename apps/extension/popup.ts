/**
 * Popup — a functional diagnostic view of the current tab's verdict. Not a
 * designed UI: tier, score, rules fired, and which modules were unevaluable
 * and why, so the system can be verified end to end. The rendering itself lives
 * in verdict-view.ts, shared with the Tier-2 interstitial (not duplicated).
 */

import { renderVerdict, type StoredVerdict } from './verdict-view.ts';

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const el = document.getElementById('content');
  if (el === null) return;
  const tabId = tabs[0]?.id;
  if (tabId === undefined) { renderVerdict(el, null); return; }
  chrome.storage.session.get(`ssx:verdict:${tabId}`, (data) => {
    const v = data[`ssx:verdict:${tabId}`] as StoredVerdict | undefined;
    renderVerdict(el, v ?? null);
  });
});
