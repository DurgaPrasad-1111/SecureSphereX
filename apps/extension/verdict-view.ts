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

/**
 * Choose which stored verdict the Tier-2 intervention page may show — and NEVER
 * a different page's verdict (DEFECT-50). The per-tab "latest verdict"
 * (`ssx:verdict:<tab>`) is racy: a later same-tab navigation — in the live demo
 * a `google.com/search/warmup.html` prefetch — overwrites it, so the block page
 * for page X was reading page Y's Low/0 verdict.
 *
 * `elevated` is the intervention-time snapshot (`ssx:intervention-verdict:<tab>`),
 * written ONLY by an intervening Medium/High pass, so a Low prefetch cannot clobber
 * it. `tabLatest` is the racy key, kept only as a fallback. EITHER is accepted only
 * when its `targetUrl` equals the page that triggered the intervention; otherwise
 * `null` (the empty state) — the page shows "no matching findings" rather than a
 * stale/wrong verdict. The targetUrl match is the regression guard.
 */
export function selectInterventionVerdict(
  targetUrl: string,
  elevated: StoredVerdict | null,
  tabLatest: StoredVerdict | null,
): StoredVerdict | null {
  if (elevated !== null && elevated.targetUrl === targetUrl) return elevated;
  if (tabLatest !== null && tabLatest.targetUrl === targetUrl) return tabLatest;
  return null;
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
