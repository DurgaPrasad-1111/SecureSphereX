/**
 * Incident History — the dashboard's persistent record of every analysis verdict,
 * NEW this session (dashboard v3, authorized 2026-09-19; not pre-existing repo
 * state). Browser-free core with an injected storage backend + injectable clock,
 * the same seam AuthStore/SessionStore use, so it is testable under
 * `node --experimental-strip-types` with an in-memory fake and no browser.
 *
 * WHY chrome.storage.local, NOT .session (design-of-record, this build): the
 * retention promise is 30 days, and `chrome.storage.session` is cleared on every
 * browser restart — persisting incidents there would silently break the promise.
 * `.local` survives restarts (it is what AuthStore already uses for its
 * multi-day lifecycle). The service worker plugs the real `chrome.storage.local`
 * in; tests plug an in-memory map.
 *
 * FULL HISTORY (design-of-record, this build): an incident is recorded on EVERY
 * verdict, including Safe (Low), so the history is a complete visit log rather
 * than an alarms-only feed.
 *
 * NO SCORE (design-of-record, this build): an incident stores the tier LABEL
 * (Low/Medium/High) and which rules fired — never the numeric 0–100 score. The
 * score is deliberately absent from the record, not merely hidden at render time.
 */

export interface IncidentStorageBackend {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export type IncidentTier = 'Low' | 'Medium' | 'High';

export interface Incident {
  readonly id: string;
  readonly at: number;                 // ms epoch when the verdict was recorded
  readonly url: string;                // the analysed page URL
  readonly domain: string;             // display host (may be an IP literal)
  readonly tier: IncidentTier;         // tier LABEL only — never a numeric score
  readonly fired: readonly string[];   // rule ids that fired (may be empty for Safe)
}

/** What a caller supplies; `id` and (optionally) `at` are filled by the store. */
export interface IncidentInput {
  readonly at?: number;
  readonly url: string;
  readonly domain: string;
  readonly tier: IncidentTier;
  readonly fired: readonly string[];
}

export const INCIDENTS_KEY = 'ssx:incidents';
/** 30-day retention (design-of-record). */
export const INCIDENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function isIncident(x: unknown): x is Incident {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o['id'] === 'string' && typeof o['at'] === 'number'
    && typeof o['url'] === 'string' && typeof o['domain'] === 'string'
    && (o['tier'] === 'Low' || o['tier'] === 'Medium' || o['tier'] === 'High')
    && Array.isArray(o['fired']);
}

/**
 * The store. All reads prune expired incidents so an aged entry can never
 * surface, and `record` writes the pruned array back so storage does not grow
 * without bound. Read-modify-write is serialised through a per-instance promise
 * chain — the DEC-44 lesson: concurrent appends on one key must not lose an
 * update within a single worker.
 */
export class IncidentHistory {
  readonly #backend: IncidentStorageBackend;
  readonly #now: () => number;
  readonly #maxAgeMs: number;
  #seq = 0;
  #lock: Promise<unknown> = Promise.resolve();

  constructor(opts: { backend: IncidentStorageBackend; now?: () => number; maxAgeMs?: number }) {
    this.#backend = opts.backend;
    this.#now = opts.now ?? (() => Date.now());
    this.#maxAgeMs = opts.maxAgeMs ?? INCIDENT_RETENTION_MS;
  }

  /** Serialise a read-modify-write so concurrent records cannot clobber. */
  #withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#lock.then(fn, fn);
    // keep the chain alive even if fn rejects, but don't swallow the caller's error
    this.#lock = run.then(() => undefined, () => undefined);
    return run;
  }

  async #readRaw(): Promise<Incident[]> {
    const got = await this.#backend.get(INCIDENTS_KEY);
    const arr = got[INCIDENTS_KEY];
    if (!Array.isArray(arr)) return [];
    return arr.filter(isIncident);
  }

  #prune(list: readonly Incident[], now: number): Incident[] {
    const cutoff = now - this.#maxAgeMs;
    return list.filter((i) => i.at >= cutoff);
  }

  /** Append one incident, prune expired, persist. */
  async record(input: IncidentInput): Promise<Incident> {
    return this.#withLock(async () => {
      const now = this.#now();
      const at = input.at ?? now;
      const incident: Incident = {
        id: `${at}-${this.#seq++}`,
        at,
        url: input.url,
        domain: input.domain,
        tier: input.tier,
        fired: [...input.fired],
      };
      const next = this.#prune([...(await this.#readRaw()), incident], now);
      await this.#backend.set({ [INCIDENTS_KEY]: next });
      return incident;
    });
  }

  /** All live incidents, newest first, expired ones pruned (and persisted pruned). */
  async list(): Promise<readonly Incident[]> {
    return this.#withLock(async () => {
      const now = this.#now();
      const raw = await this.#readRaw();
      const pruned = this.#prune(raw, now);
      if (pruned.length !== raw.length) await this.#backend.set({ [INCIDENTS_KEY]: pruned });
      return [...pruned].sort((a, b) => b.at - a.at);
    });
  }

  /** Manual clear-all (design-of-record: user control). */
  async clearAll(): Promise<void> {
    return this.#withLock(async () => {
      await this.#backend.remove(INCIDENTS_KEY);
    });
  }
}
