/**
 * The categories this extractor does NOT populate, and exactly why for each.
 *
 * `EvidenceByCategory` requires all nine categories to be present as objects
 * ("Every category is always present as an object; individual fields carry
 * their own tri-state" — evidence.contract.v1.ts:308-309). So an unbuilt
 * category is a fully-notCollected object, never a missing key.
 *
 * S-7 is the governing invariant: `notCollected` NEVER `absent`. `absent`
 * would assert a confirmed-negative fact about something never looked at,
 * which is I-2's "converts a capability gap into a clean bill of health".
 *
 * ⚠️ REASON-CODE CAVEAT. Every `NotCollectedReason` is worded for an
 * extension — `api_unavailable` is glossed "browser exposes no API for this".
 * None is worded for "the capture pipeline does not collect this".
 * `api_unavailable` is the closest available fit and is used throughout;
 * DEC-26's amendment records that the enum may want a
 * `producer_does_not_collect` variant in a future contract amendment.
 */

import {
  notCollected, present,
  type Observation, type TransportEvidence, type DnsEvidence,
  type DownloadContextEvidence, type PermissionContextEvidence,
    type SensitivePermission,
} from '../../../packages/contracts/evidence.contract.v1.ts';

const nc = <T>(): Observation<T> => notCollected<T>('api_unavailable');

/**
 * `transport` — the `isHttps`-ONLY slice (DEC-26 amendment, 2026-08-29).
 *
 * The other seven fields are `notCollected` UNCONDITIONALLY, and that is not
 * a deferral behind a todo. `tools/capture/capture.py:228` initialises
 * `tls_chain = None` and NEVER assigns it — the identifier occurs exactly
 * twice in the file, at that initialiser and where it is serialised. Verified
 * empirically at 0/50 non-null across two independent payload stores.
 *
 * So there is no certificate to parse, for any snapshot this pipeline has
 * produced or can produce. No X.509 parser is written or depended on.
 * Un-stubbing requires a CAPTURE-stage change first; an extractor change
 * alone can never lift it.
 */
export function extractTransport(scheme: string | null): TransportEvidence {
  return {
    // The one genuinely derivable field: the scheme is always available when
    // a final URL is.
    isHttps: scheme === null ? nc<boolean>() : present(scheme.toLowerCase() === 'https'),
    certificateSubject: nc<string>(),
    subjectAlternativeNames: nc<readonly string[]>(),
    validFrom: nc<string>(),
    validTo: nc<string>(),
    issuer: nc<string>(),
    chainComplete: nc<boolean>(),
    chainTrusted: nc<boolean>(),
  };
}

/**
 * `dns` — permanently stubbed (DEC-26 amendment, 2026-08-29).
 *
 * `tools/capture/capture.py:330` writes `"dnsRecords": None` as a HARDCODED
 * LITERAL. There is no code path producing anything else. 0/50 non-null
 * across both stores.
 *
 * Note also DEFECT-25: `DnsFindings.resolves` has no definition anywhere in
 * the repository. Even with data, the gating field's meaning would have to be
 * decided first — so stubbing avoids inventing a semantics by accident.
 */
export function stubDns(): DnsEvidence {
  return {
    resolves: nc<boolean>(), aRecordCount: nc<number>(), aaaaRecordCount: nc<number>(),
    nameServers: nc<readonly string[]>(), cnameTarget: nc<string>(),
    mxPresent: nc<boolean>(), txtRecordCount: nc<number>(), dnssecDeployed: nc<boolean>(),
  };
}

/**
 * `downloadContext` and `permissionContext` — CONTRACTUALLY out of scope.
 *
 * `snapshot.format.v1.ts:283-285`, S-9, verbatim:
 *
 *   S-9  DL and PM family rules are NOT corpus-validatable (D0.1 conformance
 *        classes). Snapshot-derived metrics cover the CRED family only; DL-01,
 *        DL-02 and PM-01 REQUIRE in-browser validation.
 *
 * Not an implementation choice and not a cost tradeoff — building these would
 * produce evidence the contract forbids drawing corpus conclusions from.
 */
export function stubDownloadContext(): DownloadContextEvidence {
  return {
    downloadUrl: nc<string>(), downloadRegistrableDomain: nc<string>(),
    referrerUrl: nc<string>(), referrerRegistrableDomain: nc<string>(),
    declaredFilename: nc<string>(), declaredExtension: nc<string>(),
    declaredMimeType: nc<string>(), hasCompoundExtension: nc<boolean>(),
  };
}

export function stubPermissionContext(): PermissionContextEvidence {
  return {
    requestedPermission: nc<SensitivePermission>(), requestingOrigin: nc<string>(),
    precededByUserGesture: nc<boolean>(), pageAgeMs: nc<number>(),
  };
}
