/**
 * URL Evaluation Module (module 1 of 10, §2.6). CRED-06 is the only rule
 * served (docs/pipeline-design-note.md).
 *
 * Contract, verified against evaluation.contract.v1.ts directly (DEC-11 —
 * see docs/pipeline-design-note.md's "module interface signature" section):
 * a module consumes only its own evidence category and produces the
 * Evaluability<F> for its FindingsByModule slot. This function is that core
 * computation for the `url` category: UrlEvidence in, Evaluability<UrlFindings>
 * out. Assembling the surrounding SecurityEvaluation<'url'> envelope
 * (evaluationId, evidenceRefs, indicators, consistency, summary,
 * moduleVersion, collectionContext) is Stage 1 orchestration, not this
 * module's concern — out of scope here.
 *
 * Prohibitions observed (docs/pipeline-design-note.md, "What a module is
 * forbidden from doing"): no membership test (R-01..R-04 stay at Stage 2),
 * no correlation with another module's output, no network access, no store
 * access.
 */

import type { UrlEvidence } from '../../contracts/evidence.contract.v1';
import type { UrlFindings, Evaluability } from '../../contracts/evaluation.contract.v1';

const SUSPICIOUS_KEYWORDS = [
  'login', 'signin', 'sign-in', 'verify', 'verification', 'secure',
  'account', 'update', 'confirm', 'banking', 'password', 'authenticate',
  'suspend', 'unlock', 'wallet',
] as const;

/**
 * suspiciousKeywordCount has no direct UrlEvidence source field (noted at
 * scoping time — no contract text specifies its derivation). Derived here
 * as the count of SUSPICIOUS_KEYWORDS occurring (case-insensitive,
 * substring match) in `fullUrl`. Uses the full URL rather than `path` alone
 * so a keyword stuffed into a subdomain (e.g. "secure-login.evil.tld") is
 * still caught, not just path-based stuffing.
 */
function countSuspiciousKeywords(fullUrl: string): number {
  const lower = fullUrl.toLowerCase();
  let count = 0;
  for (const kw of SUSPICIOUS_KEYWORDS) {
    if (lower.includes(kw)) count += 1;
  }
  return count;
}

/**
 * specialCharacterDensity has no direct UrlEvidence source field either.
 * Derived here as (count of characters in `fullUrl` that are neither
 * alphanumeric nor one of the ordinary URL-structural characters
 * : / . - _ ? = & %) / fullUrl.length. Computed against `fullUrl` (not
 * `path`) so the density and its denominator describe the same string that
 * `totalLength` already describes.
 */
const ORDINARY_URL_CHARS = new Set([':', '/', '.', '-', '_', '?', '=', '&', '%']);
function specialCharacterDensityOf(fullUrl: string): number {
  if (fullUrl.length === 0) return 0;
  let specialCount = 0;
  for (const ch of fullUrl) {
    const isAlphanumeric = /[a-zA-Z0-9]/.test(ch);
    if (!isAlphanumeric && !ORDINARY_URL_CHARS.has(ch)) specialCount += 1;
  }
  return specialCount / fullUrl.length;
}

/**
 * Every UrlFindings field except registrableDomain is non-nullable, so
 * every UrlEvidence field feeding one MUST be `present` — `notCollected`
 * makes the whole evaluation unevaluable; no default may be guessed, per
 * evidence.contract.v1.ts I-2 ("a producer MUST NOT emit absent where it
 * means notCollected... conflating them silently converts a capability gap
 * into a clean bill of health"). The same reasoning extends to this
 * consumer: silently defaulting a notCollected field would recreate that
 * exact conflation one level up.
 *
 * `absent` is treated the same as `notCollected` for every field below
 * EXCEPT registrableDomain: a URL that exists necessarily has a scheme, a
 * length, an IP-literal-or-not answer, so an `absent` observation on one of
 * those signals a producer defect, not a genuine negative finding — there
 * is no safe default to report, so it's treated as unevaluable too.
 *
 * registrableDomain is the one exception: UrlFindings types it
 * `string | null`, so `absent` (e.g. an IP-literal URL genuinely has no
 * registrable domain) maps cleanly to `null` — a real, positive finding.
 * `notCollected` on registrableDomain still makes the whole evaluation
 * unevaluable; collapsing it to `null` would misrepresent a capability gap
 * as a confirmed-absent fact (the same I-2 concern as above).
 */
export function computeUrlFindings(evidence: UrlEvidence): Evaluability<UrlFindings> {
  if (
    evidence.fullUrl.state !== 'present' ||
    evidence.scheme.state !== 'present' ||
    evidence.totalLength.state !== 'present' ||
    evidence.subdomainLabels.state !== 'present' ||
    evidence.isIpLiteral.state !== 'present' ||
    evidence.percentEncodedSegmentCount.state !== 'present' ||
    evidence.registrableDomain.state === 'notCollected'
  ) {
    return { status: 'unevaluable', reason: 'required_evidence_not_collected' };
  }

  const fullUrl = evidence.fullUrl.value;
  const scheme = evidence.scheme.value;
  const registrableDomain =
    evidence.registrableDomain.state === 'present' ? evidence.registrableDomain.value : null;

  const findings: UrlFindings = {
    scheme,
    isSecureScheme: scheme.toLowerCase() === 'https',
    registrableDomain,
    subdomainDepth: evidence.subdomainLabels.value.length,
    isIpLiteral: evidence.isIpLiteral.value,
    totalLength: evidence.totalLength.value,
    suspiciousKeywordCount: countSuspiciousKeywords(fullUrl),
    percentEncodedSegmentCount: evidence.percentEncodedSegmentCount.value,
    specialCharacterDensity: specialCharacterDensityOf(fullUrl),
  };

  return { status: 'evaluated', findings };
}
