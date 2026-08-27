/**
 * Stage 1 Orchestration (§4.2, "Module Evaluation"). Dispatches a
 * SecurityEvidence object to each of the 10 modules' compute*Findings
 * functions and assembles their SecurityEvaluation<M> envelopes.
 *
 * PARTIAL BY DESIGN — see DECISIONS.md DEC-15 (CANDIDATE, open; amended
 * 2026-08-26). Of SecurityEvaluation<M>'s THIRTEEN fields, TWELVE are now
 * constructed for real: `contractVersion`, `targetResourceId`,
 * `analysisSessionId`, `passOrdinal`, `moduleId`, `evidenceRefs`,
 * `collectionContext` (mechanical from the start) plus `evaluationId`
 * (resolved 2026-08-26 — a random UUIDv4, minted once per module dispatch
 * in `evaluateModule` (see id.ts's `mintEvaluationId()`), not inside this
 * function — Stage 3 needs a real one per module and can't wait for a
 * complete envelope;
 * see DEC-15's amendment for the LDD evidence this is based on) — and
 * `result`, which is exactly what each module's own compute*Findings
 * function already returns — plus, as of the Architecture Owner's
 * 2026-08-27 ruling, `moduleVersion` (per-module, `module-versions.ts`),
 * `indicators` (`[]`, the LDD's own sanctioned schema default), and
 * `summary` (an explicitly-labelled interim placeholder, DEC-5's
 * "conformant stub" precedent).
 *
 * ONE REMAINS BLOCKED: `consistency`. Its stated source — "Domain Model
 * §7.3 / §8.3.5" — is a document that is not among the 46 files in spec/,
 * and no amount of re-checking the corpus turned up a coherence-assessment
 * scheme (DEC-15's amendment records the exhaustive re-check in full; it is
 * not re-derived here). Unlike `summary`, it cannot take a self-evidently
 * fake placeholder: `ConsistencyAssessment` admits only three values, and
 * the nearest candidate is defined as a substantive claim —
 * `'indeterminate'  // insufficient evidence to assess coherence` — which
 * would be FALSE on an evaluation whose evidence was complete. See DEC-21
 * and Stage1EnvelopeBlockedError's header.
 *
 * Rather than guess a convention for that one (exactly what DEC-15 says
 * not to do), this file is split into two honest pieces:
 *
 *   `evaluateModule` / `evaluateAllModules` — the dispatch layer. Fully
 *   real, fully working, no blocking: given a SecurityEvidence object,
 *   calls the correct module function with the correct evidence slice and
 *   returns its genuine Evaluability<F> result. This is what §4.2
 *   literally defines Stage 1 as ("each module... emits one Security
 *   Evaluation") — module evaluation, not yet the D0.2 envelope around it.
 *
 *   `assembleSecurityEvaluation` — attempts the full SecurityEvaluation<M>
 *   envelope. Builds the twelve resolved fields for real, then throws
 *   Stage1EnvelopeBlockedError before fabricating `consistency` — the
 *   error carries the genuinely-computed module result and resolved
 *   fields as its payload, so a caller (or a future resumption once
 *   DEC-21 is resolved) can see exactly how far assembly got.
 *
 * Not itself one of the ten modules (§2.6) — it is the layer above them,
 * so unlike a module it is allowed to read across evidence categories
 * (needed for authContext's Origin, below) and is not bound by the
 * single-evidence-category restriction the ten module files document.
 */

// Real (non-type-only) imports need a .ts extension to resolve when this
// file is executed directly (node --experimental-strip-types erases
// `import type` statements entirely before execution — which is why none
// of the ten module files ever needed one, they import only types from
// the contracts — but a genuine runtime import like these must resolve for
// real). Type-only imports below stay extensionless, matching every module
// file's established convention exactly.
import { mintEvaluationId } from './id.ts';
import { MODULE_VERSIONS } from './module-versions.ts';
import { toOrigin } from '../contracts/evidence.contract.v1.ts';
import type { SecurityEvidence } from '../contracts/evidence.contract.v1';
import { EVALUATION_CONTRACT_VERSION } from '../contracts/evaluation.contract.v1.ts';
import type {
  ModuleId, Evaluability, FindingsByModule, EvidenceRef, SecurityIndicator,
} from '../contracts/evaluation.contract.v1';
import type { AuthStoreReader } from '../contracts/boundary.interfaces.v1';

import { computeUrlFindings } from './modules/url.ts';
import { computeSslFindings } from './modules/ssl.ts';
import { computeDnsFindings } from './modules/dns.ts';
import { computeRedirectFindings } from './modules/redirect.ts';
import { computeLoginFormFindings } from './modules/loginForm.ts';
import { computeJavaScriptFindings } from './modules/javascript.ts';
import { computeHomographFindings } from './modules/homograph.ts';
import { computeAuthContextFindings } from './modules/authContext.ts';
import { computeDownloadContextFindings } from './modules/downloadContext.ts';
import { computePermissionContextFindings } from './modules/permissionContext.ts';

/**
 * ModuleId's ten members map onto EvidenceByCategory's nine keys, not
 * one-to-one: `ssl` reads the `transport` category, and `loginForm` and
 * `authContext` both read `loginInterface` (loginForm the form/credential
 * fields, authContext only `fingerprint` — see authContext.ts's header
 * comment). Used below for both dispatch and each envelope's
 * `evidenceRefs.category`.
 */
const EVIDENCE_CATEGORY_BY_MODULE = {
  url: 'url',
  ssl: 'transport',
  dns: 'dns',
  redirect: 'redirect',
  loginForm: 'loginInterface',
  javascript: 'scriptRuntime',
  homograph: 'domainRepresentation',
  authContext: 'loginInterface',
  downloadContext: 'downloadContext',
  permissionContext: 'permissionContext',
} as const satisfies Readonly<Record<ModuleId, string>>;

/**
 * One dispatch result, tagged by `moduleId`. A discriminated union rather
 * than a function generic over `M` — each switch branch below returns its
 * own naturally-correctly-typed variant, so TypeScript checks every case
 * against this type with no `as` cast anywhere (G-2 polices Origin casts
 * specifically, but this file has none at all, matching the zero-cast
 * convention already established across all ten module files).
 */
export type ModuleDispatchResult = {
  [M in ModuleId]: {
    readonly moduleId: M;
    /** Minted here, once per dispatch call — see id.ts's header comment
     * for why evaluationId lives at this layer rather than only inside
     * assembleSecurityEvaluation. Stage 2 never reads this (confirmed:
     * FindingPath resolves only into FindingsByModule); Stage 3 does,
     * to build CorrelationFinding.evaluationRefs. */
    readonly evaluationId: string;
    readonly result: Evaluability<FindingsByModule[M]>;
  };
}[ModuleId];

/**
 * Dispatches ONE category to its module. `storeReader` is required
 * (not optional) even though nine of the ten branches ignore it — no
 * fabricated stand-in is supplied for the caller; per authContext.ts's own
 * fixture test convention, a fake implementing the real AuthStoreReader
 * interface is the caller's responsibility, since no real Authentication
 * History Store implementation exists yet (How-To-Start-Coding.md: "the
 * store does not exist until week 4").
 *
 * authContext is the one case genuinely different from a straight
 * dispatch, per its own header comment: it needs an `Origin`, which its
 * own evidence category (`loginInterface`) has no field to build — Origin
 * is constructed HERE, via `toOrigin()` against `url.fullUrl` (the full
 * URL; NOT `url.registrableDomain`, a different value — authContext.ts's
 * header comment is explicit about this). If `url.fullUrl` is not
 * `present`, or `toOrigin()` rejects it as malformed, authContext cannot
 * be dispatched at all — reported `unevaluable(required_evidence_not_collected)`
 * directly, the same reasoning every module in this package already
 * applies to a missing required input, one layer up.
 */
export async function evaluateModule(
  evidence: SecurityEvidence,
  moduleId: ModuleId,
  storeReader: AuthStoreReader,
): Promise<ModuleDispatchResult> {
  const byCategory = evidence.evidence;
  const evaluationId = mintEvaluationId();

  switch (moduleId) {
    case 'url':
      return { moduleId, evaluationId, result: computeUrlFindings(byCategory.url) };
    case 'ssl':
      return { moduleId, evaluationId, result: computeSslFindings(byCategory.transport) };
    case 'dns':
      return { moduleId, evaluationId, result: computeDnsFindings(byCategory.dns) };
    case 'redirect':
      return { moduleId, evaluationId, result: computeRedirectFindings(byCategory.redirect) };
    case 'loginForm':
      return { moduleId, evaluationId, result: computeLoginFormFindings(byCategory.loginInterface) };
    case 'javascript':
      return { moduleId, evaluationId, result: computeJavaScriptFindings(byCategory.scriptRuntime) };
    case 'homograph':
      return { moduleId, evaluationId, result: computeHomographFindings(byCategory.domainRepresentation) };
    case 'downloadContext':
      return { moduleId, evaluationId, result: computeDownloadContextFindings(byCategory.downloadContext) };
    case 'permissionContext':
      return { moduleId, evaluationId, result: computePermissionContextFindings(byCategory.permissionContext) };
    case 'authContext': {
      const fullUrl = byCategory.url.fullUrl;
      const origin = fullUrl.state === 'present' ? toOrigin(fullUrl.value) : null;
      if (origin === null) {
        return {
          moduleId, evaluationId,
          result: { status: 'unevaluable', reason: 'required_evidence_not_collected' },
        };
      }
      const result = await computeAuthContextFindings(origin, byCategory.loginInterface, storeReader);
      return { moduleId, evaluationId, result };
    }
  }
}

/**
 * Dispatches all ten categories for one SecurityEvidence object. Fully
 * working — no DEC-15 blocking here, since it stops at module Evaluability
 * results and does not attempt the SecurityEvaluation<M> envelope.
 */
export async function evaluateAllModules(
  evidence: SecurityEvidence,
  storeReader: AuthStoreReader,
): Promise<Readonly<Record<ModuleId, ModuleDispatchResult>>> {
  const moduleIds = Object.keys(EVIDENCE_CATEGORY_BY_MODULE) as readonly ModuleId[];
  const entries = await Promise.all(
    moduleIds.map(async (moduleId) => [moduleId, await evaluateModule(evidence, moduleId, storeReader)] as const),
  );
  return Object.fromEntries(entries) as Readonly<Record<ModuleId, ModuleDispatchResult>>;
}

/**
 * The eight SecurityEvaluation<M> fields this file can construct for real.
 * `evaluationId` joined the other seven 2026-08-26 — DEC-15's amendment: a
 * random UUIDv4, matching `spec/Logical-Database-Design-Specification-v1_1.md`
 * §5.13's `evaluation_id: generated` column (the same `UUID / generated /
 * PK` shape as eight sibling primary keys in that document) and the
 * project's general "assigned UUIDv4, no deterministic derivation" rule
 * (LDD line 81) — not a fabricated scheme; see DEC-15 for the full
 * evidence trail and why this specific field was judged safe to resolve
 * without an Architecture Owner ruling (no rule predicate reads
 * `evaluationId`, confirmed by grep against rulesets/rules-v0.1.0.json —
 * zero analytical consequence either way).
 */
export interface MechanicalEnvelopeFields<M extends ModuleId> {
  readonly contractVersion: typeof EVALUATION_CONTRACT_VERSION;
  readonly evaluationId: string;
  readonly targetResourceId: SecurityEvidence['targetResourceId'];
  readonly analysisSessionId: SecurityEvidence['analysisSessionId'];
  readonly passOrdinal: number;
  readonly moduleId: M;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly collectionContext: SecurityEvidence['collectionContext'];

  /* Resolved 2026-08-27 by Architecture Owner ruling — see DEC-15. */

  /** Per-module, from `module-versions.ts`. The shared-engine-constant
   *  option was explicitly rejected: audit and deterministic replay need to
   *  show WHICH module version produced a finding. */
  readonly moduleVersion: string;

  /** The LDD's own schema default (`indicators | JSONB | No | '[]'`). An
   *  empty list is a TRUE statement — "no indicators were derived" — not a
   *  guess at content, which is why this one is safe where `consistency`
   *  is not. The per-module indicator registry remains undesigned. */
  readonly indicators: readonly SecurityIndicator[];

  /** Explicitly-labelled interim placeholder, DEC-5's "conformant stub"
   *  precedent. Deliberately not prose: it must be self-evidently NOT real
   *  Evaluation Summary content, and greppable. Note D0.9's
   *  `ExplanationItem.summary` (boundary.interfaces.v1.ts:152) is a
   *  DIFFERENT, user-facing field keyed by ruleId — nothing wires this one
   *  to it today, and this prefix is what makes it obvious if anyone tries. */
  readonly summary: string;
}

/**
 * Thrown by `assembleSecurityEvaluation` instead of fabricating
 * `consistency` — the ONE field of DEC-15's original five still open after
 * the Architecture Owner's 2026-08-27 ruling.
 *
 * NARROWED 2026-08-27. This error previously named four missing fields.
 * Three were resolved by that ruling: `moduleVersion` (per-module tracking,
 * `module-versions.ts`), `indicators` (`[]`, the LDD's own sanctioned
 * default), and `summary` (an explicitly-labelled interim placeholder, DEC-5
 * "conformant stub" precedent). Only `consistency` remains.
 *
 * WHY `consistency` GETS NO PLACEHOLDER, unlike `summary`. Its type admits
 * exactly three values, and the frozen contract defines the closest
 * candidate as a substantive claim, not a neutral marker:
 * `'indeterminate'  // insufficient evidence to assess coherence`
 * (`evaluation.contract.v1.ts:76`). Stamping that on a fully-evidenced
 * evaluation — the `url` module with all eleven fields present, say — would
 * assert that the evidence was insufficient when it plainly was not. That is
 * a fabricated analytical claim, the same failure shape as DEFECT-22
 * (`not()` fabricating a match), DEC-20 (a skeleton emitted where none was
 * distinct), and the E-6 violation (a rule reporting it found nothing when it
 * was never tested). `summary` is different only because `string` has room
 * for a value that is self-evidently not real content; `ConsistencyAssessment`
 * has no such room.
 *
 * Closing it needs either a genuine per-module coherence-assessment design,
 * or a contract amendment adding a value distinct from `'indeterminate'`'s
 * substantive claim (frozen contract — hand-typed, DEC-3-level). Neither was
 * undertaken. See DEC-21.
 *
 * Carries what WAS genuinely computed — the real module dispatch result and
 * every resolved field — as a diagnostic payload, so a caller can see exactly
 * how far assembly got rather than receiving a bare failure.
 */
export class Stage1EnvelopeBlockedError extends Error {
  readonly moduleId: ModuleId;
  readonly moduleResult: ModuleDispatchResult;
  readonly mechanicalFields: MechanicalEnvelopeFields<ModuleId>;
  readonly missingFields: readonly string[] = ['consistency'];

  constructor(moduleResult: ModuleDispatchResult, mechanicalFields: MechanicalEnvelopeFields<ModuleId>) {
    super(
      `Stage 1 orchestration for module "${moduleResult.moduleId}" cannot construct a complete ` +
      `SecurityEvaluation: "consistency" has no coherence-assessment design, and its nearest ` +
      `enum value 'indeterminate' means "insufficient evidence to assess coherence" — a ` +
      `substantive claim that would be false on an evaluation with complete evidence, so no ` +
      `placeholder is stamped (DECISIONS.md DEC-21, open). moduleVersion, indicators, and ` +
      `summary were resolved 2026-08-27; evaluationId was resolved 2026-08-26. ` +
      `Dispatch succeeded — see .moduleResult and .mechanicalFields on this error.`,
    );
    this.name = 'Stage1EnvelopeBlockedError';
    this.moduleId = moduleResult.moduleId;
    this.moduleResult = moduleResult;
    this.mechanicalFields = mechanicalFields;
  }
}

/**
 * Attempts the full SecurityEvaluation<M> envelope for one category.
 * Always throws Stage1EnvelopeBlockedError — see the header comment and
 * DECISIONS.md DEC-15. `evidenceRefs` carries only this module's own
 * category (§6.3's minimum: "every evaluation SHALL reference its
 * supporting evidence"); whether authContext's dispatch also needs a
 * second ref for the `url` evidence its Origin was built from (see
 * `evaluateModule`) is a separate, narrower open question this file does
 * not decide — the single, unambiguously-required ref is what's built
 * here.
 */
export async function assembleSecurityEvaluation(
  evidence: SecurityEvidence,
  moduleId: ModuleId,
  storeReader: AuthStoreReader,
): Promise<never> {
  const moduleResult = await evaluateModule(evidence, moduleId, storeReader);

  const mechanicalFields: MechanicalEnvelopeFields<ModuleId> = {
    contractVersion: EVALUATION_CONTRACT_VERSION,
    // The SAME evaluationId evaluateModule already minted for this
    // dispatch — not a second, independent one. Two different IDs for
    // the same module's evaluation in the same pass would make
    // evaluationRefs (Stage 3) and this envelope disagree about what
    // they're both supposedly referencing.
    evaluationId: moduleResult.evaluationId,
    targetResourceId: evidence.targetResourceId,
    analysisSessionId: evidence.analysisSessionId,
    passOrdinal: evidence.collectionContext.passOrdinal,
    moduleId,
    evidenceRefs: [{ evidenceId: evidence.evidenceId, category: EVIDENCE_CATEGORY_BY_MODULE[moduleId] }],
    collectionContext: evidence.collectionContext,
    moduleVersion: MODULE_VERSIONS[moduleId],
    indicators: [],
    summary: `[DEC-15 UNRESOLVED] No Evaluation Summary generation rule is specified for module "${moduleId}".`,
  };

  // Still throws — `consistency` alone remains open. See the error class's
  // header for why no placeholder is stamped for it.
  throw new Stage1EnvelopeBlockedError(moduleResult, mechanicalFields);
}
