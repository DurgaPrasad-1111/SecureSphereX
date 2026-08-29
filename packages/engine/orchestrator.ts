/**
 * Stage 1 Orchestration (§4.2, "Module Evaluation"). Dispatches a
 * SecurityEvidence object to each of the 10 modules' compute*Findings
 * functions and assembles their SecurityEvaluation<M> envelopes.
 *
 * COMPLETE as of 2026-08-28 — see DECISIONS.md DEC-15 and DEC-21. All
 * THIRTEEN of SecurityEvaluation<M>'s fields are now genuinely constructed:
 * `contractVersion`, `targetResourceId`, `analysisSessionId`, `passOrdinal`,
 * `moduleId`, `evidenceRefs`, `collectionContext` (mechanical from the
 * start); `result` (exactly what each module's compute*Findings returns);
 * `evaluationId` (2026-08-26 — a random UUIDv4, minted once per module
 * dispatch in `evaluateModule`, see id.ts); `moduleVersion` (2026-08-27 —
 * per-module, `module-versions.ts`); `indicators` (2026-08-27 — `[]`, the
 * LDD's own sanctioned schema default); `summary` (2026-08-27 — an
 * explicitly-labelled interim placeholder, DEC-5's "conformant stub"
 * precedent); and `consistency` (2026-08-28 — `consistency.ts`'s per-module
 * internal-coherence relations, DEC-21).
 *
 * This file therefore has three parts:
 *
 *   `evaluateModule` / `evaluateAllModules` — the dispatch layer. Given a
 *   SecurityEvidence object, calls the correct module function with the
 *   correct evidence slice and returns its genuine Evaluability<F> result.
 *   This is what §4.2 literally defines Stage 1 as ("each module... emits
 *   one Security Evaluation") — module evaluation, without the D0.2
 *   envelope around it. Stage 2 needs only this much (DEC-15's Stage 2
 *   dependency check), which is why it is kept separate.
 *
 *   `assembleSecurityEvaluation` — the full SecurityEvaluation<M> envelope
 *   for one category. Returns a real, complete evaluation; it no longer
 *   throws.
 *
 *   `assembleEvaluationSet` — the complete Stage 1 output for one pass: one
 *   evaluation per module. This is what invariant E-8 ("Exactly one
 *   evaluation per module per pass. Never zero, never two.") is stated
 *   about, and it became testable only when `consistency` was resolved.
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
import { assessConsistency } from './consistency.ts';
import { toOrigin } from '../contracts/evidence.contract.v1.ts';
import type { SecurityEvidence } from '../contracts/evidence.contract.v1';
import { EVALUATION_CONTRACT_VERSION } from '../contracts/evaluation.contract.v1.ts';
import type {
  ModuleId, Evaluability, FindingsByModule, EvidenceRef, SecurityIndicator,
  SecurityEvaluation, AnySecurityEvaluation, EvaluationSet, ConsistencyAssessment,
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
 * Builds one complete `SecurityEvaluation<M>`. Generic over M so `moduleId`
 * and `result` stay CORRELATED — the caller narrows the dispatch union
 * first, which is what lets this be written with no `as` cast anywhere,
 * matching this file's established zero-cast convention (G-2).
 */
function buildEvaluation<M extends ModuleId>(
  moduleId: M,
  result: Evaluability<FindingsByModule[M]>,
  common: Omit<MechanicalEnvelopeFields<M>, 'moduleId'>,
  consistency: ConsistencyAssessment,
): SecurityEvaluation<M> {
  return {
    evaluationId: common.evaluationId,
    contractVersion: common.contractVersion,
    targetResourceId: common.targetResourceId,
    analysisSessionId: common.analysisSessionId,
    passOrdinal: common.passOrdinal,
    moduleId,
    moduleVersion: common.moduleVersion,
    evidenceRefs: common.evidenceRefs,
    result,
    indicators: common.indicators,
    consistency,
    summary: common.summary,
    collectionContext: common.collectionContext,
  };
}

/**
 * Assembles the full `SecurityEvaluation<M>` envelope for one category.
 *
 * COMPLETE as of 2026-08-28. All thirteen fields are now genuinely
 * constructed — `consistency` was the last blocked one, resolved by the
 * per-module internal-coherence relations in `consistency.ts` (DEC-21).
 * This function no longer throws. `Stage1EnvelopeBlockedError`, which existed
 * only to report the blocked field, was DELETED in the same change — with no
 * remaining construction path it was dead code in the same sense DEFECT-18
 * uses the term, and a retained-but-unreachable error class is a future false
 * safety net.
 *
 * `evidenceRefs` carries only this module's own category (§6.3's minimum:
 * "every evaluation SHALL reference its supporting evidence"); whether
 * authContext's dispatch also needs a second ref for the `url` evidence its
 * Origin was built from (see `evaluateModule`) is a separate, narrower open
 * question this file does not decide.
 */
export function assembleSecurityEvaluation(
  evidence: SecurityEvidence,
  dispatch: ModuleDispatchResult,
): AnySecurityEvaluation {
  const moduleId = dispatch.moduleId;
  const consistency = assessConsistency(dispatch);

  const common = {
    contractVersion: EVALUATION_CONTRACT_VERSION,
    // The evaluationId of the dispatch this envelope was built FROM —
    // now genuinely the same one Stages 2-4 consumed, because the caller
    // threads a single dispatch through both (DEFECT-30). Before that fix
    // this function re-dispatched internally, so the id matched its OWN
    // hidden dispatch rather than the pass's — the comment here previously
    // claimed sameness that was true locally and false for the pass.
    evaluationId: dispatch.evaluationId,
    targetResourceId: evidence.targetResourceId,
    analysisSessionId: evidence.analysisSessionId,
    passOrdinal: evidence.collectionContext.passOrdinal,
    evidenceRefs: [{ evidenceId: evidence.evidenceId, category: EVIDENCE_CATEGORY_BY_MODULE[moduleId] }],
    collectionContext: evidence.collectionContext,
    moduleVersion: MODULE_VERSIONS[moduleId],
    indicators: [],
    summary: `[DEC-15 UNRESOLVED] No Evaluation Summary generation rule is specified for module "${moduleId}".`,
  } as const satisfies Omit<MechanicalEnvelopeFields<ModuleId>, 'moduleId'>;

  // One case per module so `dispatch.moduleId` and `dispatch.result` stay
  // correlated through narrowing. Verbose, but cast-free — the alternative
  // is an `as` on a union TypeScript cannot correlate on its own.
  switch (dispatch.moduleId) {
    case 'url': return buildEvaluation(dispatch.moduleId, dispatch.result, common, consistency);
    case 'ssl': return buildEvaluation(dispatch.moduleId, dispatch.result, common, consistency);
    case 'dns': return buildEvaluation(dispatch.moduleId, dispatch.result, common, consistency);
    case 'redirect': return buildEvaluation(dispatch.moduleId, dispatch.result, common, consistency);
    case 'loginForm': return buildEvaluation(dispatch.moduleId, dispatch.result, common, consistency);
    case 'javascript': return buildEvaluation(dispatch.moduleId, dispatch.result, common, consistency);
    case 'homograph': return buildEvaluation(dispatch.moduleId, dispatch.result, common, consistency);
    case 'authContext': return buildEvaluation(dispatch.moduleId, dispatch.result, common, consistency);
    case 'downloadContext': return buildEvaluation(dispatch.moduleId, dispatch.result, common, consistency);
    case 'permissionContext': return buildEvaluation(dispatch.moduleId, dispatch.result, common, consistency);
  }
}

/**
 * Assembles the complete Stage 1 output for one pass: exactly one
 * `SecurityEvaluation` per module, keyed by `ModuleId`.
 *
 * This is what invariant E-8 ("Exactly one evaluation per module per pass.
 * Never zero, never two.") is stated about, and it became constructible —
 * and therefore testable — only when `consistency` was resolved on
 * 2026-08-28.
 */
export function assembleEvaluationSet(
  evidence: SecurityEvidence,
  dispatch: Readonly<Record<ModuleId, ModuleDispatchResult>>,
): EvaluationSet {
  const moduleIds = Object.keys(EVIDENCE_CATEGORY_BY_MODULE) as readonly ModuleId[];
  const entries = moduleIds.map((moduleId) =>
    [moduleId, assembleSecurityEvaluation(evidence, dispatch[moduleId])] as const);
  return Object.fromEntries(entries) as EvaluationSet;
}
