/**
 * A1.3 — Authentication History Store + D0.8 (Role A).
 *
 * The local backing store for CRED-02 (§20.1): it records ONLY origins at
 * which the user successfully authenticated, plus the login-interface
 * fingerprint observed there. Never general browsing (§20.1 invariant).
 *
 * ── THE INVARIANTS THIS FILE EXISTS TO HOLD ──────────────────────────────
 *  §20.2 NEVER-TRANSMIT: no store content leaves the device, ever, in any
 *        form. Nothing here constructs a network request; G-6 audits that no
 *        network-reachable path can read the store.
 *  B-2   Origin, never string: the read/write interfaces take `Origin`, so
 *        §20.3's "no paths/query strings stored" is type-enforced.
 *  B-4 / §20.11  A version mismatch is reported as `versionMismatch`, NEVER as
 *        "no match found" — conflating them would read a stale-fingerprint
 *        store as an unknown origin.
 *  B-5 / §20.6  Guards G-01…G-05 run in the WRITE path only and produce no
 *        Correlation Finding — the store is not a scoring path.
 *  B-6 / §20.8  Private context: reads proceed normally; writes are SUPPRESSED
 *        (return `suppressed_private_context`). See the note on backing stores.
 *
 * ── BACKING STORE, and a deliberate divergence from the build instruction ─
 * The canonical store is `chrome.storage.local` (persistent). §20.4 requires
 * ESTABLISHED entries to survive indefinitely (bounded only by LRU), so a
 * session store — cleared on browser close — would silently discard the
 * trusted set on restart.
 *
 * The instruction asked for `chrome.storage.session` as the PRIVATE-context
 * store. That cannot be reconciled with FROZEN contract B-6, which says a
 * private-context write returns `suppressed_private_context` — i.e. never
 * writes at all. Writing private auth to a session store would be a write, and
 * B-6 forbids it. The contract is authoritative, so this implements B-6:
 * private context reads the persistent local store normally (protection
 * preserved) and suppresses writes. Making private-context learning ephemeral
 * via session storage would require amending B-6 — an Architecture Owner
 * decision, not a code choice. The backend remains injectable so that decision,
 * if taken, is a one-line change here.
 */

import {
  toOrigin,
  type Origin, type LoginFingerprint, type DayStamp,
} from '../../packages/contracts/evidence.contract.v1.ts';
import type {
  AuthStoreReader, AuthStoreWriter, AuthStoreUserControl,
  AuthStoreLookupResult, AuthRecordRequest, AuthRecordOutcome,
  CrossOriginMatch, AuthStoreEntrySummary,
} from '../../packages/contracts/boundary.interfaces.v1.ts';

/* ── tunable establishment parameters (§13.2, §18) ────────────────────────
 * All empirical (§18.2); defaults are deliberately RESTRICTIVE per §20.5
 * ("a store that learns slowly is materially safer than one that learns
 * wrongly"). Overridable for tests and calibration. */
export interface AuthStoreConfig {
  /** N — successful authentications for PROVISIONAL → ESTABLISHED (§20.4). */
  readonly establishAuthCount: number;
  /** M — distinct days those authentications must span (§20.4). */
  readonly establishDistinctDays: number;
  /** G-03 collision threshold: a candidate fingerprint at/above this
   *  similarity to an ESTABLISHED entry at another origin blocks the write. */
  readonly collisionThreshold: number;
  /** G-05: max establishments permitted within the rate window before a burst
   *  is anomalous and promotion is withheld. */
  readonly establishmentsPerWindow: number;
  /** G-05 rate window, in distinct days. */
  readonly rateWindowDays: number;
}

export const DEFAULT_AUTH_STORE_CONFIG: AuthStoreConfig = {
  establishAuthCount: 3,
  establishDistinctDays: 2,
  collisionThreshold: 0.9,
  establishmentsPerWindow: 5,
  rateWindowDays: 1,
};

/* ── persisted shapes ─────────────────────────────────────────────────────
 * §20.3 data inventory ONLY: origin, fingerprint, day-granular first/last
 * seen, auth count, lifecycle state, and 2–3 recent fingerprint revisions.
 * NO full URL, credentials, cookies, tokens, or non-auth navigation. */
export interface AuthEntry {
  readonly origin: Origin;
  readonly fingerprint: LoginFingerprint;
  readonly lifecycleState: 'PROVISIONAL' | 'ESTABLISHED';
  readonly firstSeenOn: DayStamp;
  readonly lastSeenOn: DayStamp;
  readonly successfulAuthCount: number;
  /** Distinct day stamps on which an auth occurred — the M-distinct-days basis
   *  (§20.4). Kept as the set, not just a count, so re-auth on the same day
   *  does not advance establishment. */
  readonly authDays: readonly string[];
  /** Two–three most recent prior fingerprints (§20.4, §20.7). */
  readonly fingerprintRevisions: readonly LoginFingerprint[];
}

const ENTRY_PREFIX = 'ssx:auth:';
const META_KEY = 'ssx:auth-meta';

interface StoreMeta {
  /** Day stamps of recent establishments — the G-05 rate-bound log. */
  readonly establishmentLog: readonly string[];
  /** Anomalous establishment bursts recorded for review (§20.6 G-05). */
  readonly anomalies: readonly { readonly origin: string; readonly on: string }[];
  /** G-03 high-confidence impersonation observations recorded at write time. */
  readonly impersonationObservations: readonly { readonly candidate: string; readonly collidesWith: string; readonly similarity: number; readonly on: string }[];
}

const EMPTY_META: StoreMeta = { establishmentLog: [], anomalies: [], impersonationObservations: [] };

/* ── injectable storage backend (chrome.storage.StorageArea shape) ────────
 * Same seam A1.1's session-store uses: browser-free core, tested with an
 * in-memory fake, real chrome.storage.local plugged in by the caller. */
export interface AuthStorageBackend {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/**
 * Fingerprint similarity in [0,1] (§20.11).
 *
 * ⚠️ STUB ALGORITHM, REAL INTERFACE. A production build compares the
 * perceptual hashes (faviconHash, heroImagePerceptualHash) by Hamming
 * distance. This deterministic stand-in combines the structurally-available
 * signals so the store's guard logic (G-03) and lookup (drift / cross-origin
 * match) are exercisable end to end now; only the scoring kernel is provisional.
 * Deterministic and pure — no clock, no randomness — so tests are stable.
 */
export function computeFingerprintSimilarity(a: LoginFingerprint, b: LoginFingerprint): number {
  if (a.fingerprintAlgorithmVersion !== b.fingerprintAlgorithmVersion) return 0;
  let score = 0;
  let weight = 0;
  // Perceptual hashes: exact match is the strongest signal the stub can use
  // without a real Hamming kernel.
  const hashPairs: readonly (readonly [string | null, string | null])[] = [
    [a.faviconHash, b.faviconHash],
    [a.heroImagePerceptualHash, b.heroImagePerceptualHash],
  ];
  for (const [x, y] of hashPairs) {
    if (x !== null && y !== null) { weight += 0.4; if (x === y) score += 0.4; }
  }
  // Field composition (ordered) exact match.
  weight += 0.4;
  if (JSON.stringify(a.fieldComposition) === JSON.stringify(b.fieldComposition)) score += 0.4;
  // Title-token Jaccard.
  const at = new Set(a.titleTokens); const bt = new Set(b.titleTokens);
  const inter = [...at].filter((t) => bt.has(t)).length;
  const uni = new Set([...at, ...bt]).size;
  weight += 0.2;
  if (uni > 0) score += 0.2 * (inter / uni);
  return weight === 0 ? 0 : score / weight;
}

export class AuthStore implements AuthStoreReader, AuthStoreWriter, AuthStoreUserControl {
  readonly #backend: AuthStorageBackend;
  readonly #config: AuthStoreConfig;
  readonly #isPrivateContext: boolean;
  /** Day stamp source, injectable so tests can drive distinct days. */
  readonly #today: () => string;

  constructor(opts: {
    backend: AuthStorageBackend;
    isPrivateContext: boolean;
    config?: AuthStoreConfig;
    today?: () => string;
  }) {
    this.#backend = opts.backend;
    this.#isPrivateContext = opts.isPrivateContext;
    this.#config = opts.config ?? DEFAULT_AUTH_STORE_CONFIG;
    this.#today = opts.today ?? (() => new Date().toISOString().slice(0, 10));
  }

  /* ── internal helpers ──────────────────────────────────────────────── */

  async #getEntry(origin: Origin): Promise<AuthEntry | null> {
    const key = ENTRY_PREFIX + origin;
    const raw = await this.#backend.get(key);
    const v = raw[key];
    return isAuthEntry(v) ? v : null;
  }

  async #allEntries(): Promise<AuthEntry[]> {
    const all = await this.#backend.get(null);
    const out: AuthEntry[] = [];
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(ENTRY_PREFIX) && isAuthEntry(v)) out.push(v);
    }
    return out;
  }

  async #putEntry(entry: AuthEntry): Promise<void> {
    await this.#backend.set({ [ENTRY_PREFIX + entry.origin]: entry });
  }

  async #getMeta(): Promise<StoreMeta> {
    const raw = await this.#backend.get(META_KEY);
    const v = raw[META_KEY];
    return isStoreMeta(v) ? v : EMPTY_META;
  }

  async #putMeta(meta: StoreMeta): Promise<void> {
    await this.#backend.set({ [META_KEY]: meta });
  }

  /* ── D0.8 READ PATH (AuthStoreReader) — ACEM only (B-1) ─────────────── */

  async lookup(origin: Origin, current: LoginFingerprint): Promise<AuthStoreLookupResult> {
    try {
      const entries = await this.#allEntries();

      // B-4 / §20.11: a version mismatch is NEVER reported as absent. If the
      // store holds fingerprints but none share `current`'s algorithm version,
      // no meaningful comparison is possible — say so explicitly.
      const storedVersions = [...new Set(entries.map((e) => e.fingerprint.fingerprintAlgorithmVersion))];
      if (entries.length > 0 && !storedVersions.includes(current.fingerprintAlgorithmVersion)) {
        return { status: 'versionMismatch', storedAlgorithmVersions: storedVersions };
      }

      const own = entries.find((e) => e.origin === origin) ?? null;
      if (own !== null) {
        if (own.fingerprint.fingerprintAlgorithmVersion !== current.fingerprintAlgorithmVersion) {
          return { status: 'versionMismatch', storedAlgorithmVersions: storedVersions };
        }
        return {
          status: 'available',
          originPresent: true,
          lifecycleState: own.lifecycleState,
          // Drift = 1 − similarity between the stored and current fingerprint.
          fingerprintDrift: 1 - computeFingerprintSimilarity(own.fingerprint, current),
          bestCrossOriginMatch: null,
        };
      }

      // Origin ABSENT: best ESTABLISHED match at another origin (CRED-02's
      // signal). Only same-algo-version ESTABLISHED entries are comparable.
      let best: CrossOriginMatch | null = null;
      for (const e of entries) {
        if (e.lifecycleState !== 'ESTABLISHED') continue;
        if (e.fingerprint.fingerprintAlgorithmVersion !== current.fingerprintAlgorithmVersion) continue;
        const sim = computeFingerprintSimilarity(e.fingerprint, current);
        if (best === null || sim > best.similarity) {
          best = { origin: e.origin, registrableDomain: registrableOf(e.origin), similarity: sim };
        }
      }
      return {
        status: 'available', originPresent: false, lifecycleState: null,
        fingerprintDrift: null, bestCrossOriginMatch: best,
      };
    } catch {
      return { status: 'unavailable', reason: 'io_error' };
    }
  }

  /* ── D0.8 WRITE PATH (AuthStoreWriter) — guards G-01…G-05 (B-5) ─────── */

  async recordAuthentication(req: AuthRecordRequest): Promise<AuthRecordOutcome> {
    // §20.8 / B-6: private context reads normally but NEVER writes.
    if (this.#isPrivateContext || req.isPrivateContext) {
      return { result: 'suppressed_private_context' };
    }

    try {
      // G-01 — no learning from a flagged session (§20.6).
      if (req.credFindingActiveInSession) {
        return { result: 'blocked', guard: 'G-01', detail: 'a CRED-family finding was active and unsuppressed on this session' };
      }
      // G-02 — no learning from an overridden intervention (§20.6).
      if (req.interventionOverriddenInSession) {
        return { result: 'blocked', guard: 'G-02', detail: 'the user proceeded past a warning or block in this session' };
      }

      const existing = await this.#getEntry(req.origin);
      const today = this.#today();

      // G-03 — fingerprint collision check, only when CREATING a new entry
      // (§20.6: "before creating a new entry"). A candidate matching an
      // ESTABLISHED entry at another origin is the CRED-02 condition itself.
      if (existing === null) {
        const entries = await this.#allEntries();
        for (const e of entries) {
          if (e.origin === req.origin) continue;
          if (e.lifecycleState !== 'ESTABLISHED') continue;
          const sim = computeFingerprintSimilarity(e.fingerprint, req.fingerprint);
          if (sim >= this.#config.collisionThreshold) {
            const meta = await this.#getMeta();
            await this.#putMeta({
              ...meta,
              impersonationObservations: [
                ...meta.impersonationObservations,
                { candidate: req.origin, collidesWith: e.origin, similarity: sim, on: today },
              ],
            });
            return { result: 'blocked', guard: 'G-03', detail: `candidate fingerprint collides with ESTABLISHED origin ${e.origin} (similarity ${sim.toFixed(3)})` };
          }
        }
      }

      // Build/advance the entry.
      const authDays = existing === null
        ? [today]
        : (existing.authDays.includes(today) ? existing.authDays : [...existing.authDays, today]);
      const authCount = (existing?.successfulAuthCount ?? 0) + 1;

      // Fingerprint refresh at an ESTABLISHED origin (§20.7), retaining recent
      // revisions (2–3).
      const revisions = existing === null
        ? []
        : [existing.fingerprint, ...existing.fingerprintRevisions].slice(0, 3);

      let lifecycleState: 'PROVISIONAL' | 'ESTABLISHED' = existing?.lifecycleState ?? 'PROVISIONAL';

      // Promotion candidate: enough auths across enough distinct days.
      const meetsThreshold = authCount >= this.#config.establishAuthCount
        && authDays.length >= this.#config.establishDistinctDays;

      let meta = await this.#getMeta();
      if (lifecycleState === 'PROVISIONAL' && meetsThreshold) {
        // G-05 — establishment rate bound (§20.6). Count establishments within
        // the rate window; a burst withholds promotion and is recorded.
        const windowStart = daysAgo(today, this.#config.rateWindowDays);
        const recent = meta.establishmentLog.filter((d) => d >= windowStart);
        if (recent.length >= this.#config.establishmentsPerWindow) {
          meta = { ...meta, anomalies: [...meta.anomalies, { origin: req.origin, on: today }] };
          await this.#putMeta(meta);
          // Withhold ESTABLISHED; stays PROVISIONAL. The auth is still recorded.
        } else {
          lifecycleState = 'ESTABLISHED';
          meta = { ...meta, establishmentLog: [...meta.establishmentLog, today] };
          await this.#putMeta(meta);
        }
      }

      const entry: AuthEntry = {
        origin: req.origin,
        fingerprint: req.fingerprint,
        lifecycleState,
        firstSeenOn: existing?.firstSeenOn ?? (today as DayStamp),
        lastSeenOn: today as DayStamp,
        successfulAuthCount: authCount,
        authDays,
        fingerprintRevisions: revisions,
      };
      await this.#putEntry(entry);
      return { result: 'recorded', newState: lifecycleState };
    } catch (e) {
      return { result: 'failed', reason: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * G-04 — asymmetric unlearning: establishment is slow, revocation immediate.
   * A high-confidence CRED finding demotes an ESTABLISHED entry to PROVISIONAL;
   * a user action evicts outright.
   */
  async demoteOrEvict(origin: Origin, cause: 'high_confidence_finding' | 'user_action'): Promise<void> {
    const existing = await this.#getEntry(origin);
    if (existing === null) return;
    if (cause === 'user_action') {
      await this.#backend.remove(ENTRY_PREFIX + origin);
      return;
    }
    // high_confidence_finding: ESTABLISHED → PROVISIONAL (demote); a
    // PROVISIONAL entry is evicted (nothing left to demote to).
    if (existing.lifecycleState === 'ESTABLISHED') {
      await this.#putEntry({ ...existing, lifecycleState: 'PROVISIONAL' });
    } else {
      await this.#backend.remove(ENTRY_PREFIX + origin);
    }
  }

  /* ── user transparency & control (§20.9, AuthStoreUserControl) ───────── */

  async listEntries(): Promise<readonly AuthStoreEntrySummary[]> {
    const entries = await this.#allEntries();
    return entries.map((e) => ({
      origin: e.origin,
      lifecycleState: e.lifecycleState,
      firstSeenOn: e.firstSeenOn,
      lastSeenOn: e.lastSeenOn,
      successfulAuthCount: e.successfulAuthCount,
    }));
  }

  async deleteEntry(origin: Origin): Promise<void> {
    await this.#backend.remove(ENTRY_PREFIX + origin);
  }

  async clearAll(): Promise<void> {
    const all = await this.#backend.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(ENTRY_PREFIX) || k === META_KEY);
    if (keys.length > 0) await this.#backend.remove(keys);
  }
}

/* ── validators (on-disk data is untrusted; A1.1 / DEFECT-33 discipline) ── */

function isAuthEntry(v: unknown): v is AuthEntry {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o['origin'] === 'string'
    && (o['lifecycleState'] === 'PROVISIONAL' || o['lifecycleState'] === 'ESTABLISHED')
    && typeof o['successfulAuthCount'] === 'number'
    && Array.isArray(o['authDays'])
    && typeof o['fingerprint'] === 'object' && o['fingerprint'] !== null;
}

function isStoreMeta(v: unknown): v is StoreMeta {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o['establishmentLog']) && Array.isArray(o['anomalies']) && Array.isArray(o['impersonationObservations']);
}


/** eTLD+1 is a PSL concern (harness-only, forbidden here) — the registrable
 *  domain in a CrossOriginMatch is filled with the host for now, pending the
 *  shared-PSL follow-up (same boundary A1.2 hit). Host is a safe superset:
 *  never wrong in a way that fabricates a narrower match. */
function registrableOf(origin: Origin): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

function daysAgo(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/* ── chrome backend selection ─────────────────────────────────────────────
 * Canonical store is chrome.storage.local (persistent — §20.4). The selection
 * is exposed for completeness and future use; per B-6 the private path
 * suppresses writes rather than routing them to session (see file header). */
export function chromeAuthBackend(): AuthStorageBackend {
  return {
    get: (keys) => chrome.storage.local.get(keys),
    set: (items) => chrome.storage.local.set(items),
    remove: (keys) => chrome.storage.local.remove(keys),
  };
}

/** True in an incognito/private extension context. */
export function inPrivateContext(): boolean {
  return typeof chrome !== 'undefined'
    && typeof chrome.extension !== 'undefined'
    && chrome.extension.inIncognitoContext === true;
}

/** Convenience constructor mirroring the real content-script wiring. */
export function createAuthStore(config?: AuthStoreConfig): AuthStore {
  return new AuthStore({ backend: chromeAuthBackend(), isPrivateContext: inPrivateContext(), config });
}

export { toOrigin };
