/**
 * Consistency Assessment (§3 of `evaluation.contract.v1.ts`, Domain Model
 * §8.3.5) — resolves the last of DEC-15's five blocked envelope fields.
 *
 * WHAT THIS IS, EXACTLY. The contract constrains it hard: it assesses
 * "coherence of findings WITHIN the module's own domain ONLY. It is NOT
 * confidence, NOT probability, NOT a risk judgement." Every relation below
 * is therefore INTERNAL to one module's own Findings object. None reads
 * another module's evaluation — that boundary is E-2's and §8.4.3's, and it
 * is not crossed here.
 *
 * WHY THESE RELATIONS ARE MEANINGFUL AT ALL. Nearly every Findings field is
 * a pass-through from producer evidence (see each module's own header). A
 * module performs almost no derivation, so an internal-coherence check is in
 * practice a CHECK ON THE PRODUCER: it catches an evidence source that
 * contradicted itself. That is precisely the class of defect this project
 * has been finding by hand.
 *
 * `indeterminate`'s home, per the Architecture Owner's 2026-08-28 ruling:
 * `result.status === 'unevaluable'`. The contract defines it as
 * "insufficient evidence to assess coherence" — which is exactly, and only,
 * true when the module produced no findings at all. It is NOT a
 * "we didn't check" placeholder; stamping it on an evaluated result would be
 * a fabricated claim (DEC-21 records why at length).
 *
 * WHAT IS DELIBERATELY NOT CHECKED. Each predicate below encodes only
 * relations that hold under every available reading of the fields. Rejected
 * candidates are documented at their module, with the reason — a
 * forced-but-fake relation is worse than an honest "none", and one module
 * (`javascript`) genuinely has no checkable relation among its live fields.
 */

import type { ConsistencyAssessment } from '../contracts/evaluation.contract.v1';
import type {
  UrlFindings, SslFindings, DnsFindings, RedirectFindings, LoginFormFindings,
  JavaScriptFindings, HomographFindings, AuthContextFindings,
  DownloadContextFindings, PermissionContextFindings,
} from '../contracts/evaluation.contract.v1';
import type { ModuleDispatchResult } from './orchestrator';

/**
 * `isIpLiteral: true` with a non-null `registrableDomain`. An IP-literal URL
 * has no registrable domain — `url.ts`'s own header states it: "an IP-literal
 * URL genuinely has no registrable domain". Both fields are independent
 * pass-throughs, so a producer can emit the contradiction.
 */
export function urlIsInconsistent(f: UrlFindings): boolean {
  return f.isIpLiteral && f.registrableDomain !== null;
}

/**
 * Two relations.
 *
 * 1. The five nullable fields are all properties OF A CERTIFICATE. With no
 *    TLS session there is no certificate, so `httpsEstablished: false`
 *    alongside any non-null certificate fact is a contradiction.
 * 2. A certificate with negative days-until-expiry has expired, so it cannot
 *    also be currently valid. `< 0`, not `<= 0`: zero means "expires later
 *    today", which is still valid.
 *
 * NOT checked: `chainTrusted: true` with `chainComplete: false`. Clients
 * routinely complete an incomplete PRESENTED chain via AIA fetching or
 * cached intermediates — trusted-but-incomplete is a real, legitimate state.
 */
export function sslIsInconsistent(f: SslFindings): boolean {
  const certificateFactsPresent =
    f.certificateCurrentlyValid !== null ||
    f.chainComplete !== null ||
    f.chainTrusted !== null ||
    f.subjectMatchesHost !== null ||
    f.daysUntilExpiry !== null;

  if (!f.httpsEstablished && certificateFactsPresent) return true;
  if (f.daysUntilExpiry !== null && f.daysUntilExpiry < 0 && f.certificateCurrentlyValid === true) return true;
  return false;
}

/**
 * If address records exist, the name demonstrably resolves.
 *
 * NOT checked, deliberately: the CONVERSE (`resolves: true` with zero
 * addresses). That depends on whether `resolves` means "has an address" or
 * "the name exists / query returned NOERROR" — a name with only MX records
 * exists and answers but has no address. The contract gives no definition
 * (`readonly resolves: Observation<boolean>;`, no comment) and all four
 * fixtures have it `notCollected`, so there is no empirical tiebreak either.
 * See DEFECT-25.
 *
 * ALSO not checked: anything involving `cnamePresent` — a CNAME target
 * resolves to its own A records, so a CNAME alongside a real address count
 * is normal; and a CNAME to a non-existent target is a legitimate
 * `resolves: false`. Nor `nameServerCount: 0`, which is normal for a
 * subdomain query (NS records live at the zone apex).
 */
export function dnsIsInconsistent(f: DnsFindings): boolean {
  return !f.resolves && (f.aRecordCount > 0 || f.aaaaRecordCount > 0);
}

/**
 * `hopCount` and `chainLength` encode the same fact two different ways —
 * `redirect.ts`'s own words. `hopCount` is a producer pass-through;
 * `chainLength` is `chain.length`. They can disagree only if the producer
 * disagreed with itself.
 *
 * INHERITED SEMANTICS, approved 2026-08-28: this relies on `redirect.ts`'s
 * documented reading of `chain: absent()` as "looked, zero hops — the direct
 * arrival case". Under that reading `chain: absent()` with `hopCount: 3` is a
 * producer defect. If `absent` were ever redefined as "hops occurred but
 * could not be enumerated", this relation would need to change with it.
 *
 * NOT checked: `mechanisms.length === chainLength`. Both derive from the
 * same `chain` array inside `redirect.ts`, so it checks this package's own
 * arithmetic rather than the producer.
 */
export function redirectIsInconsistent(f: RedirectFindings): boolean {
  return f.hopCount !== f.chainLength;
}

/**
 * The flag asserts a credential form exists; an empty list contains no forms
 * at all.
 *
 * NOT checked: the converse (`credentialFormPresent: false` with a non-empty
 * `forms`). `CredentialFieldKind` includes `'username'` and `'email'`, which
 * are identifiers rather than secrets, so whether a form carrying only those
 * counts as "a credential form present" is a product-semantics question, not
 * something derivable from the contract. Explicitly ruled out of scope
 * 2026-08-28.
 */
export function loginFormIsInconsistent(f: LoginFormFindings): boolean {
  return f.credentialFormPresent && f.forms.length === 0;
}

/**
 * NO RELATION EXISTS among this module's live fields — always `consistent`.
 * This is a real finding, not an omission, and the parameter is kept so the
 * signature matches its nine siblings.
 *
 * Checked and rejected, each for a stated reason:
 *  - transmission without a listener is ordinary (a submit handler, a timer),
 *    so `clientSideTransmissionObserved` and `listenerOnCredentialField` are
 *    independent;
 *  - `credentialInterfaceInjected: true` with `dynamicScriptLoadCount: 0` is
 *    NOT contradictory — an inline script can inject an interface with no
 *    dynamic load at all;
 *  - `dynamicScriptLoadCount` relates to nothing else in the type.
 *
 * Two relations DO exist in principle. Their reachability has diverged since
 * DEFECT-18 was split:
 *  - "`clientSideTransmissionObserved: false` with endpoints" is now
 *    REACHABLE in principle — `transmissionEndpointDomains` is no longer
 *    pinned to `[]` (DEFECT-18 engine-consumption fix, 2026-09-03: the module
 *    threads the producer-resolved domains). It stays dormant in practice only
 *    while the transmission-observation gate keeps the module unevaluable
 *    (Tier 4, `clientSideTransmissionObserved` notCollected).
 *  - "`credentialInterfaceInjected: false` with an injecting domain" remains
 *    UNREACHABLE — `injectingScriptOriginDomain` is still `null`
 *    unconditionally (DEFECT-18's other half is untouched; no evidence source
 *    in this category at all).
 * Neither relation is CHECKED here yet — adding one would change consistency
 * scoring and is a separate decision, deliberately not made as a side effect
 * of the DEFECT-18 wiring. `javascriptIsInconsistent` still returns false.
 */
export function javascriptIsInconsistent(_f: JavaScriptFindings): boolean {
  return false;
}

/**
 * Mixed script requires at least TWO scripts to have been recorded.
 *
 * STRENGTHENED 2026-08-29 when DEFECT-24 was resolved. This previously
 * encoded only the weaker `scriptsUsed.length === 0`, because two
 * incompatible readings of `scriptsUsed` were live at once and only the
 * weaker form held under both. DEFECT-24 adopted the fixtures' reading —
 * `scriptsUsed` lists EVERY Unicode script present, including the default
 * one — under which "mixed script" is definitionally "two or more scripts",
 * so `length >= 2` is now the exact relation rather than a safe subset.
 *
 * `length >= 2` subsumes the old check: `isMixedScript` with `length === 0`
 * is still inconsistent, and `length === 1` — a domain claiming mixed script
 * while reporting a single script — is now caught too.
 *
 * ALSO not checked: `isIdn: true` implying `containsNonAscii: true` — an
 * IDN's punycode form (`xn--…`) is pure ASCII while its Unicode form is not,
 * and the contract never says which representation `containsNonAscii`
 * measures. That ambiguity is untouched by DEFECT-24 and remains open.
 */
export function homographIsInconsistent(f: HomographFindings): boolean {
  return f.isMixedScript && f.scriptsUsed.length < 2;
}

/**
 * The type's OWN field comments state the relation: "For a present origin:
 * drift against current-version revisions" / "For an absent origin:
 * highest-similarity ESTABLISHED entry elsewhere". Any violation of what the
 * type documents about itself is a contradiction.
 *
 * The `storeAvailable === false` clause is structural rather than
 * documentary: `authContext.ts` returns `unevaluable` on both the
 * `versionMismatch` and `unavailable` store responses, and hardcodes
 * `storeAvailable: true` on the only path that produces findings. So
 * `storeAvailable: false` inside an EVALUATED result asserts "the store was
 * unavailable, yet here are its answers."
 */
export function authContextIsInconsistent(f: AuthContextFindings): boolean {
  if (!f.originPresent && f.lifecycleState !== null) return true;
  if (!f.originPresent && f.fingerprintDrift !== null) return true;
  if (f.originPresent && f.bestCrossOriginMatch !== null) return true;
  if (f.originPresent && f.fingerprintDrift === null) return true;
  if (!f.storeAvailable) return true;
  return false;
}

/**
 * Two relations. No referrer means no referrer domain; and a compound
 * extension (`invoice.pdf.exe`) presupposes that an extension exists at all.
 * Both pairs are independent pass-throughs, so a producer can disagree with
 * itself on either.
 *
 * NOT checked: `extensionMimeConsistent` against its two inputs.
 * `computeExtensionMimeConsistent` already returns `null` whenever either
 * input is null (and for generic or unknown MIME types), so the invariant is
 * enforced by this package's own code — checking it would test our
 * arithmetic, not the producer.
 */
export function downloadContextIsInconsistent(f: DownloadContextFindings): boolean {
  if (!f.referrerPresent && f.referrerRegistrableDomain !== null) return true;
  if (f.hasCompoundExtension && f.declaredExtension === null) return true;
  return false;
}

/**
 * A gesture-precedence fact about a request that never happened has no
 * subject. `permissionContext.ts` confirms the intended pairing: these
 * fields are "`absent()` together on every page with no permission prompt".
 *
 * `pageAgeMs` is DELIBERATELY EXCLUDED. A page has an age whether or not any
 * permission was requested, and the module gates it independently —
 * `fixtures/sso-flow.ts` is exactly that state
 * (`requestedPermission: absent()`, `pageAgeMs: present(2200)`). Including it
 * would fire `inconsistent` on ordinary pages.
 *
 * ALSO not checked: `pageAgeMs < 0`. Impossible, but that is single-field
 * range validation, not coherence BETWEEN findings.
 */
export function permissionContextIsInconsistent(f: PermissionContextFindings): boolean {
  return f.requestedPermission === null && f.precededByUserGesture !== null;
}

/**
 * The single entry point. `unevaluable` is checked FIRST and
 * unconditionally: with no findings, there is genuinely insufficient
 * evidence to assess coherence, which is exactly what the contract's
 * `indeterminate` means.
 */
export function assessConsistency(dispatch: ModuleDispatchResult): ConsistencyAssessment {
  if (dispatch.result.status !== 'evaluated') return 'indeterminate';

  switch (dispatch.moduleId) {
    case 'url': return urlIsInconsistent(dispatch.result.findings) ? 'inconsistent' : 'consistent';
    case 'ssl': return sslIsInconsistent(dispatch.result.findings) ? 'inconsistent' : 'consistent';
    case 'dns': return dnsIsInconsistent(dispatch.result.findings) ? 'inconsistent' : 'consistent';
    case 'redirect': return redirectIsInconsistent(dispatch.result.findings) ? 'inconsistent' : 'consistent';
    case 'loginForm': return loginFormIsInconsistent(dispatch.result.findings) ? 'inconsistent' : 'consistent';
    case 'javascript': return javascriptIsInconsistent(dispatch.result.findings) ? 'inconsistent' : 'consistent';
    case 'homograph': return homographIsInconsistent(dispatch.result.findings) ? 'inconsistent' : 'consistent';
    case 'authContext': return authContextIsInconsistent(dispatch.result.findings) ? 'inconsistent' : 'consistent';
    case 'downloadContext':
      return downloadContextIsInconsistent(dispatch.result.findings) ? 'inconsistent' : 'consistent';
    case 'permissionContext':
      return permissionContextIsInconsistent(dispatch.result.findings) ? 'inconsistent' : 'consistent';
  }
}
