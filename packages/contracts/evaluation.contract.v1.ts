/**
 * SecureSphere X — Security Evaluation Contract v1  (D0.2)
 *
 * Conforms to: Specification v0.5, Domain Model §5.3 / §8.3, ECE Module Specs
 * Package:     packages/contracts
 * Owner:       Role B
 * Consumers:   Correlation stage (Role B), persistence (Analysis Session),
 *              replay harness, Analysis Pass Result (D0.4)
 *
 * STATUS: FROZEN at Stage 0. Conforms to Specification v0.7.
 */

import type {
  Origin, CollectionContext,
  CredentialFieldKind, FormMethod, RedirectMechanism, SensitivePermission,
  AnalysisSessionId, TargetResourceId
} from './evidence.contract.v1';

export const EVALUATION_CONTRACT_VERSION = '1.1.0' as const;

/* ────────────────────────────────────────────────────────────────────────
 * 1. MODULE IDENTITY
 *
 * Closed union. Each Security Evaluation originates from exactly one module
 * (Domain Model §8.3.7, "Single Module Ownership").
 * ──────────────────────────────────────────────────────────────────────── */

export type ModuleId =
  | 'url'
  | 'ssl'
  | 'dns'
  | 'redirect'
  | 'loginForm'
  | 'javascript'
  | 'homograph'
  | 'authContext'         // ACEM, Specification §20.11
  | 'downloadContext'     // Specification §2.6, v0.6
  | 'permissionContext';  // Specification §2.6, v0.6

/* ────────────────────────────────────────────────────────────────────────
 * 2. EVALUABILITY
 *
 * §15.2 requires `unevaluable(reason)` to be distinguishable from "evaluated,
 * nothing found". The distinction originates in D0.1's Observation tri-state
 * and is carried forward here, because a rule predicate must be able to tell
 * "this module looked and found nothing" from "this module could not look".
 *
 * An unevaluable evaluation still EXISTS and is still persisted. It is not
 * an absence of an evaluation.
 * ──────────────────────────────────────────────────────────────────────── */

export type UnevaluableReason =
  | 'required_evidence_not_collected'   // upstream Observation was notCollected
  | 'store_unavailable'                 // §15.3, ACEM only
  | 'fingerprint_version_mismatch'      // §20.11, ACEM only
  | 'evidence_contract_mismatch'        // producer/consumer version skew
  | 'backend_unreachable'               // §15.3, backend-exclusive evidence unavailable
  | 'module_error';                     // unexpected; logged, not contracted

export type Evaluability<F> =
  | { readonly status: 'evaluated'; readonly findings: F }
  | { readonly status: 'unevaluable'; readonly reason: UnevaluableReason };

/* ────────────────────────────────────────────────────────────────────────
 * 3. CONSISTENCY ASSESSMENT
 *
 * ECE module specs require a Consistency Assessment in every Evaluation
 * Result. Domain Model §8.3.5 constrains it hard: it assesses coherence
 * of findings WITHIN the module's own domain ONLY. It is NOT confidence,
 * NOT probability, NOT a risk judgement.
 * ──────────────────────────────────────────────────────────────────────── */

export type ConsistencyAssessment =
  | 'consistent'      // findings within this domain cohere
  | 'inconsistent'    // findings within this domain conflict
  | 'indeterminate';  // insufficient evidence to assess coherence

/* ────────────────────────────────────────────────────────────────────────
 * 4. SECURITY INDICATORS vs FINDINGS
 *
 * Domain Model §8.3.5 separates these and the separation is load-bearing:
 *
 *   Detected Security Indicators — named observations recognised within the
 *   module's domain. Enumerable, human-readable, surfaced in explanations.
 *
 *   Evaluation Findings — the STRUCTURED analytical output. This is what
 *   rule predicates read. Typed per module.
 *
 * Rules predicate on FINDINGS, never on indicator strings.
 * ──────────────────────────────────────────────────────────────────────── */

export interface SecurityIndicator {
  readonly id: string;              // stable, e.g. "loginForm.offOriginAction"
  readonly moduleId: ModuleId;
  readonly detail: string | null;   // human-readable; NOT machine-consumed
}

/* ────────────────────────────────────────────────────────────────────────
 * 5. PER-MODULE FINDINGS
 *
 * Design rule: modules report OBSERVED FACTS in structured form. They do not
 * apply predicate refinements. R-01 (same-site) is applied at Stage 2 by the
 * rule, not at Stage 1 by the module — so modules report registrable domains
 * and let the rule compare them. A module that compared them would be
 * performing correlation (ECE prohibition).
 * ──────────────────────────────────────────────────────────────────────── */

export interface UrlFindings {
  readonly scheme: string;
  readonly isSecureScheme: boolean;          // CRED-06 reads this
  readonly registrableDomain: string | null;
  readonly subdomainDepth: number;
  readonly isIpLiteral: boolean;
  readonly totalLength: number;
  readonly suspiciousKeywordCount: number;
  readonly percentEncodedSegmentCount: number;
  readonly specialCharacterDensity: number;
}

export interface SslFindings {
  readonly httpsEstablished: boolean;
  readonly certificateCurrentlyValid: boolean | null;
  readonly chainComplete: boolean | null;
  readonly chainTrusted: boolean | null;
  readonly subjectMatchesHost: boolean | null;
  readonly daysUntilExpiry: number | null;
}

export interface DnsFindings {
  readonly resolves: boolean;
  readonly aRecordCount: number;
  readonly aaaaRecordCount: number;
  readonly nameServerCount: number;
  readonly cnamePresent: boolean;
  readonly mxPresent: boolean;
  readonly dnssecDeployed: boolean;
}

export interface RedirectFindings {
  readonly hopCount: number;                       // CRED-04
  readonly initialRegistrableDomain: string | null;
  readonly finalRegistrableDomain: string | null;
  readonly mechanisms: readonly RedirectMechanism[];
  readonly chainLength: number;
}

export interface LoginFormFinding {
  readonly fieldKinds: readonly CredentialFieldKind[];
  readonly method: FormMethod;
  readonly actionRegistrableDomain: string | null;   // CRED-01, CRED-07
  readonly hasHiddenCredentialField: boolean;        // CRED-07
  readonly hasAutocompleteDisabledCredential: boolean;
  readonly injectedAfterLoad: boolean;               // CRED-A1
}

export interface LoginFormFindings {
  readonly credentialFormPresent: boolean;           // CRED-01..07 gate
  readonly forms: readonly LoginFormFinding[];
  readonly pageRegistrableDomain: string | null;
}

export interface JavaScriptFindings {
  readonly listenerOnCredentialField: boolean;          // CRED-05
  readonly clientSideTransmissionObserved: boolean;     // CRED-05
  readonly transmissionEndpointDomains: readonly string[];
  readonly dynamicScriptLoadCount: number;
  readonly credentialInterfaceInjected: boolean;        // CRED-A1
  readonly injectingScriptOriginDomain: string | null;  // CRED-A1
}

export interface HomographFindings {
  readonly isIdn: boolean;                 // CRED-03
  readonly containsNonAscii: boolean;      // CRED-03
  readonly isMixedScript: boolean;         // CRED-03 — weighted higher than
                                           // non-ASCII alone (§7.2 limitation)
  readonly scriptsUsed: readonly string[];
  readonly confusableSkeleton: string | null;
}

/**
 * ACEM findings (§20.11).
 *
 * Reports the observed authentication context. Applies NO threshold —
 * τ_sim lives in the rule set and is applied by CRED-02 at Stage 2. The
 * module reports the similarity SCORE; the rule decides what it means.
 * That split is what keeps τ_sim versioned with the rule set while the
 * similarity computation stays module implementation (§13.2).
 */
export interface AuthContextFindings {
  readonly originPresent: boolean;                    // CRED-02
  readonly lifecycleState: 'PROVISIONAL' | 'ESTABLISHED' | null;
  /** For a present origin: drift against current-version revisions. */
  readonly fingerprintDrift: number | null;
  /** For an absent origin: highest-similarity ESTABLISHED entry elsewhere. */
  readonly bestCrossOriginMatch: {
    readonly origin: Origin;                          // CRED-02
    readonly registrableDomain: string;
    readonly similarity: number;                      // CRED-02, vs τ_sim
  } | null;
  readonly storeAvailable: boolean;                   // §15.2 capability set
}

/**
 * Download Context findings (§2.6).
 *
 * Reports the observed delivery context. Applies NO membership test against
 * the executable set — R-02 is a predicate refinement applied at Stage 2
 * (§5.3), not a module responsibility. The module reports the classification
 * inputs; the rule decides membership.
 */
export interface DownloadContextFindings {
  readonly declaredExtension: string | null;        // DL-02
  readonly declaredMimeType: string | null;         // DL-02
  readonly extensionMimeConsistent: boolean | null; // DL-02
  readonly hasCompoundExtension: boolean;           // DL-02
  readonly downloadRegistrableDomain: string | null; // DL-01
  readonly referrerRegistrableDomain: string | null; // DL-01
  readonly referrerPresent: boolean;                 // DL-01 (no referrer ⇒ no match)
}

/**
 * Permission Context findings (§2.6).
 *
 * Applies NO membership test against the sensitive-permission set — R-03 is
 * applied at Stage 2 (§5.4).
 */
export interface PermissionContextFindings {
  readonly requestedPermission: SensitivePermission | null;  // PM-01
  readonly requestingRegistrableDomain: string | null;
  readonly precededByUserGesture: boolean | null;            // PM-01
  readonly pageAgeMs: number | null;                         // PM-01
}

/* ────────────────────────────────────────────────────────────────────────
 * 6. FINDINGS UNION
 * ──────────────────────────────────────────────────────────────────────── */

export interface FindingsByModule {
  readonly url: UrlFindings;
  readonly ssl: SslFindings;
  readonly dns: DnsFindings;
  readonly redirect: RedirectFindings;
  readonly loginForm: LoginFormFindings;
  readonly javascript: JavaScriptFindings;
  readonly homograph: HomographFindings;
  readonly authContext: AuthContextFindings;
  readonly downloadContext: DownloadContextFindings;
  readonly permissionContext: PermissionContextFindings;
}

/* ────────────────────────────────────────────────────────────────────────
 * 7. EVALUATION ENVELOPE
 *
 * Common Representation Elements (Domain Model §7.3) + Domain Representation
 * Elements (§8.3.5).
 * ──────────────────────────────────────────────────────────────────────── */

export interface EvidenceRef {
  readonly evidenceId: string;
  readonly category: string;
}

export interface SecurityEvaluation<M extends ModuleId = ModuleId> {
  /* Common Representation Elements — §7.3 */
  readonly evaluationId: string;                  // Contract Identity
  readonly contractVersion: typeof EVALUATION_CONTRACT_VERSION;

  /* Domain Representation Elements — §8.3.5 */
  readonly targetResourceId: TargetResourceId;
  readonly analysisSessionId: AnalysisSessionId;
  readonly passOrdinal: number;
  readonly moduleId: M;
  readonly moduleVersion: string;

  /** §6.3: every evaluation SHALL reference its supporting evidence. */
  readonly evidenceRefs: readonly EvidenceRef[];

  readonly result: Evaluability<FindingsByModule[M]>;
  readonly indicators: readonly SecurityIndicator[];
  readonly consistency: ConsistencyAssessment;
  readonly summary: string;                       // Evaluation Summary

  readonly collectionContext: CollectionContext;
}

export type AnySecurityEvaluation = {
  [M in ModuleId]: SecurityEvaluation<M>
}[ModuleId];

/** The complete Stage 1 output for one pass: one evaluation per module. */
export type EvaluationSet = Readonly<Record<ModuleId, AnySecurityEvaluation>>;

/* ────────────────────────────────────────────────────────────────────────
 * 8. INVARIANTS
 *
 * E-1  One evaluation originates from exactly one module (§8.3.7).
 * E-2  A module MUST NOT read another module's evaluation (ECE prohibition).
 * E-3  A module MUST NOT assign confidence, classify the target, or produce
 *      a Security Decision (ECE prohibition, all modules).
 * E-4  A module MUST NOT apply predicate refinements. It reports registrable
 *      domains; the RULE compares them at Stage 2. Comparing them inside a
 *      module would be correlation.
 * E-5  Every evaluation references its supporting evidence (§6.3).
 * E-6  `unevaluable` is a produced evaluation, not a missing one. Stage 2
 *      MUST distinguish it from evaluated-with-negative-findings.
 * E-7  Evaluations are immutable once created (§2.2).
 * E-8  Exactly one evaluation per module per pass. Never zero, never two.
 * E-9  The ACEM applies no threshold. τ_sim belongs to the rule set (§13.2).
 * E-10 Evaluations are deterministic: identical evidence + identical module
 *      version MUST produce identical findings (§4.3).
 * ──────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────
 * 9. GAP-4 — RESOLVED at Specification v0.6
 *
 * DL-01, DL-02 and PM-01 declared required evaluations from Download and
 * Permission sources that no module produced. Resolved by naming the
 * Download Context and Permission Context Evaluation Modules (§2.6).
 *
 * The module register is now CLOSED at ten members. A rule MUST NOT
 * reference an evaluation source absent from `ModuleId`. A static check
 * SHALL enforce this at rule-set release (D0.3).
 *
 * No rule predicate, weight, tier, type, or parent changed. Rule set
 * remains frozen at rules-v0.1.
 * ──────────────────────────────────────────────────────────────────────── */
