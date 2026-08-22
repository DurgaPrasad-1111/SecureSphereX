/* ────────────────────────────────────────────────────────────────────────
 * FIXTURE: off-origin-post
 *
 * A login page that LOOKS like accounts.example.com but whose credential
 * form POSTs to a DIFFERENT registrable domain (evil-collect.example) — the
 * classic credential-exfiltration signature. Varies from clean-login only in
 * the loginInterface form's action fields.
 *
 * Semantic point: the form is present and real (present(true)), but its
 * actionRegistrableDomain differs from the page's registrableDomain. That
 * mismatch is the finding — CRED-family rules read exactly this.
 * ──────────────────────────────────────────────────────────────────────── */

import type {
  SecurityEvidence, TargetResourceId, AnalysisSessionId, DayStamp,
} from '../packages/contracts/evidence.contract.v1';
import {
  EVIDENCE_CONTRACT_VERSION,
  present, absent, notCollected,
} from '../packages/contracts/evidence.contract.v1';

export const offOriginPost: SecurityEvidence = {
  targetResourceId: 'res_off_origin_post_0001' as TargetResourceId,
  analysisSessionId: 'sess_off_origin_post_0001' as AnalysisSessionId,
  evidenceId: 'ev_off_origin_post_0001',

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
      fullUrl: present('https://accounts.example.com/login'),
      scheme: present('https'),
      host: present('accounts.example.com'),
      port: present(443),
      path: present('/login'),
      queryPresent: present(false),
      registrableDomain: present('example.com'),
      subdomainLabels: present(['accounts']),
      isIpLiteral: present(false),
      totalLength: present(38),
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
      initialUrl: present('https://accounts.example.com/login'),
      finalUrl: present('https://accounts.example.com/login'),
      chain: absent(),
      hopCount: present(0),
      crossedRegistrableDomain: absent(),
    },

    /* THE distinguishing category: a real login form whose action posts
     * OFF-ORIGIN. actionRegistrableDomain (evil-collect.example) != the page's
     * registrableDomain (example.com). This is the exfiltration signature. */
    loginInterface: {
      credentialFormPresent: present(true),
      forms: present([
        {
          fields: [
            { kind: 'username', hidden: false, autocompleteDisabled: false },
            { kind: 'password', hidden: false, autocompleteDisabled: false },
          ],
          method: 'POST',
          actionUrl: 'https://evil-collect.example/harvest',
          actionRegistrableDomain: 'evil-collect.example',
          injectedAfterLoad: false,
          injectingScriptOrigin: null,
        },
      ]),
      fingerprint: notCollected('tier_not_reached'),
    },

    scriptRuntime: {
      listenerOnCredentialField: present(false),
      clientSideTransmissionObserved: present(false),
      transmissionEndpoints: absent(),
      dynamicScriptLoadCount: present(2),
      dynamicScriptOrigins: present(['https://accounts.example.com']),
      credentialInterfaceInjected: present(false),
    },

    domainRepresentation: {
      unicodeDomain: present('accounts.example.com'),
      punycodeDomain: present('accounts.example.com'),
      isIdn: present(false),
      containsNonAscii: present(false),
      scriptsUsed: present(['Latin']),
      isMixedScript: present(false),
      confusableSkeleton: present('accounts.example.com'),
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
      pageAgeMs: present(1500),
    },
  },
};
