/**
 * Tier-2 interstitial / block page (§9.4). This is a chrome-extension:// page the
 * service worker navigates the tab to — NOT a content-script overlay — so a
 * hostile page cannot script, hide, or remove it. It renders from the query
 * params the SW supplied (tier + target + tab), wires the actions back to the SW,
 * and reuses the shared verdict renderer for "View security findings".
 *
 *   Medium (30–59): Proceed anyway · Go back · View security findings.
 *     Proceeding logs the A-01 user-trusted-origin record (SW side); it never
 *     teaches the auth store trust.
 *   High (≥60): hard block. Go back · View security findings only — NO proceed.
 */

import { renderVerdict, type StoredVerdict } from './verdict-view.ts';

const params = new URLSearchParams(location.search);
const tier = params.get('tier') === 'High' ? 'High' : 'Medium';
const tabId = Number(params.get('tab'));
const targetUrl = params.get('target') ?? '';
let host = targetUrl;
try { host = new URL(targetUrl).host; } catch { /* keep raw */ }

const card = document.getElementById('card')!;
const eyebrow = document.getElementById('eyebrow')!;
const headline = document.getElementById('headline')!;
const bodyEl = document.getElementById('body')!;
const actions = document.getElementById('actions')!;
const findings = document.getElementById('findings')!;

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

function goBack(): void {
  chrome.runtime.sendMessage({ type: 'ssx-intervention-goback', tabId });
}

function viewFindings(): void {
  findings.classList.toggle('show');
  if (!findings.classList.contains('show') || findings.dataset['loaded'] === '1') return;
  findings.dataset['loaded'] = '1';
  chrome.storage.session.get(`ssx:verdict:${tabId}`, (data) => {
    renderVerdict(findings, (data[`ssx:verdict:${tabId}`] as StoredVerdict | undefined) ?? null);
  });
}

if (tier === 'High') {
  card.classList.add('block');
  eyebrow.textContent = 'Site blocked';
  headline.textContent = 'This page was blocked for your safety';
  bodyEl.innerHTML = `<p>SecureSphere X judged <span class="host">${host}</span> a high-risk credential-phishing page and blocked it. `
    + `There is no option to continue to this page.</p>`;
  // High: NO proceed path (§9.4 — Block is the only High outcome, no exception).
  actions.append(
    button('Go back to safety', 'primary', goBack),
    button('View security findings', 'ghost', viewFindings),
  );
} else {
  eyebrow.textContent = 'Security warning';
  headline.textContent = 'This page may be trying to steal your credentials';
  bodyEl.innerHTML = `<p>SecureSphere X flagged <span class="host">${host}</span> as a likely credential-phishing page. `
    + `If you did not expect this, go back.</p>`;
  actions.append(
    button('Go back to safety', 'primary', goBack),
    button('View security findings', 'ghost', viewFindings),
    button('Proceed anyway', 'danger', () => {
      chrome.runtime.sendMessage({ type: 'ssx-intervention-proceed', tabId, targetUrl });
    }),
  );
}
