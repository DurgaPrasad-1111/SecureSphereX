/**
 * SecureSphere X — Evidence Contract v1  (D0.1)
 *
 * Conforms to: Specification v0.4, Domain Model §5.2 / §8.2, Rule Engine §15.2
 * Package:     packages/contracts
 * Owner:       Role A + Role C jointly (two producers, one shape)
 * Consumers:   Role B (all eight Internal Evaluation Modules)
 *
 * FROZEN at Stage 0. Changes require unanimous agreement and a version bump.
 */

export const EVIDENCE_CONTRACT_VERSION = '1.1.0' as const;

/* ────────────────────────────────────────────────────────────────────────
 * 0. ORIGIN — BRANDED PRIMITIVE
 *
 * Rule Engine §20.3 prohibits the Authentication History Store from holding
 * full URLs, paths, query strings, or fragments. That prohibition is enforced
 * STRUCTURALLY rather than by discipline: D0.8 accepts `Origin`, never
 * `string`, so a URL cannot reach the store write path without a compile
 * error.
 *
 * Derivation happens collector-side. The store never receives a URL to
 * discard.
 * ──────────────────────────────────────────────────────────────────────── */

declare const OriginBrand: unique symbol;

/** scheme://host[:port] — never a path, query, or fragment. */
export type Origin = string & { readonly [OriginBrand]: true };

/**
 * Sole constructor for `Origin`. Discards path, query, and fragment.
 * Returns null for inputs that have no meaningful origin (e.g. `about:blank`).
 */
export function toOrigin(url: string): Origin | null {
  try {
    const u = new URL(url);
    if (!u.protocol || !u.host) return null;
    return `${u.protocol}//${u.host}` as Origin;
  } catch {
    return null;
  }
}
/* ────────────────────────────────────────────────────────────────────────
 * IDENTIFIER BRANDS (Annex A-3, DEC-3)
 *
 * Four identifier types are branded so they cannot be interchanged at a
 * call site. Unbranded, each is a bare `string`: passing an
 * `analysisSessionId` where a `findingId` is expected compiles silently.
 *
 * Declared here because this file is the dependency-graph root — it
 * imports nothing, so no import cycle is possible.
 * ──────────────────────────────────────────────────────────────────────── */

declare const AnalysisSessionIdBrand: unique symbol;
declare const TargetResourceIdBrand: unique symbol;
declare const PassResultIdBrand: unique symbol;
declare const FindingIdBrand: unique symbol;
declare const DayStampBrand: unique symbol;

/** Identifies an Analysis Session. */
export type AnalysisSessionId = string & { readonly [AnalysisSessionIdBrand]: true };
/** Identifies the resource under analysis. */
export type TargetResourceId = string & { readonly [TargetResourceIdBrand]: true };

/** Identifies an Analysis Pass Result. */
export type PassResultId = string & { readonly [PassResultIdBrand]: true };

/** Identifies a single Finding. */
export type FindingId = string & { readonly [FindingIdBrand]: true };

/** A calendar date at DAY granularity — 'YYYY-MM-DD' (§20.3). */
export type DayStamp = string & { readonly [DayStampBrand]: true };
/* ────────────────────────────────────────────────────────────────────────
 * 1. OBSERVATION TRI-STATE
 *
 * Rule Engine §15.2 requires `unevaluable(reason)` to be distinguishable
 * from "no finding". That distinction must originate here or it cannot
 * exist downstream.
 *
 *   present      — observed, value known
 *   absent       — observed, and the thing is genuinely not there
 *   notCollected — NOT observed; we could not look
 *
 * `absent` is a positive finding. `notCollected` is a capability gap and
 * propagates to the capability set of the Analysis Pass Result.
 * ──────────────────────────────────────────────────────────────────────── */

export type Observation<T> =
  | { readonly state: 'present'; readonly value: T }
  | { readonly state: 'absent' }
  | { readonly state: 'notCollected'; readonly reason: NotCollectedReason };

export type NotCollectedReason =
  | 'api_unavailable'        // browser exposes no API for this
  | 'permission_denied'      // extension lacks the required permission
  | 'tier_not_reached'       // Tier 0/1 does not collect this (§3.2)
  | 'network_unreachable'    // backend evidence service down (§15.3)
  | 'timeout'                // collection exceeded its budget (§16.1)
  | 'cross_origin_blocked'   // same-origin policy prevented observation
  | 'collector_error'        // unexpected failure; details logged, not contracted
  | 'policy_suppressed'      // withheld by the two-gate acquisition policy (§10.13.4)
  | 'not_applicable';        // structurally impossible in this context

export const present = <T>(value: T): Observation<T> => ({ state: 'present', value });
export const absent = <T>(): Observation<T> => ({ state: 'absent' });
export const notCollected = <T>(reason: NotCollectedReason): Observation<T> =>
  ({ state: 'notCollected', reason });

/* ────────────────────────────────────────────────────────────────────────
 * 2. COLLECTION CONTEXT   (Domain Model §8.2.5)
 *
 * Supports reproducibility and auditability without altering the meaning
 * of the observed evidence.
 * ──────────────────────────────────────────────────────────────────────── */

export type CollectorKind = 'extension' | 'capture_harness' | 'backend';

export interface CollectionContext {
  readonly collector: CollectorKind;
  readonly collectorVersion: string;
  readonly tier: 0 | 1 | 2;
  readonly passOrdinal: number;          // 1-based within the Analysis Session
  /** Day granularity only. Rule Engine §20.3 — no precise timestamps. */
  readonly collectedOn: DayStamp;          // ISO 8601 date, e.g. "2026-07-25"
  readonly evidenceContractVersion: typeof EVIDENCE_CONTRACT_VERSION;
}

/* ────────────────────────────────────────────────────────────────────────
 * 3. EVIDENCE CATEGORIES   (Domain Model §8.2.5)
 *
 * One category per consuming Internal Evaluation Module. A category is
 * NOT a module — it is the classification of the observation. The mapping
 * happens to be 1:1 at v0.4.
 * ──────────────────────────────────────────────────────────────────────── */

export type EvidenceCategory =
  | 'url'
  | 'transport'          // SSL/TLS
  | 'dns'
  | 'redirect'
  | 'loginInterface'     // login form structure AND page fingerprint
  | 'scriptRuntime'
  | 'domainRepresentation'
  | 'downloadContext'
  | 'permissionContext';

/* ────────────────────────────────────────────────────────────────────────
 * 4. PER-CATEGORY EVIDENCE
 * ──────────────────────────────────────────────────────────────────────── */

export interface UrlEvidence {
  readonly fullUrl: Observation<string>;
  readonly scheme: Observation<string>;
  readonly host: Observation<string>;
  readonly port: Observation<number>;
  readonly path: Observation<string>;
  readonly queryPresent: Observation<boolean>;
  readonly registrableDomain: Observation<string>;   // eTLD+1, PSL-resolved (R-01)
  readonly subdomainLabels: Observation<readonly string[]>;
  readonly isIpLiteral: Observation<boolean>;
  readonly totalLength: Observation<number>;
  readonly percentEncodedSegmentCount: Observation<number>;
}

export interface TransportEvidence {
  readonly isHttps: Observation<boolean>;
  readonly certificateSubject: Observation<string>;
  readonly subjectAlternativeNames: Observation<readonly string[]>;
  readonly validFrom: Observation<string>;           // ISO date
  readonly validTo: Observation<string>;             // ISO date
  readonly issuer: Observation<string>;
  readonly chainComplete: Observation<boolean>;
  readonly chainTrusted: Observation<boolean>;
}

export interface DnsEvidence {
  readonly resolves: Observation<boolean>;
  readonly aRecordCount: Observation<number>;
  readonly aaaaRecordCount: Observation<number>;
  readonly nameServers: Observation<readonly string[]>;
  readonly cnameTarget: Observation<string>;
  readonly mxPresent: Observation<boolean>;
  readonly txtRecordCount: Observation<number>;
  readonly dnssecDeployed: Observation<boolean>;
}

export type RedirectMechanism = 'http_3xx' | 'javascript' | 'meta_refresh' | 'unknown';

export interface RedirectHop {
  readonly fromUrl: string;
  readonly toUrl: string;
  readonly mechanism: RedirectMechanism;
  readonly statusCode: number | null;
}

export interface RedirectEvidence {
  readonly initialUrl: Observation<string>;
  readonly finalUrl: Observation<string>;
  readonly chain: Observation<readonly RedirectHop[]>;
  readonly hopCount: Observation<number>;
  readonly crossedRegistrableDomain: Observation<boolean>;
}

export type CredentialFieldKind = 'password' | 'otp' | 'pin' | 'username' | 'email';
export type FormMethod = 'GET' | 'POST' | 'OTHER';

export interface CredentialField {
  readonly kind: CredentialFieldKind;
  readonly hidden: boolean;
  readonly autocompleteDisabled: boolean;
}

export interface LoginFormObservation {
  readonly fields: readonly CredentialField[];
  readonly method: FormMethod;
  readonly actionUrl: string | null;
  readonly actionRegistrableDomain: string | null;
  readonly injectedAfterLoad: boolean;
  readonly injectingScriptOrigin: string | null;
}

/**
 * Login-interface fingerprint (Rule Engine §7.2, §20.7).
 *
 * Feature classes are chosen for stability under redesign and difficulty of
 * variation under impersonation. Raw DOM structure is deliberately excluded —
 * too brittle.
 *
 * This is EVIDENCE, not store content. It describes the CURRENT page.
 * The Authentication History Store is the ACEM's reference data (§20.11).
 */
export interface LoginFingerprint {
  readonly fingerprintAlgorithmVersion: string;
  readonly fieldComposition: readonly CredentialFieldKind[];  // ordered
  readonly titleTokens: readonly string[];
  readonly faviconHash: string | null;
  readonly heroImagePerceptualHash: string | null;
  readonly dominantColors: readonly string[];
}

export interface LoginInterfaceEvidence {
  readonly credentialFormPresent: Observation<boolean>;
  readonly forms: Observation<readonly LoginFormObservation[]>;
  readonly fingerprint: Observation<LoginFingerprint>;
}

export interface ScriptRuntimeEvidence {
  readonly listenerOnCredentialField: Observation<boolean>;
  readonly clientSideTransmissionObserved: Observation<boolean>;
  readonly transmissionEndpoints: Observation<readonly string[]>;
  readonly dynamicScriptLoadCount: Observation<number>;
  readonly dynamicScriptOrigins: Observation<readonly string[]>;
  readonly credentialInterfaceInjected: Observation<boolean>;
}

export interface DomainRepresentationEvidence {
  readonly unicodeDomain: Observation<string>;
  readonly punycodeDomain: Observation<string>;
  readonly isIdn: Observation<boolean>;
  readonly containsNonAscii: Observation<boolean>;
  readonly scriptsUsed: Observation<readonly string[]>;   // Unicode script names
  readonly isMixedScript: Observation<boolean>;
  readonly confusableSkeleton: Observation<string>;
}

export interface DownloadContextEvidence {
  readonly downloadUrl: Observation<string>;
  readonly downloadRegistrableDomain: Observation<string>;
  readonly referrerUrl: Observation<string>;
  readonly referrerRegistrableDomain: Observation<string>;
  readonly declaredFilename: Observation<string>;
  readonly declaredExtension: Observation<string>;
  readonly declaredMimeType: Observation<string>;
  readonly hasCompoundExtension: Observation<boolean>;
}

export type SensitivePermission =
  | 'camera' | 'microphone' | 'geolocation' | 'notifications' | 'clipboard_read';

export interface PermissionContextEvidence {
  readonly requestedPermission: Observation<SensitivePermission>;
  readonly requestingOrigin: Observation<string>;
  readonly precededByUserGesture: Observation<boolean>;
  readonly pageAgeMs: Observation<number>;
}

/* ────────────────────────────────────────────────────────────────────────
 * 5. EVIDENCE ENVELOPE   (Domain Model §8.2.5)
 * ──────────────────────────────────────────────────────────────────────── */

export interface EvidenceByCategory {
  readonly url: UrlEvidence;
  readonly transport: TransportEvidence;
  readonly dns: DnsEvidence;
  readonly redirect: RedirectEvidence;
  readonly loginInterface: LoginInterfaceEvidence;
  readonly scriptRuntime: ScriptRuntimeEvidence;
  readonly domainRepresentation: DomainRepresentationEvidence;
  readonly downloadContext: DownloadContextEvidence;
  readonly permissionContext: PermissionContextEvidence;
}

/**
 * Complete Security Evidence for one analysis pass.
 *
 * Immutable on creation (Domain Model §5.2). Every category is always
 * present as an object; individual fields carry their own tri-state.
 * A module never receives a missing category — it receives a category
 * whose fields are `notCollected`.
 */
export interface SecurityEvidence {
  readonly targetResourceId: TargetResourceId;      // stable across the Session (§3.1)
  readonly analysisSessionId: AnalysisSessionId;
  readonly evidenceId: string;
  readonly collectionContext: CollectionContext;
  readonly evidence: EvidenceByCategory;
}

/* ────────────────────────────────────────────────────────────────────────
 * 6. PRODUCER CAPABILITY MANIFEST
 *
 * Identical raw values across producers is impossible: the capture harness
 * resolves DNS and certificate chains; the extension cannot. Conformance is
 * therefore defined as SEMANTIC EQUIVALENCE over declared shared capability,
 * not as byte equality over all fields.
 * ──────────────────────────────────────────────────────────────────────── */

export type EvidenceFieldPath = string;   // e.g. "transport.chainTrusted"

export interface ProducerCapabilityManifest {
  readonly collector: CollectorKind;
  readonly collectorVersion: string;
  /** Fields this producer CAN populate. */
  readonly capable: readonly EvidenceFieldPath[];
  /** Fields this producer CANNOT populate, with the permanent reason. */
  readonly incapable: readonly {
    readonly field: EvidenceFieldPath;
    readonly reason: NotCollectedReason;
  }[];
}

/**
 * Conformance classification for a field or rule.
 *
 * SHARED           — both producers capable; values MUST be equal on the same
 *                    input. This is where drift actually surfaces.
 * PRODUCER_EXCLUSIVE — only one producer can populate it. No cross-producer
 *                    comparison is possible or required.
 * DIVERGENT        — both producers capable, but observing different things.
 *                    Comparable in shape, NOT in value.
 */
export type ConformanceClass = 'SHARED' | 'PRODUCER_EXCLUSIVE' | 'DIVERGENT';

/**
 * Known classifications at contract v1. Consequences for validation strategy:
 *
 *  - `downloadContext` and `permissionContext` are extension-exclusive. The
 *    harness cannot simulate a download initiation or a permission prompt,
 *    so DL-01, DL-02 and PM-01 are NOT corpus-validatable and REQUIRE
 *    in-browser testing. Stage 2's confusion matrix covers the CRED family
 *    only, by construction.
 *
 *  - `redirect` is DIVERGENT: the harness observes server-side chains the
 *    extension may never see; the extension observes client-side navigation
 *    the harness may collapse. CRED-04's offline recall does NOT transfer
 *    cleanly to the browser and MUST be reported separately.
 *
 *  - `transport` and `dns` are harness-exclusive at Tier 0/1 by §16.1, which
 *    prohibits network I/O there.
 */
export const CONFORMANCE_CLASSES: Readonly<Record<EvidenceCategory, ConformanceClass>> = {
  url: 'SHARED',
  loginInterface: 'SHARED',
  domainRepresentation: 'SHARED',
  scriptRuntime: 'SHARED',
  redirect: 'DIVERGENT',
  transport: 'PRODUCER_EXCLUSIVE',
  dns: 'PRODUCER_EXCLUSIVE',
  downloadContext: 'PRODUCER_EXCLUSIVE',
  permissionContext: 'PRODUCER_EXCLUSIVE',
} as const;

/* ────────────────────────────────────────────────────────────────────────
 * 7. INVARIANTS  — enforced by test, not by the type system
 *
 * I-1  Evidence is immutable once constructed.
 * I-2  A producer MUST NOT emit `absent` where it means `notCollected`.
 *      Conflating them silently converts a capability gap into a clean
 *      bill of health (Rule Engine §15.1).
 * I-3  Tier 0 and Tier 1 evidence MUST have `notCollected('tier_not_reached')`
 *      for every field requiring network I/O (§16.1 prohibits it).
 * I-4  `collectedOn` is day-granularity. No field carries a precise timestamp
 *      except `pageAgeMs`, which is a duration, not a wall-clock time.
 * I-5  Both producers (extension, capture harness) MUST satisfy the same
 *      conformance suite. This is what makes offline validation meaningful.
 * I-6  A producer MUST NOT emit `present` for a field its manifest declares
 *      incapable, nor `notCollected('api_unavailable')` for one it declares
 *      capable. Catches silent capability drift.
 * I-7  For SHARED-class fields, both producers MUST yield EQUAL values on the
 *      same input page.
 * I-8  For rules whose predicates depend only on SHARED-class fields, both
 *      producers MUST yield IDENTICAL findings on the same page. This is the
 *      property that makes offline validation transferable to the browser.
 * I-9  Only `toOrigin()` constructs an `Origin`. No cast, no assertion. The
 *      store write path (D0.8) accepts `Origin` exclusively (§20.3).
 * ──────────────────────────────────────────────────────────────────────── */
