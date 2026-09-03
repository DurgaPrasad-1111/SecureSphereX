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
 * DEFECT-19 — RESOLVED via Option B (Annex A amendment, Architecture-Owner
 * ruling, docs/DEC-19-CRED04-fix-path-REVIEW.md). `RedirectEvidence` now
 * carries `initialRegistrableDomain` / `finalRegistrableDomain` as
 * `Observation<string>` (evidence.contract.v1.ts:201-202), producer-derived
 * via the shared PSL resolver — the extension collector (redirect-observer.ts)
 * and the harness extractor (apps/harness/extract/redirect.ts) both compute
 * them, §2.6-compliant because the derivation is producer-side. This module
 * now READS them (present -> value, absent -> null; notCollected -> the whole
 * evaluation unevaluable), mirroring DEFECT-15's `url.registrableDomain` fix
 * exactly. It never derives a domain itself.
 *
 * Consequence: CRED-04's `notSameSite(redirect.finalRegistrableDomain,
 * redirect.initialRegistrableDomain)` conjunct can now match — CRED-04 CAN
 * fire when a credential-bearing redirect crosses a registrable-domain
 * boundary with hopCount >= redirect_hop_min. `notSameSite(x, x)` on a
 * same-site redirect correctly does NOT match (stage2.ts). PM-01's redirect
 * arm is likewise restored.
 *
 * ⚠️ S-10 IS NOT LIFTED. snapshot.format.v1.ts:353 — CRED-04 remains
 * DIVERGENT (the harness sees server-side redirect chains the extension may
 * not), so its corpus recall MUST be reported separately and MUST NOT be
 * folded into a headline. This fix lets CRED-04 fire; it does not make CRED-04
 * corpus-headline-valid. A green test here proves the mechanism, not corpus
 * validatability.
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
  if (
    evidence.hopCount.state !== 'present' ||
    evidence.chain.state === 'notCollected' ||
    evidence.initialRegistrableDomain.state === 'notCollected' ||
    evidence.finalRegistrableDomain.state === 'notCollected'
  ) {
    return { status: 'unevaluable', reason: 'required_evidence_not_collected' };
  }

  const chain = evidence.chain.state === 'present' ? evidence.chain.value : [];

  // DEFECT-19 RESOLVED (Option B, Annex A amendment): read the producer-derived
  // registrable domains from evidence, mirroring DEFECT-15's url.registrableDomain
  // fix exactly — present -> value, absent -> null. notCollected is gated to
  // unevaluable above. §2.6: this is a projection, not a derivation.
  const findings: RedirectFindings = {
    hopCount: evidence.hopCount.value,
    initialRegistrableDomain:
      evidence.initialRegistrableDomain.state === 'present' ? evidence.initialRegistrableDomain.value : null,
    finalRegistrableDomain:
      evidence.finalRegistrableDomain.state === 'present' ? evidence.finalRegistrableDomain.value : null,
    // One entry per hop, in chain order — the direct per-hop projection,
    // not deduplicated. Deduplicating would be an invented design choice
    // with no source text to justify it (cf. url.ts's explicit reasoning
    // for its own undocumented derivations).
    mechanisms: chain.map((hop) => hop.mechanism),
    chainLength: chain.length,
  };

  return { status: 'evaluated', findings };
}
