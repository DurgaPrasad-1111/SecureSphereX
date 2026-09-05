/**
 * downloadContext producer (DL-01, DL-02) — DEFECT-38 fix.
 *
 * A `chrome.downloads.onCreated` record, scoped to the tab that had focus at
 * event time, becomes DownloadContextEvidence. The scoping and its honesty
 * boundary live in service-worker.ts (the listener); this file is the pure
 * NavigationRecord->Evidence producer, same shape as redirect-observer.ts.
 *
 * ⚠️ SCOPING IS A HEURISTIC, BOUNDED HONESTLY. `DownloadItem` carries no tabId
 * (re-verified against current Chrome docs, 2026-09-03). The listener attributes
 * a download to `chrome.tabs.query({active:true,currentWindow:true})` at the
 * moment onCreated fires. When that is confident (an active tab exists), the
 * download is that tab's; when it is NOT (no active tab, background-triggered),
 * NOTHING is stored, this producer is never called for that tab, and the
 * assembler's stub yields notCollected -> the module is unevaluable. The old
 * global last-write-wins key (DEFECT-38) is never a fallback — "a reason, never
 * a silent guess", the same standard every other module holds.
 *
 * PSL derivation uses the shared packages/engine/psl.ts resolver — no
 * exceptions, the same V-15-gated path url/loginInterface/redirect use.
 *
 * S-9: DL is in-browser-only; the harness never produces this. No corpus path.
 */

import {
  present, absent, notCollected,
  type DownloadContextEvidence, type Observation,
} from '../../packages/contracts/evidence.contract.v1.ts';
import { registrableDomainOf } from '../../packages/engine/psl.ts';

const nc = <T>(): Observation<T> => notCollected<T>('api_unavailable');

/** What the (tab-scoped) onCreated listener stores per tab. */
export interface DownloadRecord {
  readonly url: string;
  readonly filename: string;
  readonly mime: string;
  readonly referrer: string;
  readonly observedAt: number;
  /**
   * DEFECT-43 traceability marker: is `filename` the browser-CONFIRMED name
   * (present at onCreated for an auto-download, or supplied later by
   * downloads.onChanged for a "Save link as"), or is `filename` still empty and
   * the record only provisional? Optional for back-compat; when absent, a
   * non-empty `filename` is treated as confirmed. The filename-derived
   * fields (declaredExtension/hasCompoundExtension) are only authoritative when
   * this is true — see `provisionalExtensionFromUrl` for why a URL path is not.
   */
  readonly filenameConfirmed?: boolean;
}

export function downloadKey(tabId: number): string {
  return `ssx:download:${tabId}`;
}

/**
 * DEFECT-43: maps a browser download id -> the tab it was attributed to at
 * onCreated. downloads.onChanged carries the download id but NO tabId, so this
 * is how a late filename-confirmation is routed back to the right tab's record.
 * Persisted in session storage (not in-memory) so it survives SW dormancy
 * between onCreated and the user's Save-As dialog choice.
 */
export function downloadTabKey(downloadId: number): string {
  return `ssx:dl-tab:${downloadId}`;
}

/** Registrable domain as an Observation, mirroring url.ts: no URL -> absent
 *  (no eTLD+1 / IP literal / unparseable). */
function domainOf(url: string): Observation<string> {
  if (url === '') return absent<string>();
  const rd = registrableDomainOf(url);
  return rd === null ? absent<string>() : present(rd);
}

/** The declared extension: the final dot-segment of the filename, lowercased.
 *  `installer.exe` -> `exe`; `archive.tar.gz` -> `gz`; `noext` -> absent. */
function declaredExtensionOf(filename: string): Observation<string> {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const m = /\.([A-Za-z0-9]+)$/.exec(base);
  return m ? present(m[1]!.toLowerCase()) : absent<string>();
}

/**
 * Compound extension: two or more extension-like dot-segments where a
 * non-final one looks like a document type and the final one is different —
 * the `invoice.pdf.exe` disguise. Not merely "two dots" (version strings like
 * `app-1.2.3` are not compound extensions), so the penultimate segment must be
 * a short alpha token.
 */
function hasCompoundExtension(filename: string): boolean {
  const base = (filename.split(/[\\/]/).pop() ?? filename).toLowerCase();
  const parts = base.split('.');
  if (parts.length < 3) return false;
  const penultimate = parts[parts.length - 2]!;
  const final = parts[parts.length - 1]!;
  // penultimate must be a plausible document/type token (2-4 alpha chars) and
  // differ from the final extension.
  return /^[a-z]{2,4}$/.test(penultimate) && /^[a-z0-9]{1,4}$/.test(final) && penultimate !== final;
}

/**
 * Build DownloadContextEvidence from a tab-scoped record.
 *
 * `referrerUrl` follows the module's own convention: a referrer present ->
 * present(url); genuinely no referrer (direct download) -> absent() (NOT
 * notCollected — the producer looked, there was none), which the module reads
 * as referrerPresent=false. Only a true capability gap is notCollected, and
 * that path is handled by the assembler stub, not here.
 */
export function computeDownloadContextEvidence(rec: DownloadRecord): DownloadContextEvidence {
  const hasReferrer = rec.referrer !== '';
  return {
    downloadUrl: rec.url === '' ? nc<string>() : present(rec.url),
    downloadRegistrableDomain: domainOf(rec.url),
    referrerUrl: hasReferrer ? present(rec.referrer) : absent<string>(),
    referrerRegistrableDomain: hasReferrer ? domainOf(rec.referrer) : absent<string>(),
    declaredFilename: rec.filename === '' ? absent<string>() : present(rec.filename),
    declaredExtension: declaredExtensionOf(rec.filename),
    declaredMimeType: rec.mime === '' ? absent<string>() : present(rec.mime),
    hasCompoundExtension: present(hasCompoundExtension(rec.filename)),
  };
}

/* ══ DEFECT-43 — late-filename handling for "Save link as" downloads ═════════ */

/** The last non-empty path segment of a URL, decoded — a filename-like string.
 *  Empty for an unparseable URL or a URL with no path segment. */
function filenamePathSegment(url: string): string {
  let pathname: string;
  try { pathname = new URL(url).pathname; } catch { return ''; }
  const seg = pathname.split('/').filter((s) => s !== '').pop() ?? '';
  try { return decodeURIComponent(seg); } catch { return seg; }
}

/**
 * A provisional extension read from the download URL's path, for the window
 * before the browser assigns a real filename (a "Save link as" download fires
 * onCreated with filename===''). It is DELIBERATELY NON-AUTHORITATIVE and is
 * never emitted into DownloadContextEvidence: a URL path is spoofable and
 * routinely diverges from the name that lands on disk (Content-Disposition, a
 * server redirect, the user renaming in the Save-As dialog). It exists for
 * defense-in-depth traceability — logged/recorded so the provisional state is
 * visible — while the CONFIRMED filename (via downloads.onChanged) is the only
 * thing that fires DL-01/DL-02. Treating the URL as equally authoritative would
 * make a rule fire just because a URL "looked" suspicious.
 */
export interface ProvisionalUrlExtension {
  readonly filenameFromUrl: string;
  readonly declaredExtension: string | null;
  readonly hasCompoundExtension: boolean;
}
export function provisionalExtensionFromUrl(url: string): ProvisionalUrlExtension {
  const filenameFromUrl = filenamePathSegment(url);
  const ext = declaredExtensionOf(filenameFromUrl);
  return {
    filenameFromUrl,
    declaredExtension: ext.state === 'present' ? ext.value : null,
    hasCompoundExtension: hasCompoundExtension(filenameFromUrl),
  };
}

/**
 * Fold a browser-CONFIRMED filename (from downloads.onChanged's
 * `delta.filename.current`) into a stored record. Idempotent: returns
 * `changed:false` when there is nothing new to confirm — an empty name, or a
 * record that already carries this exact confirmed filename — so a caller
 * re-runs the download re-pass ONLY on a meaningful filename-confirmation event,
 * never on every progress/state delta onChanged emits.
 */
export function applyFilenameConfirmation(
  rec: DownloadRecord, confirmedFilename: string,
): { readonly rec: DownloadRecord; readonly changed: boolean } {
  if (confirmedFilename === '') return { rec, changed: false };
  if (rec.filenameConfirmed === true && rec.filename === confirmedFilename) {
    return { rec, changed: false };
  }
  return { rec: { ...rec, filename: confirmedFilename, filenameConfirmed: true }, changed: true };
}
