/**
 * SSL Evaluation Module (module 2 of 10, §2.6). Serves NO rules today
 * (docs/pipeline-design-note.md: "SSL and DNS serve no rules — this is why
 * DEC-5 stubs them; nothing downstream currently reads their output").
 *
 * DEC-5 (DECISIONS.md) approved deferring `ssl`/`dns` to CONFORMANT STUBS,
 * not full implementations, until a rule consumes their findings: "a
 * minimal conformant implementation (correct shape, correct `unevaluable`
 * handling, findings populated from evidence) satisfies every architectural
 * requirement until a rule consumes them." This module is that — kept
 * narrow deliberately, matching DEC-5's own scope, not expanded beyond it.
 *
 * Contract, verified against evaluation.contract.v1.ts directly (DEC-11):
 * a module consumes only its own evidence category and produces the
 * Evaluability<F> for its FindingsByModule slot. This function is that core
 * computation for the `transport` category: TransportEvidence in,
 * Evaluability<SslFindings> out.
 *
 * Prohibitions observed (docs/pipeline-design-note.md, "What a module is
 * forbidden from doing"): no correlation with another module's output, no
 * network access, no store access.
 *
 * THREE of SslFindings' six fields are structurally out of this module's
 * reach — narrower scope than DEC-5 needs to resolve, since nothing reads
 * any of the six yet, but documented here rather than silently guessed:
 *
 * `subjectMatchesHost` — needs BOTH the certificate subject/SAN (this
 * module's own `transport` category) AND the page's host (the `url`
 * category, a different one). Per §2.6 a module cannot cross evidence
 * categories — the exact DEFECT-15 shape. Always `null`.
 *
 * `certificateCurrentlyValid` and `daysUntilExpiry` — both need a
 * reference "now" to compare `validFrom`/`validTo` against. This module's
 * signature receives only `TransportEvidence`, not `CollectionContext`
 * (which carries `collectedOn`) — and even with a reference date available,
 * reading the wall clock directly would violate §4.3's determinism
 * guarantee (no dependency on wall-clock time). Neither field has a
 * groundable source under the current module signature. Always `null`.
 */

import type { TransportEvidence } from '../../contracts/evidence.contract.v1';
import type { SslFindings, Evaluability } from '../../contracts/evaluation.contract.v1';

/**
 * `httpsEstablished` is non-nullable, so its source Observation MUST be
 * `present` — `absent` or `notCollected` makes the whole evaluation
 * unevaluable, per evidence.contract.v1.ts I-2 (same reasoning as every
 * other module's non-nullable fields).
 *
 * `chainComplete` and `chainTrusted` are nullable and follow url.ts's
 * registrableDomain precedent: `present` → the value, `absent` → `null` (a
 * genuine negative finding), `notCollected` → the whole evaluation is
 * unevaluable.
 *
 * `certificateSubject`, `subjectAlternativeNames`, `validFrom`, `validTo`,
 * and `issuer` are NOT gated here and are never read at all — none of the
 * three structurally-null fields above are derived from them (see the
 * header comment for why), so no Findings field's evaluability depends on
 * their Observation state.
 */
export function computeSslFindings(evidence: TransportEvidence): Evaluability<SslFindings> {
  if (evidence.isHttps.state !== 'present' || evidence.chainComplete.state === 'notCollected' ||
      evidence.chainTrusted.state === 'notCollected') {
    return { status: 'unevaluable', reason: 'required_evidence_not_collected' };
  }

  const findings: SslFindings = {
    httpsEstablished: evidence.isHttps.value,
    // Always null — see the header comment.
    certificateCurrentlyValid: null,
    chainComplete: evidence.chainComplete.state === 'present' ? evidence.chainComplete.value : null,
    chainTrusted: evidence.chainTrusted.state === 'present' ? evidence.chainTrusted.value : null,
    // Always null — see the header comment.
    subjectMatchesHost: null,
    // Always null — see the header comment.
    daysUntilExpiry: null,
  };

  return { status: 'evaluated', findings };
}
