/**
 * Dashboard view-model — the browser-free, pure core of the v3 dashboard
 * (authorized 2026-09-19; NEW this session, not pre-existing repo state). Every
 * function here takes already-read data and returns a plain view object or an
 * HTML string; no chrome APIs, no DOM, no evidence collection. `dashboard.ts` is
 * the thin browser glue that feeds these functions real data and mounts the HTML.
 *
 * NO SCORE ANYWHERE (design-of-record): nothing here reads or renders the numeric
 * 0–100 score. Verdicts are shown as a tier LABEL plus the human-readable names of
 * the techniques that fired. `dashboard-model.test.ts` asserts the rendered HTML
 * contains no score.
 *
 * The per-rule copy in RULE_INFO is authored THIS session for the technique cards
 * and the fired-technique labels, grounded in each rule's own `rationale` in
 * rules-v0.1.0.json — it is new dashboard content, not a pre-existing reference doc.
 */

import { esc, type StoredVerdict } from './verdict-view.ts';
import type { AuthStoreEntrySummary } from '../../packages/contracts/boundary.interfaces.v1.ts';
import type { Incident } from './incident-history.ts';

export interface RuleInfo { readonly name: string; readonly catches: string; }

/** The 11 rules, user-facing. Names match rules-v0.1.0.json; `catches` is new
 *  plain-language copy for this dashboard, grounded in each rule's rationale. */
export const RULE_INFO: Readonly<Record<string, RuleInfo>> = {
  'CRED-01': { name: 'Off-origin credential post', catches: 'A login form that sends your username and password to a different site than the one you are visiting — the classic shape of credential theft.' },
  'CRED-02': { name: 'Unfamiliar impersonation', catches: 'A page that looks like one you have really signed in to before, but on a domain where you never have — a look-alike of a site you trust.' },
  'CRED-03': { name: 'Deceptive identity with credential collection', catches: 'A web address built from look-alike characters (e.g. Latin mixed with Cyrillic) that also asks for your credentials — visual domain spoofing with a login attached.' },
  'CRED-04': { name: 'Laundered arrival', catches: 'A login page reached only after being bounced through a chain of unrelated sites — a common way to hide a phishing destination behind a trusted-looking link.' },
  'CRED-05': { name: 'Script-mediated credential exfiltration', catches: 'Credentials taken by page scripts and sent off-site without a normal form submission — the exfiltration path a plain form check cannot see.' },
  'CRED-06': { name: 'Cleartext credential collection', catches: 'A page collecting credentials over an unencrypted (http) connection, exposing them in transit no matter the site’s intent.' },
  'CRED-07': { name: 'Concealed credential collection', catches: 'A credential field that is hidden or has autocomplete disabled AND submits off-site — concealment combined with an off-site destination.' },
  'CRED-A1': { name: 'Injected credential interface', catches: 'A login interface inserted into the page by script after it loaded, rather than served with the page — corroborates other credential-theft signals.' },
  'DL-01': { name: 'Suspicious executable delivery', catches: 'An executable download served cross-site from a page that was already flagged — routine downloads are not flagged; a flagged context is required.' },
  'DL-02': { name: 'Deceptive file typing', catches: 'A download whose real type is disguised (e.g. a compound extension like invoice.pdf.exe, or a type/MIME mismatch), corroborating a suspicious delivery.' },
  'PM-01': { name: 'Unsolicited sensitive permission', catches: 'A sensitive browser permission requested without you initiating it, on a page reached indirectly or only just loaded.' },
};

export interface TechniqueCard { readonly id: string; readonly name: string; readonly catches: string; }
/** Static technique reference — one card per rule, stable order. */
export const TECHNIQUE_CARDS: readonly TechniqueCard[] =
  Object.entries(RULE_INFO).map(([id, info]) => ({ id, name: info.name, catches: info.catches }));

/** Friendly, score-free label for a tier. */
export function tierLabel(tier: string): string {
  return tier === 'High' ? 'Danger' : tier === 'Medium' ? 'Caution' : 'Safe';
}
export function ruleName(id: string): string { return RULE_INFO[id]?.name ?? id; }

/** Display host for a URL (may be an IP literal); '' if unparseable. */
export function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return ''; }
}

function firedList(fired: readonly string[]): string {
  if (fired.length === 0) return '<p class="none">No phishing techniques detected on this page.</p>';
  return `<ul class="techniques">${fired.map((id) =>
    `<li><span class="tname">${esc(ruleName(id))}</span> <span class="rid">${esc(id)}</span></li>`).join('')}</ul>`;
}

/* ── Right Now strip: the currently focused tab's verdict, NO score ────────── */

/** The verdict to show for the currently focused tab. `dashboard.ts` updates the
 *  focused tab id on `chrome.tabs.onActivated`; this resolves it to a verdict (or
 *  null — e.g. the dashboard's own tab, which has none). Pure, so a tab switch is
 *  testable as a sequence of calls. */
export function rightNowForTab(
  verdictByTab: Readonly<Record<number, StoredVerdict | undefined>>, focusedTabId: number | null,
): StoredVerdict | null {
  if (focusedTabId === null) return null;
  return verdictByTab[focusedTabId] ?? null;
}

export function renderRightNow(v: StoredVerdict | null): string {
  if (v === null) {
    return '<div class="rn-empty">No analysed page in focus. Open or switch to a website to see its live status here.</div>';
  }
  const tier = v.effectiveTier;
  const host = hostOf(v.targetUrl);
  return `
    <div class="rn tier-${esc(tier)}">
      <div class="rn-head">
        <span class="badge tier-${esc(tier)}">${esc(tierLabel(tier))}</span>
        <span class="rn-host" title="${esc(v.targetUrl)}">${esc(host || v.targetUrl)}</span>
      </div>
      ${firedList(v.fired)}
    </div>`;
}

/* ── Incident History list, newest first, NO score ─────────────────────────── */
export function fmtTime(at: number): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}
export function renderIncidents(incidents: readonly Incident[]): string {
  if (incidents.length === 0) {
    return '<div class="empty">No history yet. Pages you visit will be recorded here (kept for 30 days).</div>';
  }
  return `<table class="incidents"><thead><tr><th>When</th><th>Site</th><th>Status</th><th>Techniques</th></tr></thead><tbody>${
    incidents.map((i) => `<tr class="tier-${esc(i.tier)}">
      <td class="when">${esc(fmtTime(i.at))}</td>
      <td class="site" title="${esc(i.url)}">${esc(i.domain || i.url)}</td>
      <td><span class="badge tier-${esc(i.tier)}">${esc(tierLabel(i.tier))}</span></td>
      <td>${i.fired.length === 0 ? '<span class="none">—</span>' : i.fired.map((r) => `<span class="rid" title="${esc(ruleName(r))}">${esc(r)}</span>`).join(' ')}</td>
    </tr>`).join('')
  }</tbody></table>`;
}

/* ── Saved Sites: read-only render of AuthStore entries, NO score ──────────── */
export function renderSavedSites(entries: readonly AuthStoreEntrySummary[]): string {
  if (entries.length === 0) {
    return '<div class="empty">No saved sites yet. Sites you successfully sign in to are remembered here so impersonations elsewhere can be caught.</div>';
  }
  return `<table class="saved"><thead><tr><th>Site</th><th>Status</th><th>Sign-ins</th><th>First seen</th><th>Last seen</th><th></th></tr></thead><tbody>${
    entries.map((e) => `<tr>
      <td class="site">${esc(e.origin)}</td>
      <td><span class="state ${esc(e.lifecycleState)}">${esc(e.lifecycleState === 'ESTABLISHED' ? 'Established' : 'Provisional')}</span></td>
      <td>${e.successfulAuthCount}</td>
      <td>${esc(e.firstSeenOn)}</td>
      <td>${esc(e.lastSeenOn)}</td>
      <td><button class="del" data-origin="${esc(e.origin)}">Forget</button></td>
    </tr>`).join('')
  }</tbody></table>`;
}

/* ── Technique reference cards (static) ────────────────────────────────────── */
export function renderTechniqueCards(): string {
  return `<div class="cards">${TECHNIQUE_CARDS.map((c) => `
    <div class="card">
      <div class="card-head"><span class="tname">${esc(c.name)}</span><span class="rid">${esc(c.id)}</span></div>
      <p>${esc(c.catches)}</p>
    </div>`).join('')}</div>`;
}
