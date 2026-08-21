/**
 * SecureSphere X — Role A ↔ Role B Boundary Interfaces v1
 * D0.8 Authentication Store Query · D0.9 Current Security State ·
 * D0.10 Analysis Invocation
 *
 * Conforms to: Specification v0.7 §3 (lifecycle/tiers), §9.4 (thresholds),
 *              §11 (Current Security State, monotonic escalation,
 *              intervention lock), §15 (failure semantics), §16.1 (latency),
 *              §20 (Authentication History Store)
 * Package:     packages/contracts
 * Owners:      D0.8 Role A (provider) + Role B (consumer)
 *              D0.9 Role B (provider) + Role A (consumer)
 *              D0.10 Role A (caller) + Role B (provider)
 *
 * These three are presented together because they carry SIGNALS FOR ONE
 * ANOTHER. The intervention lock (§11.4) and store guard G-02 (§20.6) both
 * depend on Role A reporting back what it presented and what the user did.
 * Specified separately, that feedback path is the thing that gets forgotten.
 *
 * STATUS: FROZEN at Stage 0.
 */

import type { Origin, LoginFingerprint, AnalysisSessionId, TargetResourceId } from './evidence.contract.v1';
import type { RuleId, Tier } from './ruleset.format.v1';
import type {
  RiskTier, PassTrigger, AnalysisPassResult, CurrentSecurityState,
} from './passresult.contract.v1';

export const BOUNDARY_CONTRACT_VERSION = '1.1.0' as const;

/* ════════════════════════════════════════════════════════════════════════
 * D0.8 — AUTHENTICATION STORE QUERY INTERFACE
 *
 * The store is read by the ACEM and by nothing else (§20.11). The read and
 * write paths are separate interfaces because the ACEM is READ-ONLY: a
 * module that mutated its own evidence source would make a pass
 * non-idempotent and break replay.
 * ════════════════════════════════════════════════════════════════════════ */

/* ── Read path (ACEM only) ─────────────────────────────────────────────── */

export interface CrossOriginMatch {
  readonly origin: Origin;
  readonly registrableDomain: string;
  readonly similarity: number;          // score only — τ_sim is applied by
  // CRED-02 at Stage 2 (§13.2)
}

export type AuthStoreLookupResult =
  | {
    readonly status: 'available';
    readonly originPresent: boolean;
    readonly lifecycleState: 'PROVISIONAL' | 'ESTABLISHED' | null;
    /** Present origin: drift vs current-algorithm-version revisions. */
    readonly fingerprintDrift: number | null;
    /** Absent origin: best ESTABLISHED match elsewhere. */
    readonly bestCrossOriginMatch: CrossOriginMatch | null
  }
  /** §20.11 — NEVER reported as "no match found". */
  | {
    readonly status: 'versionMismatch';
    readonly storedAlgorithmVersions: readonly string[]
  }
  /** §15.3 — CRED-02 becomes unevaluable; pass marked degraded. */
  | {
    readonly status: 'unavailable';
    readonly reason: 'store_corrupt' | 'store_rebuilding' | 'io_error'
  };

export interface AuthStoreReader {
  /**
   * Accepts `Origin`, never `string`. A URL cannot reach this interface
   * without a compile error — §20.3's prohibition on storing paths and
   * query strings is enforced by the type system, not by discipline.
   */
  lookup(origin: Origin, current: LoginFingerprint): Promise<AuthStoreLookupResult>;
}

/* ── Write path (outside the evaluation pipeline) ──────────────────────── */

export type GuardId = 'G-01' | 'G-02' | 'G-03' | 'G-04' | 'G-05';

export interface AuthRecordRequest {
  readonly origin: Origin;
  readonly fingerprint: LoginFingerprint;
  /** G-01: any CRED finding active and unsuppressed on this Session. */
  readonly credFindingActiveInSession: boolean;
  /** G-02: user proceeded past a Warn or Block in this Session. */
  readonly interventionOverriddenInSession: boolean;
  readonly isPrivateContext: boolean;
  readonly analysisSessionId: AnalysisSessionId;
}

export type AuthRecordOutcome =
  | { readonly result: 'recorded'; readonly newState: 'PROVISIONAL' | 'ESTABLISHED' }
  | { readonly result: 'blocked'; readonly guard: GuardId; readonly detail: string }
  /** §20.8 — private contexts read but never write. */
  | { readonly result: 'suppressed_private_context' }
  | { readonly result: 'failed'; readonly reason: string };

export interface AuthStoreWriter {
  /**
   * Guards G-01…G-05 (§20.6) are evaluated HERE, inside the write path.
   * They SHALL NOT create, suppress, or reweight any Correlation Finding —
   * the store is not part of the evaluation pipeline, and its guards must
   * not become an undocumented scoring path.
   */
  recordAuthentication(req: AuthRecordRequest): Promise<AuthRecordOutcome>;

  /** G-04: asymmetric unlearning — slow to establish, immediate to revoke. */
  demoteOrEvict(origin: Origin, cause: 'high_confidence_finding' | 'user_action'): Promise<void>;
}

/* ── User transparency and control (§20.9) ─────────────────────────────── */

export interface AuthStoreEntrySummary {
  readonly origin: Origin;              // plaintext — transparency over
  // obscurity (§20.9)
  readonly lifecycleState: 'PROVISIONAL' | 'ESTABLISHED';
  readonly firstSeenOn: string;         // day granularity (§20.3)
  readonly lastSeenOn: string;
  readonly successfulAuthCount: number;
}

export interface AuthStoreUserControl {
  listEntries(): Promise<readonly AuthStoreEntrySummary[]>;
  deleteEntry(origin: Origin): Promise<void>;
  clearAll(): Promise<void>;
}

/* ════════════════════════════════════════════════════════════════════════
 * D0.9 — CURRENT SECURITY STATE INTERFACE
 *
 * Role B publishes; Role A renders and enforces. §8.6.7 and §6.6 of the
 * Domain Model: the analytical layer RECOMMENDS a response and NEVER
 * executes one. Execution belongs entirely to Role A.
 * ════════════════════════════════════════════════════════════════════════ */

export type RecommendedResponse = 'Allow' | 'Warn' | 'Block';

/**
 * Explanation payload. §1.1 requires every decision to decompose into the
 * findings that produced it.
 *
 * `namedOrigin` carries CRED-02's matched origin so the warning can say
 * "this resembles the login page of <site you have used>" rather than the
 * markedly less persuasive "a site you use". This is why the store holds
 * plaintext origins (§20.9).
 */
export interface ExplanationItem {
  readonly ruleId: RuleId;
  readonly summary: string;
  readonly namedOrigin: Origin | null;
  readonly aiGenerated: boolean;        // §1.4 — always attributed
}

export interface SecurityStateView {
  readonly state: CurrentSecurityState;
  readonly recommendedResponse: RecommendedResponse;
  readonly explanations: readonly ExplanationItem[];

  /** §15.2 — when true, Role A SHALL NOT present an unqualified safe state. */
  readonly degraded: boolean;
  readonly degradedExplanation: string | null;

  /** §11.4 — an intervention already presented cannot be withdrawn. */
  readonly interventionLocked: boolean;
  readonly sourcePassResultId: string;
}

export interface SecurityStatePublisher {
  /**
   * In-memory only — §16.1's ≤10 ms Tier-0 budget requires `get()` to
   * never perform I/O (disk, network, or otherwise).
   */
  get(analysisSessionId: AnalysisSessionId): SecurityStateView | null;
  subscribe(
    analysisSessionId: AnalysisSessionId,
    onChange: (view: SecurityStateView) => void,
  ): () => void;
}

/* ════════════════════════════════════════════════════════════════════════
 * D0.10 — ANALYSIS INVOCATION INTERFACE
 *
 * Role A detects browser events and invokes; Role B evaluates. Role A never
 * evaluates and Role B never observes the browser.
 * ════════════════════════════════════════════════════════════════════════ */

export interface InvocationContext {
  readonly analysisSessionId: AnalysisSessionId;
  readonly targetResourceId: TargetResourceId;
  readonly tier: Tier;
  readonly trigger: PassTrigger;
  /** Propagated so the store write path can honour §20.8. */
  readonly isPrivateContext: boolean;
  /**
   * 1-based index of the Tier 2 gate event within the session; dense and
   * monotonic (Rule Engine §2.4). Null for Tier 0 and Tier 1 invocations,
   * which are not gates.
   *
   * ADDED at contract v1.1.0. Backend §12.3 makes gate submission idempotent
   * on `(sessionId, gateOrdinal)`, so the value must cross the Role A → Role B
   * boundary and, in the HTTP projection, the client-server boundary. It had
   * no canonical definition; this is that definition.
   *
   * `tier` is NOT part of the HTTP projection of this structure (BI-32,
   * Backend §5.1).
   */
  readonly gateOrdinal: number | null;
}

export type PassInvocationResult =
  /** §15.4 — committed atomically, or not at all. */
  | { readonly status: 'committed'; readonly passResult: AnalysisPassResult }
  | { readonly status: 'abandoned'; readonly reason: string };

export interface AnalysisInvoker {
  /** §3.1 — one Session per Target Resource per navigation. */
  createSession(targetUrl: string, isPrivateContext: boolean): Promise<AnalysisSessionId>;

  /**
   * Tier 0 and Tier 1 — LOCAL ONLY.
   * §16.1 prohibits network I/O here; budgets are 10 ms and 50 ms.
   * §3.2: these tiers may set a passive indicator and arm gates. They
   * SHALL NOT interrupt the user.
   */
  runLocalPass(ctx: InvocationContext, evidenceRef: string): Promise<PassInvocationResult>;

  /**
   * Tier 2 — action gate. Backend evidence and (Phase II) AI escalation are
   * permitted. The user is stopped, so the latency budget is relaxed.
   * This is the ONLY tier whose result may produce an interruption.
   */
  runGatePass(ctx: InvocationContext, evidenceRef: string): Promise<PassInvocationResult>;

  /** §3.5 — navigation away, tab close, or timeout. */
  finalizeSession(analysisSessionId: AnalysisSessionId): Promise<void>;
}

/* ── Feedback path: Role A → Role B ────────────────────────────────────── */

export type UserDisposition = 'heeded' | 'overridden' | 'dismissed';

/**
 * REQUIRED, not optional.
 *
 * §11.4's intervention lock and §20.6's guard G-02 are both properties the
 * engine must know but only the client can observe. Without this path the
 * engine cannot set `interventionLocked`, and the store cannot honour
 * "never learn from an overridden intervention" — silently reopening the
 * poisoning window that G-02 exists to close.
 */
export interface InterventionReporter {
  reportInterventionPresented(
    analysisSessionId: AnalysisSessionId,
    response: RecommendedResponse,
    tier: RiskTier,
  ): Promise<void>;

  reportUserDisposition(
    analysisSessionId: AnalysisSessionId,
    disposition: UserDisposition,
  ): Promise<void>;
}

/* ════════════════════════════════════════════════════════════════════════
 * INVARIANTS
 *
 * B-1  Only the ACEM calls `AuthStoreReader`. No rule, suppression, or
 *      aggregation stage queries the store directly (§20.11).
 * B-2  `AuthStoreReader` and `AuthStoreWriter` accept `Origin`, never
 *      `string`. Only `toOrigin()` constructs an `Origin` (D0.1 I-9).
 * B-3  The ACEM never calls `AuthStoreWriter`. Read and write paths are
 *      disjoint (§20.11).
 * B-4  `versionMismatch` is NEVER surfaced as an absent match (§20.11).
 * B-5  Guards G-01…G-05 execute in the write path only and produce no
 *      Correlation Finding (§20.6).
 * B-6  In a private context, `recordAuthentication` returns
 *      `suppressed_private_context`. Reads proceed normally (§20.8).
 * B-7  `runLocalPass` performs NO network I/O (§16.1).
 * B-8  Only `runGatePass` may yield a result that interrupts the user (§3.2).
 * B-9  Role B recommends; Role A executes. The engine never blocks, warns,
 *      navigates, or renders (Domain Model §6.6, §8.6.7).
 * B-10 Role A SHALL call `reportInterventionPresented` before presenting any
 *      warning or block. §11.4 is unimplementable otherwise.
 * B-11 Role A SHALL call `reportUserDisposition` on every resolved
 *      intervention. G-02 is unimplementable otherwise.
 * B-12 A pass result is committed atomically or abandoned (§15.4). No
 *      partial score reaches Current Security State.
 * B-13 Where `degraded` is true, Role A SHALL NOT present an unqualified
 *      safe state (§15.2).
 * B-14 A subscription established via `subscribe()` ends when its Session
 *      ends; Role B fires no further callback afterward (§3.5).
 * ──────────────────────────────────────────────────────────────────────── */

