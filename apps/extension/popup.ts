/**
 * Popup — a functional diagnostic view of the current tab's verdict. Not a
 * designed UI: tier, score, rules fired, and which modules were unevaluable
 * and why, so the system can be verified end to end.
 */

interface StoredVerdict {
  readonly effectiveTier: string;
  readonly rawTier: string;
  readonly score: number;
  readonly fired: readonly string[];
  readonly unevaluable: readonly { readonly module: string; readonly reason: string }[];
  readonly targetUrl: string;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c));
}

function render(v: StoredVerdict | null): void {
  const el = document.getElementById('content');
  if (el === null) return;
  if (v === null) {
    el.innerHTML = '<span class="muted">No analysis yet for this tab. Reload the page.</span>';
    return;
  }
  const rules = v.fired.length > 0
    ? `<ul>${v.fired.map((r) => `<li><code>${esc(r)}</code></li>`).join('')}</ul>`
    : '<span class="muted">none fired</span>';
  const unev = v.unevaluable.length > 0
    ? `<ul>${v.unevaluable.map((u) => `<li><code>${esc(u.module)}</code> — ${esc(u.reason)}</li>`).join('')}</ul>`
    : '<span class="muted">all modules evaluable</span>';
  el.innerHTML = `
    <div class="row">Tier: <span class="tier ${esc(v.effectiveTier)}">${esc(v.effectiveTier)}</span>
      ${v.effectiveTier !== v.rawTier ? `<span class="muted">(raw ${esc(v.rawTier)})</span>` : ''}</div>
    <div class="row">Score: <strong>${v.score}</strong></div>
    <div class="row">Rules fired: ${rules}</div>
    <div class="row">Unevaluable modules: ${unev}</div>
    <div class="row muted" style="word-break:break-all">${esc(v.targetUrl)}</div>`;
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tabId = tabs[0]?.id;
  if (tabId === undefined) { render(null); return; }
  chrome.storage.session.get(`ssx:verdict:${tabId}`, (data) => {
    const v = data[`ssx:verdict:${tabId}`] as StoredVerdict | undefined;
    render(v ?? null);
  });
});
