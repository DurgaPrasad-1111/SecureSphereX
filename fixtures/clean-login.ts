/* ────────────────────────────────────────────────────────────────────────
 * FIXTURE: clean-login
 *
 * An ordinary, same-site login page. Nothing suspicious. Baseline the other
 * three fixtures vary from.
 *
 * SEMANTIC DISCIPLINE (the point of Step 8 — a fixture that typechecks but
 * lies is worse than none):
 *   present      — we observed a real value; it is included.
 *   absent       — we LOOKED and there was genuinely nothing there. A
 *                  positive finding (no redirect chain, no hidden field).
 *   notCollected — we COULD NOT look; a capability gap, with a reason.
 *
 * The notCollected reasons are not invented — they are what the Step 10
 * capability spike (docs/ProducerCapabilityManifest.md) proved a content
 * script cannot observe: all TLS certificate fields, all DNS records,
 * download context -> notCollected: api_unavailable (NOT absent — "absent"
 * would falsely claim we looked). Collector: extension, Tier 0.
 * ──────────────────────────────────────────────────────────────────────── */

import type {
  SecurityEvidence, TargetResourceId, AnalysisSessionId, DayStamp,
} from '../packages/contracts/evidence.contract.v1';
import {
  EVIDENCE_CONTRACT_VERSION,
  present, absent, notCollected,
} from '../packages/contracts/evidence.contract.v1';

export const cleanLogin: SecurityEvidence = {
  targetResourceId: 'res_clean_login_0001' as TargetResourceId,
  analysisSessionId: 'sess_clean_login_0001' as AnalysisSessionId,
  evidenceId: 'ev_clean_login_0001',

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

    /* THE named trap: reached directly, no redirect. chain ABSENT (looked, none). */
    redirect: {
      initialUrl: present('https://accounts.example.com/login'),
      finalUrl: present('https://accounts.example.com/login'),
      chain: absent(),
      hopCount: present(0),
      crossedRegistrableDomain: absent(),
    },

    loginInterface: {
      credentialFormPresent: present(true),
      forms: present([
        {
          fields: [
            { kind: 'username', hidden: false, autocompleteDisabled: false },
            { kind: 'password', hidden: false, autocompleteDisabled: false },
          ],
          method: 'POST',
          actionUrl: 'https://accounts.example.com/login',
          actionRegistrableDomain: 'example.com',
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
      pageAgeMs: present(1200),
    },
  },
};