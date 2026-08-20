/**
 * SecureSphere X — Snapshot Format v1  (D0.5)
 *
 * Conforms to: Specification v0.7 §13.3 (validation protocol), §17.2 (replay
 *              gate / golden corpus), D0.1 (Evidence Contract)
 * Package:     packages/contracts
 * Owner:       Role C
 * Consumers:   Role B (offline rule evaluation, regression replay),
 *              Role C (metrics, calibration)
 *
 * SCOPE NOTE — a Snapshot is NOT a domain object.
 * It does not participate in the knowledge evolution chain, is not owned by
 * any repository, and is never persisted by the product. It is a benchmark
 * corpus artifact. Security Evidence EXTRACTED from a snapshot is a domain
 * object; the snapshot envelope around it is not.
 *
 * PRIVACY NOTE — snapshots contain no user data. The capture pipeline browses
 * autonomously, never observes a user session, and MUST NOT read or write the
 * Authentication History Store (§20.2).
 *
 * STATUS: FROZEN at Stage 0.
 */

import type { SecurityEvidence } from './evidence.contract.v1';

export const SNAPSHOT_FORMAT_VERSION = '1.1.0' as const;

/* ────────────────────────────────────────────────────────────────────────
 * 1. FETCH OUTCOME
 *
 * Recorded SEPARATELY from evidence, and never conflated with it.
 *
 * Phishing infrastructure cloaks against datacenter IPs and non-browser
 * agents far more aggressively than legitimate infrastructure does. A
 * materially higher failure rate on positives than negatives will skew every
 * downstream metric, and a silent fetch failure is indistinguishable from a
 * rule that did not fire. Outcome distribution MUST be reported alongside
 * every confusion matrix (§13.3).
 * ──────────────────────────────────────────────────────────────────────── */

export type FetchOutcome =
  | 'success'
  | 'dns_resolution_failed'
  | 'tls_handshake_failed'
  | 'http_error'            // 4xx / 5xx
  | 'timeout'
  | 'redirect_loop'
  | 'empty_document'
  | 'blocked_or_cloaked'    // served an interstitial / bot wall
  | 'navigation_error';

export interface FetchRecord {
  readonly outcome: FetchOutcome;
  readonly httpStatus: number | null;
  readonly durationMs: number;
  readonly finalUrl: string | null;
  readonly attemptOrdinal: number;    // retries are separate snapshots
}

/* ────────────────────────────────────────────────────────────────────────
 * 2. LABEL AND PROVENANCE
 * ──────────────────────────────────────────────────────────────────────── */

export type CorpusLabel = 'phishing' | 'benign';
export type FeedSource = 'phishtank' | 'openphish' | 'tranco' | 'manual';

export interface LabelProvenance {
  readonly label: CorpusLabel;
  readonly feed: FeedSource;
  /** Feed's own verification status, where the feed provides one. */
  readonly feedVerified: boolean | null;
  /** Day granularity. Feed report date, not capture date. */
  readonly reportedOn: string | null;
  readonly feedRecordId: string | null;

  /**
   * For phishing snapshots: the brand being impersonated, where the feed
   * states it or it is unambiguous. REQUIRED for CRED-02 validation — the
   * synthetic seeding protocol pairs a phishing snapshot with the benign
   * login snapshot of the brand it targets.
   */
  readonly impersonatedBrand: string | null;
}

/* ────────────────────────────────────────────────────────────────────────
 * 3. SPLIT ASSIGNMENT   (§13.3)
 *
 * Assigned AT CAPTURE TIME, deterministically, and IMMUTABLE thereafter.
 *
 * This is the mechanism that enforces split discipline. If splits were
 * assigned at analysis time, a re-split during calibration would leak test
 * data into tuning — the single most common methodological failure in work
 * of this kind, and the one that invalidates every reported number.
 *
 * DERIVATION (amended, split-v2): stable hash of the REGISTRABLE DOMAIN
 * (eTLD+1, PSL-resolved) into fixed proportions.
 *
 * Previously derived from `snapshotId`, which embeds the capture date — so
 * the same URL captured on two days landed in two splits. Under 30-minute
 * polling a live URL yields roughly a dozen snapshots, meaning essentially
 * every URL straddled splits. Keying on registrable domain places every
 * capture of a site permanently in one split.
 *
 * WHAT THIS DOES NOT FIX. The dominant duplication mode in phishing corpora
 * is one kit mass-deployed across many domains, often byte-identical.
 * Domain keying does not address it. That residual is REPORTED as a metric
 * (§13.3) rather than engineered away, because eliminating it would require
 * clustering the corpus before assigning splits — surrendering the
 * capture-time immutability of S-2, which is the property that makes a
 * re-split impossible rather than merely discouraged.
 *
 * `splitKey` records the exact string hashed. The split is therefore
 * auditable without re-deriving eTLD+1, and a later Public Suffix List
 * update cannot retroactively move a snapshot between splits.
 * ──────────────────────────────────────────────────────────────────────── */

export type CorpusSplit = 'train' | 'validation' | 'test';

export interface SplitAssignment {
  readonly split: CorpusSplit;
  /** 'split-v2' — registrable domain. 'split-v1' (snapshotId) is retired. */
  readonly assignmentFunctionVersion: string;
  /** The exact string hashed. Frozen; never re-derived. */
  readonly splitKey: string;
  readonly proportions: {
    readonly train: number;
    readonly validation: number;
    readonly test: number;
  };
  /** Day granularity. */
  readonly assignedOn: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * 4. RAW MATERIAL
 *
 * Retained SEPARATELY from extracted evidence, and this separation is the
 * point of the format.
 *
 * The Evidence Contract will change. When it does, the corpus must be
 * re-extractable without re-crawling — and re-crawling is impossible, since
 * phishing URLs decay within hours. Raw material captured today remains
 * usable against evidence contract v2, v3, and beyond.
 * ──────────────────────────────────────────────────────────────────────── */

export interface RawRedirectHop {
  readonly fromUrl: string;
  readonly toUrl: string;
  readonly statusCode: number | null;
  readonly mechanism: string;
}

export interface RawMaterial {
  readonly requestedUrl: string;
  readonly finalUrl: string | null;

  /** Serialized DOM AFTER script execution and settle. */
  readonly renderedDom: string | null;
  readonly domContentHash: string | null;   // dedup + change detection

  readonly responseHeaders: Readonly<Record<string, string>> | null;
  readonly redirectChain: readonly RawRedirectHop[];

  /** Certificate and DNS detail the harness can resolve and the extension
   *  cannot. PRODUCER_EXCLUSIVE per D0.1's conformance classes. */
  readonly tlsCertificateChain: readonly string[] | null;
  readonly dnsRecords: Readonly<Record<string, readonly string[]>> | null;

  /** Optional. Storage-expensive; enables perceptual-hash re-derivation
   *  when the fingerprint algorithm version changes (§20.11). */
  readonly screenshotRef: string | null;
}

/* ────────────────────────────────────────────────────────────────────────
 * 5. EXTRACTED EVIDENCE
 *
 * Produced from RawMaterial by the extractor. Re-derivable at any time.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ExtractionRecord {
  readonly extractorVersion: string;
  readonly evidenceContractVersion: string;
  /** Day granularity. */
  readonly extractedOn: string;
  readonly evidence: SecurityEvidence;
}

/* ────────────────────────────────────────────────────────────────────────
 * 6. SNAPSHOT
 * ──────────────────────────────────────────────────────────────────────── */

export interface Snapshot {
  readonly snapshotId: string;
  readonly formatVersion: typeof SNAPSHOT_FORMAT_VERSION;

  /** Day granularity. Capture recency matters: a phishing snapshot
   *  captured weeks after its feed report is likely a dead domain. */
  readonly capturedOn: string;

  readonly provenance: LabelProvenance;
  readonly split: SplitAssignment;
  readonly fetch: FetchRecord;
  readonly raw: RawMaterial;

  /** Latest extraction. Prior extractions MAY be retained for comparison
   *  across extractor versions. */
  readonly extraction: ExtractionRecord | null;

  /** True where the page presents a credential interface. Cheap corpus
   *  filter: CRED-family rules are only meaningful on such pages. */
  readonly presentsCredentialInterface: boolean | null;
}

/* ────────────────────────────────────────────────────────────────────────
 * 7. GOLDEN CORPUS ENTRY   (§17.2)
 *
 * A frozen snapshot paired with the decision it produced. The replay gate
 * asserts reconstruction (same version ⇒ same decision) and enumerates
 * regression divergence (candidate version ⇒ reviewed differences).
 * ──────────────────────────────────────────────────────────────────────── */

export interface GoldenCorpusEntry {
  readonly snapshotId: string;
  readonly recordedRuleSetVersion: string;
  readonly recordedPassResultId: string;
  readonly expectedScore: number;
  readonly expectedTier: 'Low' | 'Medium' | 'High';
  readonly expectedMatchedRules: readonly string[];
  /** Frozen on entry. A golden entry is never re-derived in place. */
  readonly frozenOn: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * 8. INVARIANTS
 *
 * S-1  RawMaterial is immutable once captured. Re-extraction produces a new
 *      ExtractionRecord; it never mutates raw material.
 * S-2  SplitAssignment is immutable. A snapshot NEVER changes split. Any
 *      re-split invalidates every previously reported metric. The one-time
 *      split-v1 → split-v2 migration is permissible ONLY because it precedes
 *      all tuning; after the first weight is calibrated it is a breach.
 * S-2a All snapshots sharing a registrable domain share a split. Verified by
 *      audit, not assumed.
 * S-2b `splitKey` is frozen at assignment. A later PSL update MUST NOT move
 *      any snapshot between splits.
 * S-3  Metrics are reported from `test` ONLY. Tuning reads `train` and
 *      `validation` ONLY. Enforced by tooling, not convention (§13.3).
 * S-4  FetchOutcome is recorded for EVERY attempt, including failures. Failed
 *      fetches remain in the corpus — excluding them silently biases the
 *      positive set toward non-cloaking, i.e. less sophisticated, phishing.
 * S-5  Outcome distribution by label MUST accompany every reported confusion
 *      matrix. An asymmetric failure rate is a finding, not noise.
 * S-6  Re-extraction is deterministic: identical RawMaterial + identical
 *      extractorVersion ⇒ identical SecurityEvidence.
 * S-7  Extracted evidence MUST satisfy D0.1's harness capability manifest.
 *      Fields the harness cannot populate are `notCollected`, never `absent`.
 * S-8  A snapshot NEVER contains user data. The capture pipeline MUST NOT
 *      read or write the Authentication History Store (§20.2).
 * S-9  DL and PM family rules are NOT corpus-validatable (D0.1 conformance
 *      classes). Snapshot-derived metrics cover the CRED family only; DL-01,
 *      DL-02 and PM-01 REQUIRE in-browser validation.
 * S-11 Residual leakage is REPORTED, never engineered away by re-splitting:
 *      cross-split kit duplication rate, temporal-holdout metrics, and
 *      CRED-02 brand overlap accompany every published result (§13.3).
 * S-10 CRED-04 is DIVERGENT: the harness observes server-side redirect chains
 *      the extension may not see. Its corpus recall MUST be reported
 *      separately and MUST NOT be folded into a headline figure.
 * ──────────────────────────────────────────────────────────────────────── */
