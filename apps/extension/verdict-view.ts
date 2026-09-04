/**
 * The tab-verdict renderer, shared by the diagnostic popup (popup.ts) and the
 * Tier-2 interstitial's "View security findings" section (intervention.ts) — one
 * renderer, not two copies. Pure DOM; no chrome APIs, so the caller supplies the
 * already-read verdict and the element to render into.
 */

export interface StoredVerdict {
  readonly effectiveTier: string;
  readonly rawTier: string;
  readonly score: number;
  readonly fired: readonly string[];
  readonly unevaluable: readonly { readonly module: string; readonly reason: string }[];
  readonly targetUrl: string;
}

export function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c));
}

export function renderVerdict(el: HTMLElement, v: StoredVerdict | null): void {
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
