/* ────────────────────────────────────────────────────────────────────────
 * FIXTURE: sso-flow
 *
 * A legitimate SSO redirect: the user starts at app.example.com and is
 * redirected to the identity provider login.idp-example.com to authenticate.
 * This is the BENIGN cross-domain-redirect case — it exercises the redirect
 * category with a real chain and a genuine registrable-domain crossing that
 * is NOT malicious (SSO is expected to cross domains).
 *
 * Semantic point: unlike clean-login, redirect.chain is present() with real
 * hops, hopCount > 0, and crossedRegistrableDomain is present(true). The
 * crossing is real and observed — the rules (not the fixture) decide whether
 * a given crossing is benign SSO or a malicious redirect.
 * ──────────────────────────────────────────────────────────────────────── */

import type {
  SecurityEvidence, TargetResourceId, AnalysisSessionId, DayStamp,
} from '../packages/contracts/evidence.contract.v1.ts';
import {
  EVIDENCE_CONTRACT_VERSION,
  present, absent, notCollected,
} from '../packages/contracts/evidence.contract.v1.ts';

export const ssoFlow: SecurityEvidence = {
  targetResourceId: 'res_sso_flow_0001' as TargetResourceId,
  analysisSessionId: 'sess_sso_flow_0001' as AnalysisSessionId,
  evidenceId: 'ev_sso_flow_0001',

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
      fullUrl: present('https://login.idp-example.com/authorize?client_id=app'),
      scheme: present('https'),
      host: present('login.idp-example.com'),
      port: present(443),
      path: present('/authorize'),
      queryPresent: present(true),
      registrableDomain: present('idp-example.com'),
      subdomainLabels: present(['login']),
      isIpLiteral: present(false),
      totalLength: present(56),
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

    /* THE distinguishing category: a real redirect chain that CROSSES a
     * registrable domain (app.example.com -> idp-example.com). chain is
     * present() with the hops; hopCount present(1); crossedRegistrableDomain
     * present(true). All observed — the rules judge benign-vs-malicious. */
    redirect: {
      initialUrl: present('https://app.example.com/dashboard'),
      finalUrl: present('https://login.idp-example.com/authorize?client_id=app'),
      chain: present([
        {
          fromUrl: 'https://app.example.com/dashboard',
          toUrl: 'https://login.idp-example.com/authorize?client_id=app',
          statusCode: 302,
          mechanism: 'http_3xx'
        },
      ]),
      hopCount: present(1),
      crossedRegistrableDomain: present(true),
    },

    /* The IdP page presents a real login form, same-origin to the IdP. */
    loginInterface: {
      credentialFormPresent: present(true),
      forms: present([
        {
          fields: [
            { kind: 'username', hidden: false, autocompleteDisabled: false },
            { kind: 'password', hidden: false, autocompleteDisabled: false },
          ],
          method: 'POST',
          actionUrl: 'https://login.idp-example.com/authenticate',
          actionRegistrableDomain: 'idp-example.com',
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
      // Mirrors transmissionEndpoints above: the producer looked and there
      // are no transmission endpoints, so there are no domains to derive
      // from them. `absent()` not `notCollected` — the sibling's own
      // convention in this file, and the honest reading (I-2).
      transmissionEndpointDomains: absent(),
      dynamicScriptLoadCount: present(4),
      dynamicScriptOrigins: present(['https://login.idp-example.com']),
      credentialInterfaceInjected: present(false),
    },

    domainRepresentation: {
      unicodeDomain: present('login.idp-example.com'),
      punycodeDomain: present('login.idp-example.com'),
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
      pageAgeMs: present(2200),
    },
  },
};
