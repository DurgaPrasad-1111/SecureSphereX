/**
 * Assemble a full SecurityEvidence for the engine from the live-DOM parts the
 * extension collects, filling the rest with `notCollected` category stubs.
 *
 * The engine requires EVERY category present as an object (a module never
 * receives a missing category — it receives one whose fields are
 * notCollected). The extension cannot import the harness's stub builders
 * (dependency matrix), so it carries its own here — pure notCollected shapes,
 * no logic to drift.
 *
 * What the extension genuinely collects (url/transport/loginInterface/
 * scriptRuntime) is passed in; downloadContext and permissionContext may be
 * partially populated by the service worker's observers (A1.4 step 7).
 */

import {
  notCollected,
  EVIDENCE_CONTRACT_VERSION,
  type SecurityEvidence, type EvidenceByCategory,
  type UrlEvidence, type TransportEvidence, type LoginInterfaceEvidence,
  type ScriptRuntimeEvidence, type DomainRepresentationEvidence,
  type DnsEvidence, type RedirectEvidence, type DownloadContextEvidence,
  type PermissionContextEvidence,
  type Observation, type TargetResourceId, type AnalysisSessionId, type DayStamp,
} from '../../packages/contracts/evidence.contract.v1.ts';

const nc = <T>(): Observation<T> => notCollected<T>('api_unavailable');

export function stubDomainRepresentation(): DomainRepresentationEvidence {
  return {
    unicodeDomain: nc<string>(), punycodeDomain: nc<string>(), isIdn: nc<boolean>(),
    containsNonAscii: nc<boolean>(), scriptsUsed: nc<readonly string[]>(),
    isMixedScript: nc<boolean>(), confusableSkeleton: nc<string>(),
  };
}
export function stubDns(): DnsEvidence {
  return {
    resolves: nc<boolean>(), aRecordCount: nc<number>(), aaaaRecordCount: nc<number>(),
    nameServers: nc<readonly string[]>(), cnameTarget: nc<string>(),
    mxPresent: nc<boolean>(), txtRecordCount: nc<number>(), dnssecDeployed: nc<boolean>(),
  };
}
export function stubRedirect(): RedirectEvidence {
  return {
    initialUrl: nc<string>(), finalUrl: nc<string>(),
    initialRegistrableDomain: nc<string>(), finalRegistrableDomain: nc<string>(),
    chain: nc<readonly never[]>(),
    hopCount: nc<number>(), crossedRegistrableDomain: nc<boolean>(),
  } as RedirectEvidence;
}
export function stubDownloadContext(): DownloadContextEvidence {
  return {
    downloadUrl: nc<string>(), downloadRegistrableDomain: nc<string>(),
    referrerUrl: nc<string>(), referrerRegistrableDomain: nc<string>(),
    declaredFilename: nc<string>(), declaredExtension: nc<string>(),
    declaredMimeType: nc<string>(), hasCompoundExtension: nc<boolean>(),
  } as DownloadContextEvidence;
}
export function stubPermissionContext(): PermissionContextEvidence {
  return {
    requestedPermission: nc(), requestingOrigin: nc<string>(),
    precededByUserGesture: nc<boolean>(), pageAgeMs: nc<number>(),
  } as PermissionContextEvidence;
}

export interface CollectedParts {
  readonly url: UrlEvidence;
  readonly transport: TransportEvidence;
  readonly loginInterface: LoginInterfaceEvidence;
  readonly scriptRuntime: ScriptRuntimeEvidence;
  /** A1.2 PSL wiring: now genuinely collected (shared domain-classify), not
   *  stubbed. Optional so an older content script still assembles. */
  readonly domainRepresentation?: DomainRepresentationEvidence;
  /** SW-observed redirect evidence (webNavigation, this checkpoint). Optional:
   *  absent when the SW observed no navigation for the tab (falls back to
   *  stub -> notCollected -> module unevaluable, honestly). */
  readonly redirect?: RedirectEvidence;
  /** Optional live overrides for categories the SW can observe (step 7). */
  readonly downloadContext?: DownloadContextEvidence;
  readonly permissionContext?: PermissionContextEvidence;
}

export function assembleEvidence(parts: CollectedParts, targetUrl: string, collectedOn: string): SecurityEvidence {
  const evidence: EvidenceByCategory = {
    url: parts.url,
    transport: parts.transport,
    loginInterface: parts.loginInterface,
    scriptRuntime: parts.scriptRuntime,
    domainRepresentation: parts.domainRepresentation ?? stubDomainRepresentation(),
    dns: stubDns(),
    redirect: parts.redirect ?? stubRedirect(),
    downloadContext: parts.downloadContext ?? stubDownloadContext(),
    permissionContext: parts.permissionContext ?? stubPermissionContext(),
  };
  // Ids derived from the target, not randomised — same discipline as the
  // harness (S-6 rule 2). A live pass has no snapshot id, so a stable hash of
  // the URL stands in.
  const id = hash32(targetUrl);
  return {
    targetResourceId: `res_${id}` as TargetResourceId,
    analysisSessionId: `sess_${id}` as AnalysisSessionId,
    evidenceId: `ev_${id}`,
    collectionContext: {
      collector: 'extension',
      collectorVersion: 'ssx-ext-0.1.0',
      tier: 1,
      passOrdinal: 1,
      collectedOn: collectedOn as DayStamp,
      evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
    },
    evidence,
  };
}

/** Small stable non-cryptographic hash, for deriving evidence ids. */
function hash32(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
