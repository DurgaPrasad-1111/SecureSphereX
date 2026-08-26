/**
 * Stage 1 Orchestration (§4.2, "Module Evaluation"). Dispatches a
 * SecurityEvidence object to each of the 10 modules' compute*Findings
 * functions and assembles their SecurityEvaluation<M> envelopes.
 *
 * PARTIAL BY DESIGN — see DECISIONS.md DEC-15 (CANDIDATE, open). Of
 * SecurityEvaluation<M>'s twelve fields, seven are mechanically derivable
 * from the already-frozen contracts alone: `contractVersion`,
 * `targetResourceId`, `analysisSessionId`, `passOrdinal`, `moduleId`,
 * `evidenceRefs`, `collectionContext` — plus `result`, which is exactly
 * what each module's own compute*Findings function already returns. FIVE
 * ARE NOT: `evaluationId`, `moduleVersion`, `indicators`, `consistency`,
 * `summary`. Their stated source — "Domain Model §7.3 / §8.3.5" — is a
 * document that is not among the 46 files in spec/. DEC-15 records this in
 * full; it is not re-derived here.
 *
 * Rather than guess a convention for those five (exactly what DEC-15 says
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
 *   envelope. Builds the seven mechanical fields for real, then throws
 *   Stage1EnvelopeBlockedError before fabricating the other five — the
 *   error carries the genuinely-computed module result and mechanical
 *   fields as its payload, so a caller (or a future resumption once DEC-15
 *   is resolved) can see exactly how far assembly got.
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
import { toOrigin } from '../contracts/evidence.contract.v1.ts';
import type { SecurityEvidence } from '../contracts/evidence.contract.v1';
import { EVALUATION_CONTRACT_VERSION } from '../contracts/evaluation.contract.v1.ts';
import type {
  ModuleId, Evaluability, FindingsByModule, EvidenceRef,
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
  [M in ModuleId]: { readonly moduleId: M; readonly result: Evaluability<FindingsByModule[M]> };
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

  switch (moduleId) {
    case 'url':
      return { moduleId, result: computeUrlFindings(byCategory.url) };
    case 'ssl':
      return { moduleId, result: computeSslFindings(byCategory.transport) };
    case 'dns':
      return { moduleId, result: computeDnsFindings(byCategory.dns) };
    case 'redirect':
      return { moduleId, result: computeRedirectFindings(byCategory.redirect) };
    case 'loginForm':
      return { moduleId, result: computeLoginFormFindings(byCategory.loginInterface) };
    case 'javascript':
      return { moduleId, result: computeJavaScriptFindings(byCategory.scriptRuntime) };
    case 'homograph':
      return { moduleId, result: computeHomographFindings(byCategory.domainRepresentation) };
    case 'downloadContext':
      return { moduleId, result: computeDownloadContextFindings(byCategory.downloadContext) };
    case 'permissionContext':
      return { moduleId, result: computePermissionContextFindings(byCategory.permissionContext) };
    case 'authContext': {
      const fullUrl = byCategory.url.fullUrl;
      const origin = fullUrl.state === 'present' ? toOrigin(fullUrl.value) : null;
      if (origin === null) {
        return { moduleId, result: { status: 'unevaluable', reason: 'required_evidence_not_collected' } };
      }
      const result = await computeAuthContextFindings(origin, byCategory.loginInterface, storeReader);
      return { moduleId, result };
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

/** The seven SecurityEvaluation<M> fields this file can construct for real. */
export interface MechanicalEnvelopeFields<M extends ModuleId> {
  readonly contractVersion: typeof EVALUATION_CONTRACT_VERSION;
  readonly targetResourceId: SecurityEvidence['targetResourceId'];
  readonly analysisSessionId: SecurityEvidence['analysisSessionId'];
  readonly passOrdinal: number;
  readonly moduleId: M;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly collectionContext: SecurityEvidence['collectionContext'];
}

/**
 * Thrown by `assembleSecurityEvaluation` instead of fabricating
 * `evaluationId`/`moduleVersion`/`indicators`/`consistency`/`summary`.
 * Carries what WAS genuinely computed — the real module dispatch result
 * and the seven mechanical fields — as a diagnostic payload, so a caller
 * (or a future resumption once DEC-15 is resolved) can see exactly how far
 * assembly got rather than receiving a bare failure.
 */
export class Stage1EnvelopeBlockedError extends Error {
  readonly moduleId: ModuleId;
  readonly moduleResult: ModuleDispatchResult;
  readonly mechanicalFields: MechanicalEnvelopeFields<ModuleId>;
  readonly missingFields: readonly string[] = [
    'evaluationId', 'moduleVersion', 'indicators', 'consistency', 'summary',
  ];

  constructor(moduleResult: ModuleDispatchResult, mechanicalFields: MechanicalEnvelopeFields<ModuleId>) {
    super(
      `Stage 1 orchestration for module "${moduleResult.moduleId}" cannot construct a complete ` +
      `SecurityEvaluation: evaluationId, moduleVersion, indicators, consistency, and summary have no ` +
      `documented generation scheme (DECISIONS.md DEC-15, open). Dispatch succeeded — see ` +
      `.moduleResult and .mechanicalFields on this error.`,
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
    targetResourceId: evidence.targetResourceId,
    analysisSessionId: evidence.analysisSessionId,
    passOrdinal: evidence.collectionContext.passOrdinal,
    moduleId,
    evidenceRefs: [{ evidenceId: evidence.evidenceId, category: EVIDENCE_CATEGORY_BY_MODULE[moduleId] }],
    collectionContext: evidence.collectionContext,
  };

  throw new Stage1EnvelopeBlockedError(moduleResult, mechanicalFields);
}
