/**
 * Multi-pass session orchestration — the browser-free core of DEC-43's
 * production wiring (Option 1). Splits out of `service-worker.ts` exactly so it
 * is testable under `node --experimental-strip-types` with a fake backend and
 * no browser, the same discipline `session-store.ts` follows.
 *
 * Two pieces:
 *   - `DocumentIndex`: the documentId → (tabId, navigationId) bridge. Populated
 *     from `webNavigation.onCommitted` (a genuine browser event) and rebuilt
 *     from persisted `SessionRecord`s after a worker restart. NEVER from a
 *     page-supplied value — the SW attaches `runtime.MessageSender.documentId`,
 *     which the browser mints per document and page JS cannot forge.
 *   - `runPassInSession`: reads the session's committed `priorPassState`, runs
 *     the engine pass with it threaded, then folds the outcome back at the
 *     pass-commit boundary (DEC-43's binding requirement — `recordCommittedPass`
 *     UNCONDITIONALLY, `recordIntervention` only when an intervention was
 *     presented), atomically per session key.
 */

import type { SecurityEvidence, DownloadContextEvidence } from '../../packages/contracts/evidence.contract.v1';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { AnalysisPassOutcome } from '../../packages/engine/pass.ts';
import { recordCommittedPass, recordIntervention } from '../../packages/engine/stage7-8.ts';
import type { PriorPassState } from '../../packages/engine/stage7-8.ts';
import { SessionStore, sessionKey, SESSION_KEY_PREFIX, type SessionKeyParts } from './session-store.ts';
import { assembleEvidence, type CollectedParts } from './assemble-evidence.ts';

/**
 * documentId → session key. A message's `sender.documentId` is fixed to the
 * document that sent it, so a LATE evidence message from a previous page is
 * still attributed to that page's navigation, never to whatever navigation is
 * current on the tab now. In-memory only; rebuilt on wake via `rebuildFrom`.
 */
export class DocumentIndex {
  readonly #map = new Map<string, SessionKeyParts>();

  /** Record the mapping seen at `onCommitted`. Empty documentId is ignored. */
  record(documentId: string, parts: SessionKeyParts): void {
    if (documentId === '') return;
    this.#map.set(documentId, { tabId: parts.tabId, navigationId: parts.navigationId });
  }

  resolve(documentId: string): SessionKeyParts | null {
    return this.#map.get(documentId) ?? null;
  }

  /** Rebuild after a worker restart from persisted records (each carries its
   *  own documentId). Records with an empty documentId are skipped. */
  rebuildFrom(records: readonly { readonly documentId: string; readonly tabId: number; readonly navigationId: number }[]): void {
    for (const r of records) {
      if (r.documentId !== '') this.#map.set(r.documentId, { tabId: r.tabId, navigationId: r.navigationId });
    }
  }

  /** Drop mappings for a closed tab (paired with `SessionStore.endTabSessions`). */
  forgetTab(tabId: number): void {
    for (const [docId, parts] of this.#map) {
      if (parts.tabId === tabId) this.#map.delete(docId);
    }
  }
}

export interface RunPassInSessionArgs {
  readonly store: SessionStore;
  readonly parts: SessionKeyParts;
  readonly evidence: SecurityEvidence;
  readonly ruleSet: RuleSet;
  readonly storeReader: AuthStoreReader;
  /**
   * Whether Role A presented a user-facing intervention (Warn/Block) for this
   * pass. Structurally `false` today — the Tier-2 gate UI does not exist yet —
   * but the plumbing is real: when it does, this drives `recordIntervention`.
   */
  readonly interventionWasPresented?: boolean;
}

/**
 * One pass, threaded through the persisted session. Returns the engine outcome
 * (the SW still needs it for the verdict/badge). If the session record is
 * missing (unattributed pass), the pass still runs with `prior=null` but nothing
 * is committed back — an unattributable pass must not fabricate or mutate state.
 */
export async function runPassInSession(args: RunPassInSessionArgs): Promise<AnalysisPassOutcome> {
  const record = await args.store.getSession(args.parts);
  const prior = record?.priorPassState ?? null;

  const outcome = await runAnalysisPass(args.evidence, args.ruleSet, args.storeReader, prior);

  if (record !== null) {
    await args.store.recordPassOutcome(args.parts, (latest: PriorPassState | null) => {
      // DEC-43 binding requirement: recordCommittedPass runs on EVERY committed
      // pass, at the commit boundary, independent of intervention. `latest` is
      // re-read inside the store's per-key lock, so a concurrent pass isn't lost.
      let next = recordCommittedPass(latest, outcome.scoring);
      if (args.interventionWasPresented === true) {
        next = recordIntervention(next, outcome.aggregation.effectiveTier);
      }
      return next;
    });
  }

  return outcome;
}

/* ══ DEC-45 — download-triggered re-pass (DEFECT-41 Option A) ═══════════════ */

/**
 * How old cached content-script evidence may be and still be combined with a
 * download event (DEC-45 binding requirement 3). Beyond this the re-pass is
 * SKIPPED — the restrictive, honest direction — rather than treating stale
 * evidence as current.
 *
 * ⚠ PROVISIONAL — PENDING CALIBRATION. 120s is a restrictive first value, not a
 * measured one: a Session is keyed by (tabId, navigationId), so cached evidence
 * for a session PROVES no navigation happened since collection (a navigation is
 * a new session) — this bound only guards intra-page DOM drift on a long-lived
 * page. The in-memory `EvidenceCache` is additionally lost on worker dormancy, a
 * shorter practical cap. No existing constant fit this semantic
 * (`LOGIN_SUCCESS_WINDOW_MS` is the §20.5 nav window, 10s).
 */
export const EVIDENCE_CACHE_MAX_AGE_MS = 120_000;

/** One session's most recent content-script parts + when they were collected. */
export interface CachedEvidence {
  readonly parts: CollectedParts;
  readonly collectedAt: number;
}

/**
 * The most recent content-script `parts` per session, so a download-triggered
 * re-pass can reuse them without a fresh content-script round-trip (DEC-45).
 *
 * IN-MEMORY ONLY, deliberately: it is lost on worker dormancy, which is itself a
 * staleness bound (a download after the SW slept gets no re-pass — the safe
 * direction), and it keeps NO collected evidence in persistent storage. It holds
 * only what the collector produces, which NEVER includes a credential VALUE
 * (§20.2/20.3 — the collector reads field composition and the page title, never
 * an input's value); DEC-45 binding requirement 2, asserted by
 * `download-repass.test.ts`, not assumed by proximity.
 */
export class EvidenceCache {
  readonly #map = new Map<string, CachedEvidence>();

  remember(parts: SessionKeyParts, collected: CollectedParts, at: number): void {
    this.#map.set(sessionKey(parts), { parts: collected, collectedAt: at });
  }

  get(parts: SessionKeyParts): CachedEvidence | null {
    return this.#map.get(sessionKey(parts)) ?? null;
  }

  forget(parts: SessionKeyParts): void {
    this.#map.delete(sessionKey(parts));
  }

  /** Drop every session's cache for a closed tab (paired with tab teardown). */
  forgetTab(tabId: number): void {
    const prefix = `${SESSION_KEY_PREFIX}${tabId}:`;
    for (const k of [...this.#map.keys()]) if (k.startsWith(prefix)) this.#map.delete(k);
  }
}

export interface DownloadRepassArgs {
  readonly store: SessionStore;
  readonly cache: EvidenceCache;
  /** The download tab's CURRENT session (resolved by the SW's tabId→nav map). */
  readonly parts: SessionKeyParts;
  readonly downloadContext: DownloadContextEvidence;
  readonly ruleSet: RuleSet;
  readonly storeReader: AuthStoreReader;
  readonly now: number;
  /** Day stamp for the assembled evidence (the SW passes `today()`). */
  readonly collectedOn: string;
  readonly maxAgeMs?: number;
}

export type DownloadRepassResult =
  | { readonly status: 'ran'; readonly outcome: AnalysisPassOutcome; readonly targetUrl: string }
  | { readonly status: 'skipped'; readonly reason: 'no_session' | 'no_cached_evidence' | 'evidence_stale' };

/**
 * The download-triggered combined re-pass (DEC-45 / Option A). Reuses the
 * session's cached content-script evidence + the fresh download evidence and runs
 * ONE pass through `runPassInSession` — so the SAME per-session `#withKeyLock`
 * serializes it against a concurrent content-script pass (binding requirement 1),
 * and the committed prior state (a primary finding from the page's own pass) is
 * what lets DL-01's `priorFindingActive` conjunct hold. Honest about staleness
 * (binding requirement 3): evidence older than `maxAgeMs` is skipped, never
 * silently combined. Collects nothing new; no evidence is fabricated.
 */
export async function runDownloadRepass(args: DownloadRepassArgs): Promise<DownloadRepassResult> {
  const record = await args.store.getSession(args.parts);
  if (record === null) return { status: 'skipped', reason: 'no_session' };

  const cached = args.cache.get(args.parts);
  if (cached === null) return { status: 'skipped', reason: 'no_cached_evidence' };

  const maxAge = args.maxAgeMs ?? EVIDENCE_CACHE_MAX_AGE_MS;
  if (args.now - cached.collectedAt > maxAge) return { status: 'skipped', reason: 'evidence_stale' };

  const merged: CollectedParts = { ...cached.parts, downloadContext: args.downloadContext };
  const evidence = assembleEvidence(merged, record.targetUrl, args.collectedOn);
  const outcome = await runPassInSession({
    store: args.store, parts: args.parts, evidence, ruleSet: args.ruleSet,
    storeReader: args.storeReader, interventionWasPresented: false,
  });
  return { status: 'ran', outcome, targetUrl: record.targetUrl };
}
