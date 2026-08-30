/* ────────────────────────────────────────────────────────────────────────
 * FIXTURE: no-credential
 *
 * A page with NO login form at all — a marketing page, an article, anything
 * without a credential interface. Varies from clean-login in the login and
 * script-runtime categories: there is no form to observe.
 *
 * Semantic point: credentialFormPresent is present(false) — we LOOKED and
 * there is no form (a positive finding). forms is absent() for the same
 * reason. This is NOT notCollected — we could look, and did.
 * ──────────────────────────────────────────────────────────────────────── */

import type {
  SecurityEvidence, TargetResourceId, AnalysisSessionId, DayStamp,
} from '../packages/contracts/evidence.contract.v1.ts';
import {
  EVIDENCE_CONTRACT_VERSION,
  present, absent, notCollected,
} from '../packages/contracts/evidence.contract.v1.ts';

export const noCredential: SecurityEvidence = {
  targetResourceId: 'res_no_credential_0001' as TargetResourceId,
  analysisSessionId: 'sess_no_credential_0001' as AnalysisSessionId,
  evidenceId: 'ev_no_credential_0001',

  collectionContext: {
    collector: 'extension',
    collectorVersion: '0.1.0',
    tier: 0,
    passOrdinal: 1,
    collectedOn: '2026-08-21' as DayStamp,
    evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
  },

  evidence: {
    url: {
      fullUrl: present('https://blog.example.com/article/phishing-explained'),
      scheme: present('https'),
      host: present('blog.example.com'),
      port: present(443),
      path: present('/article/phishing-explained'),
      queryPresent: present(false),
      registrableDomain: present('example.com'),
      subdomainLabels: present(['blog']),
      isIpLiteral: present(false),
      totalLength: present(52),
      percentEncodedSegmentCount: present(0),
    },

    transport: {
      isHttps: present(true),
      certificateSubject: notCollected('api_unavailable'),
      subjectAlternativeNames: notCollected('api_unavailable'),
      validFrom: notCollected('api_unavailable'),
      validTo: notCollected('api_unavailable'),
      issuer: notCollected('api_unavailable'),
      chainComplete: notCollected('api_unavailable'),
      chainTrusted: notCollected('api_unavailable'),
    },

    dns: {
      resolves: notCollected('api_unavailable'),
      aRecordCount: notCollected('api_unavailable'),
      aaaaRecordCount: notCollected('api_unavailable'),
      nameServers: notCollected('api_unavailable'),
      cnameTarget: notCollected('api_unavailable'),
      mxPresent: notCollected('api_unavailable'),
      txtRecordCount: notCollected('api_unavailable'),
      dnssecDeployed: notCollected('api_unavailable'),
    },

    redirect: {
      initialUrl: present('https://blog.example.com/article/phishing-explained'),
      finalUrl: present('https://blog.example.com/article/phishing-explained'),
      chain: absent(),
      hopCount: present(0),
      crossedRegistrableDomain: absent(),
    },

    /* THE distinguishing category: no credential form. present(false) — we
     * looked and there is none. forms absent(). fingerprint not_applicable —
     * there is no login interface to fingerprint. */
    loginInterface: {
      credentialFormPresent: present(false),
      forms: absent(),
      fingerprint: notCollected('not_applicable'),
    },

    /* No credential field, so no listener on one — but that is a different
     * claim than clean-login. Here listenerOnCredentialField is absent()
     * (there is no credential field to attach to), not present(false). */
    scriptRuntime: {
      listenerOnCredentialField: absent(),
      clientSideTransmissionObserved: present(false),
      transmissionEndpoints: absent(),
      // Mirrors transmissionEndpoints above: the producer looked and there
      // are no transmission endpoints, so there are no domains to derive
      // from them. `absent()` not `notCollected` — the sibling's own
      // convention in this file, and the honest reading (I-2).
      transmissionEndpointDomains: absent(),
      dynamicScriptLoadCount: present(3),
      dynamicScriptOrigins: present(['https://blog.example.com']),
      credentialInterfaceInjected: present(false),
    },

    domainRepresentation: {
      unicodeDomain: present('blog.example.com'),
      punycodeDomain: present('blog.example.com'),
      isIdn: present(false),
      containsNonAscii: present(false),
      scriptsUsed: present(['Latin']),
      isMixedScript: present(false),
      // absent(), not present(<the domain itself>) — see clean-login.ts's
      // note. `absent` is the documented encoding for "no skeleton distinct
      // from the domain itself" (homograph.ts), and maps to `null`.
      confusableSkeleton: absent(),
    },

    downloadContext: {
      downloadUrl: notCollected('not_applicable'),
      downloadRegistrableDomain: notCollected('not_applicable'),
      referrerUrl: notCollected('not_applicable'),
      referrerRegistrableDomain: notCollected('not_applicable'),
      declaredFilename: notCollected('not_applicable'),
      declaredExtension: notCollected('not_applicable'),
      declaredMimeType: notCollected('not_applicable'),
      hasCompoundExtension: notCollected('not_applicable'),
    },

    permissionContext: {
      requestedPermission: absent(),
      requestingOrigin: absent(),
      precededByUserGesture: absent(),
      pageAgeMs: present(800),
    },
  },
};