/**
 * A1.1 — Analysis Session persistence for the MV3 service worker.
 *
 * The whole point of A1.1 is stated in its exit criterion: "Survives worker
 * termination mid-session." An MV3 service worker is killed after ~30s idle
 * and restarted cold on the next event, losing every in-memory variable. But
 * a Session's lifecycle state (Rule Engine §19) — and specifically §11.3's
 * monotonic escalation and §11.4's intervention lock — MUST survive that
 * death: a Session that forgot it had already presented an intervention would
 * silently reopen a block the user was already shown.
 *
 * So the session state does NOT live in a module variable. It lives in
 * chrome.storage.session, written through on every change and reconstructed
 * from scratch whenever the worker wakes. This file is the browser-free core
 * of that mechanism: the state SHAPE, its (de)serialisation, and a store
 * parameterised over an injectable backend, so the survival property is
 * testable under `node --experimental-strip-types` with an in-memory fake and
 * without a browser at all.
 *
 * TYPE REUSE (CLAUDE.md dependency matrix: extension MAY import engine).
 * `PriorPassState` and `TierEscalation` are the ENGINE's own types, imported
 * from `packages/engine/stage7-8.ts`, not copies. `RiskTier` is imported from
 * its real home in `packages/contracts` (stage7-8.ts consumes it but does not
 * re-export it). The extension persists exactly the state the engine reasons
 * about, so a reconstructed Session hands the engine a `PriorPassState` it
 * accepts unchanged.
 */

import type { PriorPassState } from '../../packages/engine/stage7-8';
import type { RiskTier } from '../../packages/contracts/passresult.contract.v1';

/**
 * §3.1 / §11.4: "A new navigation SHALL create a new Session." A Session is
 * therefore keyed by the navigation that created it — (tabId, navigationId) —
 * not by the tab alone, so a later navigation in the same tab is a distinct
 * Session, unaffected by a prior Session's lock.
 */
export interface SessionKeyParts {
  readonly tabId: number;
  readonly navigationId: number;
}

/** The storage key string. Stable and reversible; `:` cannot appear in the
 *  numeric components, so parsing back is unambiguous. */
export function sessionKey(parts: SessionKeyParts): string {
  return `ssx:session:${parts.tabId}:${parts.navigationId}`;
}

export const SESSION_KEY_PREFIX = 'ssx:session:';

/**
 * The highest tier this Session's passes have reached so far. §3.2's tiers
 * (0 navigation-commit, 1 DOM-ready, 2 action-gate) drive WHICH passes run;
 * this records how far the Session has actually progressed, so a reconstructed
 * worker resumes at the right point rather than re-running Tier 0.
 */
export type ReachedTier = 0 | 1 | 2;

/**
 * The persisted Session record. Deliberately minimal for A1.1 — evidence,
 * findings and full pass results are A1.2+; this is the LIFECYCLE spine that
 * must survive a restart. `priorPassState` is the load-bearing field: it is
 * the exact `PriorPassState` the engine's `recordIntervention` /
 * `computeEffectiveTier` produce and consume.
 */
export interface SessionRecord {
  readonly sessionId: string;
  readonly tabId: number;
  readonly navigationId: number;
  /**
   * The browser-minted per-document id from `webNavigation.onCommitted`
   * (`details.documentId`, Chrome 106+). Stored so the SW's documentId→session
   * index can be rebuilt after a worker restart. It is the ONLY value that lets
   * a late evidence message be attributed to the navigation that GENERATED it
   * (via `runtime.MessageSender.documentId`), rather than to whatever navigation
   * is current on the tab at receipt — see service-worker.ts. Never
   * page-supplied. Empty string only for records created before this field
   * existed (backward-compat) or by non-SW callers (tests that don't need it).
   */
  readonly documentId: string;
  readonly targetUrl: string;
  /** Day-granular, per §20.3's temporal-minimisation discipline applied by
   *  convention across the platform. Set once at creation. */
  readonly createdOn: string;
  readonly reachedTier: ReachedTier;
  /**
   * §11.3/§11.4. `null` until an intervention has ever been presented in this
   * Session; thereafter carries the engine's own monotonic state. This is what
   * MUST survive worker death.
   */
  readonly priorPassState: PriorPassState | null;
}

/**
 * The subset of `chrome.storage.session`'s API this store needs, as an
 * interface so a test can inject an in-memory fake. The real adapter
 * (`chromeSessionBackend`) is in `service-worker.ts`; nothing browser-specific
 * appears in this file.
 *
 * Mirrors chrome.storage.StorageArea's Promise-returning shape (MV3).
 */
export interface SessionStorageBackend {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/** Round-trips through JSON exactly as chrome.storage.session does internally,
 *  so the in-memory fake and the real backend cannot diverge on serialisation.
 *  Returns null on any shape it does not recognise — a corrupt or
 *  foreign-version record must not masquerade as a valid Session. */
export function deserializeSession(value: unknown): SessionRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v['sessionId'] !== 'string'
    || typeof v['tabId'] !== 'number'
    || typeof v['navigationId'] !== 'number'
    || typeof v['targetUrl'] !== 'string'
    || typeof v['createdOn'] !== 'string'
    || (v['reachedTier'] !== 0 && v['reachedTier'] !== 1 && v['reachedTier'] !== 2)
  ) {
    return null;
  }
  const prior = deserializePriorPassState(v['priorPassState']);
  // Backward-compatible: a record persisted before documentId existed simply
  // has no attribution key; treat a missing/ill-typed value as '' (the SW's
  // document index skips empty ids). A present value must be a string.
  const documentId = typeof v['documentId'] === 'string' ? v['documentId'] : '';
  return {
    sessionId: v['sessionId'],
    tabId: v['tabId'],
    navigationId: v['navigationId'],
    documentId,
    targetUrl: v['targetUrl'],
    createdOn: v['createdOn'],
    reachedTier: v['reachedTier'],
    priorPassState: prior,
  };
}

function isRiskTier(x: unknown): x is RiskTier {
  return x === 'Low' || x === 'Medium' || x === 'High';
}

/** Validates the engine's `PriorPassState` shape coming back off disk. `null`
 *  is a legitimate value (no intervention yet); an ill-formed object is not
 *  and degrades to null rather than being trusted. */
export function deserializePriorPassState(value: unknown): PriorPassState | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const hit = v['highestInterventionTier'];
  if (!(hit === null || isRiskTier(hit))) return null;
  if (typeof v['interventionPresented'] !== 'boolean') return null;
  // Option C field. Backward-compatible: a state persisted before this field
  // existed simply had no prior primary finding recorded, so a missing value
  // is `false`; a present-but-non-boolean value is ill-formed and rejected.
  const appf = v['anyPriorPrimaryFindingActive'];
  if (appf !== undefined && typeof appf !== 'boolean') return null;
  return {
    highestInterventionTier: hit,
    interventionPresented: v['interventionPresented'],
    anyPriorPrimaryFindingActive: appf === true,
  };
}

/**
 * The persistence-through store. Every mutation writes to the backend before
 * returning, so there is never an in-memory state ahead of what a restart
 * would reconstruct. There is intentionally no in-memory cache: `get` reads the
 * backend every time, which is exactly what proves survival — a cache would let
 * the tests pass while the real worker lost state on wake.
 */
export class SessionStore {
  // Explicit field + assignment, NOT a TS parameter property: Node's
  // strip-only type-stripping (the runtime this repo's tests use) rejects
  // parameter properties, even though tsc accepts them. This is the
  // tsc-passes-but-node-fails gap, avoided at the source.
  readonly #backend: SessionStorageBackend;
  constructor(backend: SessionStorageBackend) {
    this.#backend = backend;
  }

  /**
   * Per-key async serialization. A service worker is single-threaded JS, but
   * `updateSession`/`recordPassOutcome` are read-modify-write across an await
   * (`getSession` → patch → `set`), so two passes landing on the SAME session
   * key close together (Tier 0/1/2) could interleave and lose an update. This
   * chains each mutation for a key behind the previous one. Different keys
   * (different tab/navigation) never contend, so cross-tab passes stay parallel.
   */
  readonly #locks = new Map<string, Promise<unknown>>();
  async #withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.#locks.get(key) ?? Promise.resolve();
    // Chain regardless of the previous op's success/failure, so one rejection
    // cannot wedge the key forever.
    const run = prev.then(() => fn(), () => fn());
    this.#locks.set(key, run);
    try {
      return await run;
    } finally {
      // Only clear if we are still the tail — a newer waiter may have chained on.
      if (this.#locks.get(key) === run) this.#locks.delete(key);
    }
  }

  /** §3.1: create a Session bound to one navigation. Idempotent per key —
   *  re-committing the same navigation does not clobber an advanced Session. */
  async startSession(
    parts: SessionKeyParts, targetUrl: string, createdOn: string, documentId: string = '',
  ): Promise<SessionRecord> {
    const key = sessionKey(parts);
    return this.#withKeyLock(key, async () => {
      const existing = await this.getSession(parts);
      if (existing !== null) return existing;
      const record: SessionRecord = {
        sessionId: key,
        tabId: parts.tabId,
        navigationId: parts.navigationId,
        documentId,
        targetUrl,
        createdOn,
        reachedTier: 0,
        priorPassState: null,
      };
      await this.#backend.set({ [key]: record });
      return record;
    });
  }

  async getSession(parts: SessionKeyParts): Promise<SessionRecord | null> {
    const key = sessionKey(parts);
    const raw = await this.#backend.get(key);
    return deserializeSession(raw[key]);
  }

  /** Applies a partial update and writes it through, atomically per key. Missing
   *  session is a no-op returning null — a Tier 1 event for a navigation whose
   *  commit was never seen must not fabricate a Session. */
  async updateSession(
    parts: SessionKeyParts,
    patch: Partial<Pick<SessionRecord, 'reachedTier' | 'priorPassState'>>,
  ): Promise<SessionRecord | null> {
    return this.#withKeyLock(sessionKey(parts), async () => {
      const current = await this.getSession(parts);
      if (current === null) return null;
      const next: SessionRecord = { ...current, ...patch };
      await this.#backend.set({ [sessionKey(parts)]: next });
      return next;
    });
  }

  /**
   * The pass-commit boundary (DEC-43). Atomically folds one committed pass into
   * this session's `priorPassState` via `reduce`, which the caller builds from
   * `recordCommittedPass` (unconditionally) plus `recordIntervention` (only when
   * an intervention was presented). `reduce` re-reads the LATEST persisted state
   * inside the lock, so a concurrent pass on the same key cannot be lost. Missing
   * session is a no-op returning null — an unattributed pass leaves no residue.
   */
  async recordPassOutcome(
    parts: SessionKeyParts,
    reduce: (prior: PriorPassState | null) => PriorPassState,
  ): Promise<SessionRecord | null> {
    return this.#withKeyLock(sessionKey(parts), async () => {
      const current = await this.getSession(parts);
      if (current === null) return null;
      const next: SessionRecord = { ...current, priorPassState: reduce(current.priorPassState) };
      await this.#backend.set({ [sessionKey(parts)]: next });
      return next;
    });
  }

  async endSession(parts: SessionKeyParts): Promise<void> {
    await this.#withKeyLock(sessionKey(parts), async () => {
      await this.#backend.remove(sessionKey(parts));
    });
  }

  /** Remove every Session record for a tab (all its navigations). Called on
   *  `chrome.tabs.onRemoved` so closed-tab sessions don't linger until the
   *  browser clears `chrome.storage.session`. Returns the removed keys. */
  async endTabSessions(tabId: number): Promise<readonly string[]> {
    const all = await this.#backend.get(null);
    const prefix = `${SESSION_KEY_PREFIX}${tabId}:`;
    const keys = Object.keys(all).filter((k) => k.startsWith(prefix));
    if (keys.length > 0) await this.#backend.remove(keys);
    return keys;
  }

  /**
   * Reconstruct every live Session from the backend. Called at worker wake:
   * this is the operation the exit criterion turns on. Returns only records
   * that deserialise cleanly; a foreign or corrupt entry is skipped, never
   * surfaced as a half-valid Session.
   */
  async reconstructAll(): Promise<SessionRecord[]> {
    const all = await this.#backend.get(null);
    const out: SessionRecord[] = [];
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(SESSION_KEY_PREFIX)) continue;
      const rec = deserializeSession(value);
      if (rec !== null) out.push(rec);
    }
    return out;
  }
}
