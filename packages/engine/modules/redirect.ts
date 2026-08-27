/**
 * Redirect Evaluation Module (module 4 of 10, §2.6). Serves CRED-04, PM-01
 * (docs/pipeline-design-note.md; confirmed against rulesets/rules-v0.1.0.json
 * requiredModules directly).
 *
 * Contract, verified against evaluation.contract.v1.ts directly (DEC-11 —
 * see docs/pipeline-design-note.md's "module interface signature" section):
 * a module consumes only its own evidence category and produces the
 * Evaluability<F> for its FindingsByModule slot. This function is that core
 * computation for the `redirect` category: RedirectEvidence in,
 * Evaluability<RedirectFindings> out. Assembling the surrounding
 * SecurityEvaluation<'redirect'> envelope (evaluationId, evidenceRefs,
 * indicators, consistency, summary, moduleVersion, collectionContext) is
 * Stage 1 orchestration, not this module's concern — out of scope here.
 *
 * Prohibitions observed (docs/pipeline-design-note.md, "What a module is
 * forbidden from doing"): no membership test (R-01..R-04 stay at Stage 2),
 * no correlation with another module's output, no network access, no store
 * access.
 *
 * STRUCTURAL LIMITATION — `initialRegistrableDomain` and
 * `finalRegistrableDomain`, logged as DEFECT-19 (docs/DEFECTS.md). Same
 * *shape* of gap as DEFECT-15/DEFECT-18 (a Findings field with no
 * groundable evidence source): RedirectEvidence carries `initialUrl` and
 * `finalUrl` as raw URL strings only (evidence.contract.v1.ts:198-204) —
 * every field in this contract that genuinely holds a registrable domain
 * says so explicitly in its name (e.g. `actionRegistrableDomain`,
 * `downloadRegistrableDomain`); these two do not. Deriving a domain from a
 * raw URL string requires PSL-equivalent registrable-domain extraction
 * inside this module — exactly the class of thing a module must not do
 * (restated explicitly for `javascript.ts`'s equivalent gap, DEFECT-18);
 * that derivation belongs at Stage 1 in the evidence PRODUCER, never here.
 * Unlike DEFECT-15/16's fix (swap the operand to `url.registrableDomain`),
 * no such substitute exists here — CRED-04 and PM-01 both compare
 * `redirect.finalRegistrableDomain` against `redirect.initialRegistrableDomain`,
 * two values from THIS module's own category, not a cross-module "page"
 * reference `url` could stand in for. Both are reported `null`
 * unconditionally, documented at their assignment below.
 *
 * Consequence: CRED-04's `notSameSite(redirect.finalRegistrableDomain,
 * redirect.initialRegistrableDomain)` conjunct can never match while both
 * operands stay null — CRED-04 is structurally unable to fire, full stop
 * (all three conjuncts in its `and` are required). PM-01's `or` has a second
 * arm (`permissionContext.pageAgeMs` below threshold) that does not depend
 * on this gap, so PM-01 is degraded, not disabled — it can still fire via
 * the page-age arm alone. See DEFECT-19 for the full analysis, including
 * the observation that `RedirectEvidence.crossedRegistrableDomain`
 * (evidence.contract.v1.ts:203) already carries a producer-computed
 * same-site verdict as a boolean, but `RedirectFindings` has no field
 * shaped to receive a boolean rather than the two domain strings it asks
 * for instead.
 */

import type { RedirectEvidence } from '../../contracts/evidence.contract.v1';
import type { RedirectFindings, Evaluability } from '../../contracts/evaluation.contract.v1';

/**
 * `hopCount` is non-nullable in RedirectFindings, so its source Observation
 * MUST be `present` — `absent` or `notCollected` makes the whole evaluation
 * unevaluable; no default may be guessed, per evidence.contract.v1.ts I-2.
 * Unlike `chain`, there is no legitimate `absent` reading for `hopCount`
 * itself: the producer always reports a count, 0 when there is no redirect
 * (see fixtures/clean-login.ts's `hopCount: present(0)` alongside
 * `chain: absent()`) — `hopCount` and `chain` encode the same fact two
 * different ways and are gated independently below.
 *
 * `chain` follows url.ts's registrableDomain precedent instead:
 * `present` (a real hop list) and `absent` (looked, zero hops — the direct
 * arrival case) are both legitimate and treated as chainLength 0 /
 * mechanisms [] when absent; only `notCollected` makes the evaluation
 * unevaluable.
 *
 * `initialUrl`, `finalUrl`, and `crossedRegistrableDomain` are NOT gated
 * here and are never read at all (see the header comment) — neither backs a
 * field whose evaluability should depend on their Observation state, since
 * `initialRegistrableDomain`/`finalRegistrableDomain` are already
 * unconditional structural gaps regardless of what these three report.
 */
export function computeRedirectFindings(evidence: RedirectEvidence): Evaluability<RedirectFindings> {
  if (evidence.hopCount.state !== 'present' || evidence.chain.state === 'notCollected') {
    return { status: 'unevaluable', reason: 'required_evidence_not_collected' };
  }

  const chain = evidence.chain.state === 'present' ? evidence.chain.value : [];

  const findings: RedirectFindings = {
    hopCount: evidence.hopCount.value,
    // Always null — see the header comment and DEFECT-19.
    initialRegistrableDomain: null,
    // Always null — see the header comment and DEFECT-19.
    finalRegistrableDomain: null,
    // One entry per hop, in chain order — the direct per-hop projection,
    // not deduplicated. Deduplicating would be an invented design choice
    // with no source text to justify it (cf. url.ts's explicit reasoning
    // for its own undocumented derivations).
    mechanisms: chain.map((hop) => hop.mechanism),
    chainLength: chain.length,
  };

  return { status: 'evaluated', findings };
}
