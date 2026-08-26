/**
 * SecureSphere X — Rule-set File Format v1  (D0.3)
 *
 * Conforms to: Specification v0.6 §12 (rules are data), §18 (metadata),
 *              §5 (refinements), §6 (suppression), §9 (aggregation),
 *              §10 (subsumption), §14 (versioning & lifecycle)
 * Package:     packages/contracts
 * Owner:       Role B
 * Consumers:   Rule engine (Role B), replay harness, calibration tooling
 *              (Role C), release gate (§17.2)
 *
 * The SERIALIZED form is JSON. This file defines its schema.
 * §12.1: weights SHALL NOT be hard-coded. Nothing here is compiled in.
 */

import type { ModuleId } from './evaluation.contract.v1';

export const RULESET_FORMAT_VERSION = '1.1.0' as const;

/* ────────────────────────────────────────────────────────────────────────
 * 1. FINDING PATHS
 *
 * A predicate reads typed fields from the EvaluationSet. Paths are
 * "<moduleId>.<field>" and MUST resolve against D0.2's FindingsByModule.
 * A static check validates every path at release (§8, V-2).
 * ──────────────────────────────────────────────────────────────────────── */

export type FindingPath = `${ModuleId}.${string}`;

/**
 * Reference to the item bound by an `exists` quantifier.
 *
 * `'$'`        — the bound item itself (scalar collections)
 * `'$.field'`  — a field of the bound item (object collections)
 *
 * Valid ONLY inside an `exists.where` subtree; enforced by static check V-13.
 *
 * ADDED at contract v1.1.0. Without a binding mechanism the `exists`
 * quantifier could not reference the item it bound, and CRED-01, CRED-05 and
 * CRED-07 were inexpressible. Confirmed by compilation, not by inspection.
 */
export type ItemPath = '$' | `$.${string}`;

/** Any readable operand: a module finding, or the bound item inside `exists`. */
export type ValuePath = FindingPath | ItemPath;

/** Paths into repeated sub-structures, used with the `exists` quantifier. */
export type CollectionPath =
  | 'loginForm.forms'
  | 'javascript.transmissionEndpointDomains';

/* ────────────────────────────────────────────────────────────────────────
 * 2. PARAMETERS
 *
 * Every empirical value in §13.2 lives here, never inline in a predicate.
 * Calibration (Role C) edits this table and nothing else — which is what
 * makes a PATCH-level change (§14.1) provably scope-limited.
 * ──────────────────────────────────────────────────────────────────────── */

export type ParameterId =
  | 'tau_sim'                     // CRED-02 fingerprint similarity threshold
  | 'redirect_hop_min'            // CRED-04
  | 'page_age_max_ms'             // PM-01
  | 'threshold_medium'            // §9.4
  | 'threshold_high'              // §9.4
  | 'tau_collision'               // G-03 store write guard
  | 'auth_count_n'                // §20.4 PROVISIONAL → ESTABLISHED
  | 'auth_days_m'                 // §20.4
  | 'provisional_expiry_days'     // §20.4
  | 'trust_validity_days'         // A-01
  | 'establishment_rate_max';     // G-05

export interface ParameterDefinition {
  readonly id: ParameterId;
  readonly value: number;
  readonly unit: string;
  readonly rationale: string;
  /** Unvalidated at rules-v0.1 by definition (§18.2). */
  readonly confidence: EmpiricalConfidence;
}

/* ────────────────────────────────────────────────────────────────────────
 * 3. REFINEMENT SETS   (§5.2 – §5.5)
 *
 * Membership lists for R-02 and R-03, plus the S-02 IdP registry. Data,
 * not code — and bundled WITH the rule set, so registry unavailability is
 * rule-set unavailability (§15.3), never a runtime fetch.
 * ──────────────────────────────────────────────────────────────────────── */

export type RefinementSetId =
  | 'executableTypes'        // R-02
  | 'sensitivePermissions'   // R-03
  | 'identityProviders';     // S-02 registry

export interface RefinementSet {
  readonly id: RefinementSetId;
  readonly members: readonly string[];
  readonly matchMode: 'exact';   // §6.3: exact equality ONLY.
                                 // Never substring, suffix, or similarity.
  readonly rationale: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * 4. PREDICATE AST
 *
 * A small CLOSED operator set. Closed because §17.5 requires a static
 * release check, and an open expression language cannot be statically
 * validated for totality or determinism.
 *
 * Every operator is total and side-effect free.
 * ──────────────────────────────────────────────────────────────────────── */

export type Predicate =
  /** Reads a boolean finding field. */
  | { readonly op: 'is'; readonly path: ValuePath }
  | { readonly op: 'not'; readonly operand: Predicate }
  | { readonly op: 'and'; readonly operands: readonly Predicate[] }
  | { readonly op: 'or'; readonly operands: readonly Predicate[] }

  /** Numeric comparison against a PARAMETER — never a literal. */
  | { readonly op: 'gte' | 'lte' | 'gt' | 'lt';
      readonly path: ValuePath; readonly param: ParameterId }

  /** Equality against a literal (enums, not tunable values). */
  | { readonly op: 'eq' | 'neq'; readonly path: ValuePath;
      readonly value: string | number | boolean | null }

  /** R-01 same-site determination over two registrable-domain fields. */
  | { readonly op: 'sameSite' | 'notSameSite';
      readonly left: ValuePath; readonly right: ValuePath }

  /** R-02 / R-03 membership. */
  | { readonly op: 'inSet'; readonly path: ValuePath;
      readonly set: RefinementSetId }

  /** Existential quantifier over a repeated structure. `$` binds the item. */
  | { readonly op: 'exists'; readonly collection: CollectionPath;
      readonly where: Predicate }

  /**
   * DL-01 only. True when at least one primary finding with non-zero
   * effective weight exists in a PRIOR COMMITTED PASS of the current
   * Analysis Session.
   *
   * Reads committed state only — never the in-flight finding set. This is
   * what keeps Stage 2 free of intra-pass ordering dependency and keeps
   * the pass a pure function of (evaluations, rule set, prior state).
   *
   * See INTERPRETATION NOTE in §9.
   */
  | { readonly op: 'priorFindingActive' };

/* ────────────────────────────────────────────────────────────────────────
 * 5. RULE DEFINITION   (§7, §18.1)
 * ──────────────────────────────────────────────────────────────────────── */

export type RuleId = string;                        // e.g. "CRED-01"
export type RuleFamily = 'CRED' | 'DL' | 'PM' | 'JS';
export type RuleType = 'primary' | 'aggravator';
export type LifecycleState = 'Proposed' | 'Active' | 'Deprecated' | 'Retired';
export type EmpiricalConfidence = 'Unvalidated' | 'Provisional' | 'Validated';
export type Tier = 0 | 1 | 2;

export interface RuleDefinition {
  readonly id: RuleId;
  readonly family: RuleFamily;
  readonly name: string;
  readonly type: RuleType;

  /** Aggravators only. Contributes solely when the parent is present,
   *  unsubsumed, and has non-zero effective weight (§9.3). */
  readonly parent: RuleId | null;

  readonly predicate: Predicate;

  /**
   * Modules whose evaluations the predicate reads.
   *
   * CRITICAL (§15.2): if ANY required module is `unevaluable` for this pass,
   * the rule outcome is `unevaluable` — NOT a non-match. A rule that could
   * not be tested MUST NOT be recorded as a rule that found nothing.
   */
  readonly requiredModules: readonly ModuleId[];

  readonly baseWeight: number;
  readonly tier: Tier;
  /** Tier at which the rule may contribute to an intervening decision. */
  readonly interveningTier: Tier;

  /* §18.1 metadata */
  readonly owner: string;
  readonly introducedIn: string;
  readonly lastModifiedIn: string;
  readonly lifecycleState: LifecycleState;
  readonly rationale: string;
  readonly empiricalConfidence: EmpiricalConfidence;
  readonly knownFalsePositiveRisks: readonly string[];
  readonly knownLimitations: readonly string[];
  readonly cweMappings: readonly string[];
  readonly capecMappings: readonly string[];
  // No MITRE ATT&CK — §18.3, non-discriminating at this granularity.
}

/* ────────────────────────────────────────────────────────────────────────
 * 6. SUPPRESSION DEFINITION   (§6)
 * ──────────────────────────────────────────────────────────────────────── */

export type SuppressionId = string;                 // "S-01", "S-02", "A-01"
export type SuppressionMechanism = 'exemption' | 'allowlist';

export interface SuppressionTarget {
  readonly ruleId: RuleId;
  /** 0 < reduction ≤ 1. 1.0 nullifies; 0.5 halves. */
  readonly reduction: number;
}

export interface SuppressionDefinition {
  readonly id: SuppressionId;
  readonly mechanism: SuppressionMechanism;
  readonly purpose: string;

  /** ALL guards must hold for the suppression to apply (§6.1). */
  readonly guards: readonly Predicate[];

  /**
   * Negative guards: if ANY holds, the suppression does NOT apply.
   * S-02's CRED-03 guard lives here — without it, a confusable lookalike
   * of a registry entry would obtain automatic exemption from CRED-01.
   */
  readonly blockedBy: readonly RuleId[];

  readonly targets: readonly SuppressionTarget[];
  readonly neverApplies: readonly RuleId[];

  readonly rationale: string;
  readonly introducedIn: string;
  readonly lastModifiedIn: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * 7. RULE-SET FILE
 * ──────────────────────────────────────────────────────────────────────── */

export interface SubsumptionEntry {
  readonly composite: RuleId;
  readonly subsumes: readonly RuleId[];
}

export interface RuleSet {
  readonly formatVersion: typeof RULESET_FORMAT_VERSION;

  /** §14.1 semantic version, e.g. "rules-v0.1.0". */
  readonly ruleSetVersion: string;
  readonly released: boolean;
  /** §12.2: a released version is immutable. Integrity is checked at load;
   *  failure is fail-closed (§15.3). */
  readonly integrityDigest: string;

  readonly parameters: readonly ParameterDefinition[];
  readonly refinementSets: readonly RefinementSet[];
  readonly rules: readonly RuleDefinition[];
  readonly suppressions: readonly SuppressionDefinition[];

  /** §10.4: intentionally empty at rules-v0.1. The MECHANISM ships;
   *  the table does not. Adding composites is then a data change. */
  readonly subsumption: readonly SubsumptionEntry[];

  readonly changeLog: readonly {
    readonly version: string;
    readonly kind: 'MAJOR' | 'MINOR' | 'PATCH';
    readonly summary: string;
  }[];
}

/* ────────────────────────────────────────────────────────────────────────
 * 8. STATIC VALIDATION — RELEASE GATE (§17.2, §17.5)
 *
 * A rule set failing ANY check SHALL NOT be released.
 *
 * V-1  Every `requiredModules` member exists in ModuleId. The register is
 *      closed at ten (§2.6) — this is the check that would have caught GAP-4.
 * V-2  Every FindingPath resolves against D0.2's FindingsByModule.
 * V-3  Every ParameterId referenced by a predicate is defined.
 * V-4  Every RefinementSetId referenced is defined.
 * V-5  Every aggravator has a parent; every parent exists; no aggravator
 *      is another aggravator's parent (no chains).
 * V-6  LAYERED-SECURITY INVARIANT (§1.5, §17.5): no PRIMARY rule's
 *      baseWeight ≥ threshold_high. Machine-checked, because a PATCH-level
 *      weight change can violate it trivially.
 * V-7  Every suppression `reduction` is in (0, 1].
 * V-8  No suppression targets a rule listed in its own `neverApplies`.
 * V-9  Subsumption references only existing rules; no cycles.
 * V-10 Every rule carries complete §18.1 metadata. No empty rationale.
 * V-11 Retired rules remain present (§14.2) and are excluded from evaluation.
 * V-12 Predicate depth is bounded and contains no unreachable branch.
 * V-13 An ItemPath ('$' or '$.field') appears ONLY inside an `exists.where`
 *      subtree, and its field resolves against the element type of the
 *      enclosing CollectionPath.
 * ──────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────
 * 9. INTERPRETATION NOTE — DL-01 `priorFindingActive`
 *
 * §7.2 defines DL-01 as requiring "at least one active unsuppressed finding
 * on the referring Analysis Session".
 *
 * A download initiated from page X is a Tier 2 gate WITHIN X's Analysis
 * Session (§3.2), so the referring session is the CURRENT session. This
 * schema therefore reads `priorFindingActive` against findings committed in
 * EARLIER PASSES of the current session.
 *
 * Reasons for this reading:
 *   - Earlier-pass findings are committed and immutable (§2.2), so the
 *     predicate stays deterministic and replayable.
 *   - Reading the IN-FLIGHT finding set would create intra-pass ordering
 *     dependency, making the aggregation function impure (§9.1) and the
 *     evaluation order-sensitive — both prohibited by §4.3.
 *
 * Consequence: a download initiated at Tier 2 before any Tier 0/1 finding
 * exists cannot match DL-01. This is correct behaviour, not a defect: DL-01
 * exists to flag executables delivered from pages ALREADY carrying findings.
 *
 * CONFIRMED and adopted into Specification v0.7 §7.2. FROZEN.
 * ──────────────────────────────────────────────────────────────────────── */
