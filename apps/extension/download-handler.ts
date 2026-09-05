/**
 * DEFECT-43 / DEFECT-44 — the browser-free core of the DL download path, split
 * out of `service-worker.ts` exactly so it is testable under
 * `node --experimental-strip-types` with in-memory fakes and no browser (the same
 * discipline `session-pass.ts` follows). `service-worker.ts` builds a real
 * `DownloadEnv` from chrome APIs and wires the three listeners to these handlers.
 *
 * The tab-scoping the whole DL family rests on lives here:
 *   - onCreated stores the record under `downloadKey(tabId)` and remembers
 *     `downloadTabKey(downloadId) -> tabId` (onChanged carries no tabId).
 *   - onChanged resolves the tab via that map and updates the SAME record.
 *   - a later same-tab navigation merges the stored record via
 *     `mergeStoredDownloadContext(tabId)`.
 *
 * Two firing paths, deliberately:
 *   A) the IMMEDIATE re-pass (`triggerDownloadRepass`) — reuses the session's
 *      cached content-script evidence; best-effort, since that cache is in-memory
 *      and lost on SW dormancy / bounded by `EVIDENCE_CACHE_MAX_AGE_MS`.
 *   B) the NAVIGATION merge — the RELIABLE path: it reads the persisted download
 *      record (with the onChanged-confirmed filename) into the next same-tab
 *      content-script pass, using fresh page evidence, so it does NOT depend on
 *      the ephemeral cache. This is what guarantees DL-02 lands in the verdict a
 *      same-tab Save-As after the filename confirms.
 */

import type { SessionStorageBackend, SessionKeyParts } from './session-store.ts';
import { SessionStore } from './session-store.ts';
import { EvidenceCache, runDownloadRepass } from './session-pass.ts';
import {
  computeDownloadContextEvidence, downloadKey, downloadTabKey,
  provisionalExtensionFromUrl, applyFilenameConfirmation, type DownloadRecord,
} from './download-context.ts';
import { type CollectedParts } from './assemble-evidence.ts';
import type { AnalysisPassOutcome } from '../../packages/engine/pass.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1.ts';
import type { RiskTier } from '../../packages/contracts/passresult.contract.v1.ts';

/** Structural view of a `chrome.downloads.DownloadItem` (onCreated). */
export interface DownloadCreatedItem {
  readonly id: number;
  readonly url: string;
  readonly filename: string;
  readonly mime: string;
  readonly referrer: string;
}
/** Structural view of a `chrome.downloads.DownloadDelta` (onChanged). */
export interface DownloadChangedDelta {
  readonly id: number;
  readonly filename?: { readonly current?: string };
}

/** The persisted verdict shape the popup + interstitial read (`ssx:verdict:<tab>`). */
export interface StoredVerdict {
  readonly effectiveTier: RiskTier;
  readonly rawTier: RiskTier;
  readonly score: number;
  readonly fired: readonly string[];
  readonly unevaluable: readonly { readonly module: string; readonly reason: string }[];
  readonly targetUrl: string;
}

/** Everything the download path needs, with the browser bits injected so the
 *  whole path is exercisable without chrome. */
export interface DownloadEnv {
  readonly storage: SessionStorageBackend;
  readonly store: SessionStore;
  readonly cache: EvidenceCache;
  readonly authStore: AuthStoreReader;
  readonly loadRuleSet: () => Promise<RuleSet>;
  readonly tabToNav: Map<number, number>;
  readonly now: () => number;
  readonly today: () => string;
  /** `chrome.tabs.query({active,currentWindow})` -> the focused tab's id, or
   *  undefined when not confidently attributable. */
  readonly queryActiveTabId: () => Promise<number | undefined>;
  /** Persist the verdict + reflect the badge (SW: storage + chrome.action). */
  readonly applyOutcome: (tabId: number, targetUrl: string, outcome: AnalysisPassOutcome) => Promise<void>;
  /** §9.4 Tier-2 gate (SW: chrome.tabs.update to the interstitial). */
  readonly maybeIntervene: (tabId: number, sessionParts: SessionKeyParts | null, targetUrl: string, tier: RiskTier) => Promise<void>;
  /** Optional log sink (defaults to console); lets a test capture the trail. */
  readonly log?: (msg: string) => void;
}

function log(env: DownloadEnv, msg: string): void {
  (env.log ?? ((m: string) => console.info(m)))(msg);
}

/** Pure verdict projection shared by the content-script pass and the re-pass. */
export function buildVerdict(outcome: AnalysisPassOutcome, targetUrl: string): StoredVerdict {
  return {
    effectiveTier: outcome.aggregation.effectiveTier,
    rawTier: outcome.aggregation.rawTier,
    score: outcome.aggregation.score,
    fired: outcome.findings.map((f) => f.ruleId),
    unevaluable: Object.entries(outcome.evaluations)
      .filter(([, e]) => e.result.status === 'unevaluable')
      .map(([module, e]) => ({ module, reason: e.result.status === 'unevaluable' ? e.result.reason : '' })),
    targetUrl,
  };
}

/**
 * NAVIGATION-MERGE tab-scoping (path B): fold this tab's persisted download
 * record (if any) into a fresh content-script pass's parts. Reads
 * `downloadKey(tabId)` — the same key onCreated/onChanged write — so the
 * confirmed-filename record raised by onChanged is what the next same-tab pass
 * evaluates, with no dependence on the in-memory evidence cache.
 */
export async function mergeStoredDownloadContext(
  env: DownloadEnv, tabId: number, parts: CollectedParts,
): Promise<CollectedParts> {
  const dk = downloadKey(tabId);
  const got = await env.storage.get(dk);
  const dlRec = got[dk] as DownloadRecord | undefined;
  if (dlRec === undefined) return parts;
  return { ...parts, downloadContext: computeDownloadContextEvidence(dlRec) };
}

/**
 * IMMEDIATE re-pass (path A, DEC-45): a combined re-pass for the tab's CURRENT
 * session, reusing cached content-script evidence + this download. Best-effort —
 * skips honestly (logged) when there is no current navigation, no session, no
 * cached evidence, or the evidence is stale. Path B (the next navigation) is the
 * reliable guarantee when A skips.
 */
export async function triggerDownloadRepass(env: DownloadEnv, tabId: number, rec: DownloadRecord): Promise<void> {
  const navId = env.tabToNav.get(tabId);
  if (navId === undefined) {
    log(env, `SSX download re-pass skipped (no current navigation for tab ${tabId}) — will fire on the next same-tab navigation`);
    return;
  }
  const ruleSet = await env.loadRuleSet();
  const result = await runDownloadRepass({
    store: env.store, cache: env.cache, parts: { tabId, navigationId: navId },
    downloadContext: computeDownloadContextEvidence(rec),
    ruleSet, storeReader: env.authStore, now: env.now(), collectedOn: env.today(),
  });
  if (result.status === 'ran') {
    await env.applyOutcome(tabId, result.targetUrl, result.outcome);
    await env.maybeIntervene(tabId, { tabId, navigationId: navId }, result.targetUrl, result.outcome.aggregation.effectiveTier);
  } else {
    log(env, `SSX download re-pass skipped (${result.reason}) for tab ${tabId} — will fire on the next same-tab navigation (merges the persisted record, cache-independent)`);
  }
}

/**
 * downloads.onCreated: attribute to the focused tab, store the record +
 * downloadId->tabId map, and kick a best-effort immediate re-pass. A "Save link
 * as" arrives with filename==='' (Chrome assigns it later, via onChanged); an
 * auto-download arrives named.
 */
export async function handleDownloadCreated(env: DownloadEnv, item: DownloadCreatedItem): Promise<void> {
  const tabId = await env.queryActiveTabId();
  if (tabId === undefined) {
    log(env, 'SSX download ignored — no confidently attributable active tab (nothing stored, no re-pass)');
    return;
  }
  const rec: DownloadRecord = {
    url: item.url, filename: item.filename, mime: item.mime,
    referrer: item.referrer, observedAt: env.now(),
    filenameConfirmed: item.filename !== '',
  };
  // Both writes MUST land before any onChanged for this id can resolve — persisted
  // so they survive SW dormancy between onCreated and the Save-As dialog choice.
  await env.storage.set({ [downloadKey(tabId)]: rec });
  await env.storage.set({ [downloadTabKey(item.id)]: tabId });

  if (!rec.filenameConfirmed) {
    const prov = provisionalExtensionFromUrl(item.url);
    log(env, `SSX download provisional (filename not yet confirmed) tab=${tabId} `
      + `url-derived name="${prov.filenameFromUrl}" compoundExt=${prov.hasCompoundExtension} `
      + '— non-authoritative, awaiting downloads.onChanged');
  }
  await triggerDownloadRepass(env, tabId, rec);
}

/**
 * downloads.onChanged: on a genuine filename confirmation, resolve the tab via
 * the persisted downloadId->tabId map, update the SAME record with the confirmed
 * filename, and kick a best-effort re-pass. Idempotent (applyFilenameConfirmation
 * + one-shot map removal), so it acts ONCE per meaningful confirmation, never on
 * the progress/state deltas onChanged also emits. Whether or not the immediate
 * re-pass fires, the updated persisted record guarantees the next same-tab
 * navigation raises DL-02 (path B).
 */
export async function handleDownloadChanged(env: DownloadEnv, delta: DownloadChangedDelta): Promise<void> {
  const confirmed = delta.filename?.current;
  if (confirmed === undefined || confirmed === '') return; // only filename-confirmation deltas
  const mapKey = downloadTabKey(delta.id);
  const mapGot = await env.storage.get(mapKey);
  const tabId = mapGot[mapKey] as number | undefined;
  if (tabId === undefined) return;                          // not one of our attributed downloads
  const dk = downloadKey(tabId);
  const storedGot = await env.storage.get(dk);
  const stored = storedGot[dk] as DownloadRecord | undefined;
  if (stored === undefined) return;                         // record already gone (tab closed / superseded)
  const { rec, changed } = applyFilenameConfirmation(stored, confirmed);
  if (!changed) return;                                     // idempotent: already confirmed this exact filename
  await env.storage.set({ [dk]: rec });
  await env.storage.remove(mapKey);                         // one-shot: the filename is now confirmed
  log(env, `SSX download filename confirmed tab=${tabId} filename="${rec.filename}" `
    + '— persisted; re-running combined re-pass (a same-tab navigation will also raise it)');
  await triggerDownloadRepass(env, tabId, rec);
}
