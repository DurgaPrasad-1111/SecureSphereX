/**
 * JavaScript Evaluation Module (module 6 of 10, §2.6). Serves CRED-05,
 * CRED-A1 (docs/pipeline-design-note.md).
 *
 * Contract, verified against evaluation.contract.v1.ts directly (DEC-11 —
 * see docs/pipeline-design-note.md's "module interface signature" section):
 * a module consumes only its own evidence category and produces the
 * Evaluability<F> for its FindingsByModule slot. This function is that core
 * computation for the `scriptRuntime` category: ScriptRuntimeEvidence in,
 * Evaluability<JavaScriptFindings> out. Assembling the surrounding
 * SecurityEvaluation<'javascript'> envelope (evaluationId, evidenceRefs,
 * indicators, consistency, summary, moduleVersion, collectionContext) is
 * Stage 1 orchestration, not this module's concern — out of scope here.
 *
 * Prohibitions observed (docs/pipeline-design-note.md, "What a module is
 * forbidden from doing"): no membership test (R-01..R-04 stay at Stage 2),
 * no correlation with another module's output, no network access, no store
 * access.
 *
 * TWO STRUCTURAL LIMITATIONS, logged as DEFECT-18 (docs/DEFECTS.md) — the
 * same *shape* of gap as DEFECT-15's `pageRegistrableDomain` (a Findings
 * field with no groundable evidence source), not DEFECT-16 (a rule's
 * requiredModules missing a module its own predicate needs) — naming every
 * module in a rule's requiredModules cannot fix either gap below, since
 * §2.6 forbids a MODULE, not a rule, from crossing evidence categories:
 *
 * `transmissionEndpointDomains` — ScriptRuntimeEvidence has exactly one
 * transmission-related field, `transmissionEndpoints: Observation<readonly
 * string[]>` (raw endpoint strings — every field in this contract that
 * genuinely holds a registrable domain says so explicitly in its name,
 * e.g. actionRegistrableDomain, downloadRegistrableDomain; this one does
 * not). Deriving a domain from a raw endpoint string would require
 * PSL-equivalent registrable-domain extraction logic inside this module —
 * exactly the class of thing a module must not do; that derivation belongs
 * at Stage 1 in the evidence PRODUCER, or is R-01 territory reserved for
 * Stage 2, never here. Reported as `[]` unconditionally, documented at the
 * assignment below. Consequence: CRED-05's only reference to this field is
 * an `exists` over it — vacuously false forever while it stays `[]`.
 *
 * `injectingScriptOriginDomain` — the only evidence field that plausibly
 * answers "which script's origin injected this" is
 * `LoginFormObservation.injectingScriptOrigin` (evidence.contract.v1.ts:221)
 * — but that field lives inside `LoginInterfaceEvidence` (the
 * `loginInterface` category, nested per-form), not `ScriptRuntimeEvidence`.
 * Per §2.6 this module cannot reach into a different evidence category to
 * get it. `ScriptRuntimeEvidence`'s own `dynamicScriptOrigins` is a flat,
 * unlinked list — nothing ties any entry to `credentialInterfaceInjected`.
 * Reported as `null` unconditionally, documented at the assignment below.
 * Consequence: CRED-A1's notSameSite predicate always receives null as its
 * left operand — see DEFECT-18 for why this leaves CRED-A1 structurally
 * unable to fire even after DEFECT-15's fix to the comparison's other side.
 */

import type { ScriptRuntimeEvidence } from '../../contracts/evidence.contract.v1';
import type { JavaScriptFindings, Evaluability } from '../../contracts/evaluation.contract.v1';

/**
 * listenerOnCredentialField, clientSideTransmissionObserved,
 * dynamicScriptLoadCount, and credentialInterfaceInjected are all
 * non-nullable in JavaScriptFindings, so their source Observations MUST be
 * `present` — `absent` or `notCollected` on any of them makes the whole
 * evaluation unevaluable; no default may be guessed, per
 * evidence.contract.v1.ts I-2 ("a producer MUST NOT emit absent where it
 * means notCollected... conflating them silently converts a capability gap
 * into a clean bill of health"). Same reasoning as url.ts's and
 * loginForm.ts's non-nullable fields.
 *
 * transmissionEndpoints and dynamicScriptOrigins are NOT gated here — and
 * are never read at all. `evidence.transmissionEndpoints.value` is never
 * touched (transmissionEndpointDomains is hardcoded [] unconditionally, not
 * derived from it); `evidence.dynamicScriptOrigins.value` is likewise
 * ignored (see the header comment on injectingScriptOriginDomain). Neither
 * backs a field whose evaluability should depend on this evidence's
 * Observation state, since
 * transmissionEndpointDomains and injectingScriptOriginDomain are already
 * unconditional structural gaps regardless of what these two Observations
 * report.
 */
export function computeJavaScriptFindings(evidence: ScriptRuntimeEvidence): Evaluability<JavaScriptFindings> {
  if (
    evidence.listenerOnCredentialField.state !== 'present' ||
    evidence.clientSideTransmissionObserved.state !== 'present' ||
    evidence.dynamicScriptLoadCount.state !== 'present' ||
    evidence.credentialInterfaceInjected.state !== 'present'
  ) {
    return { status: 'unevaluable', reason: 'required_evidence_not_collected' };
  }

  const findings: JavaScriptFindings = {
    listenerOnCredentialField: evidence.listenerOnCredentialField.value,
    clientSideTransmissionObserved: evidence.clientSideTransmissionObserved.value,
    // Always [] — ScriptRuntimeEvidence has no registrable-domain field for
    // transmission endpoints, only raw endpoint strings. Deriving one here
    // would require PSL-equivalent logic this module must not perform. See
    // the header comment and DEFECT-18.
    transmissionEndpointDomains: [],
    dynamicScriptLoadCount: evidence.dynamicScriptLoadCount.value,
    credentialInterfaceInjected: evidence.credentialInterfaceInjected.value,
    // Always null — the evidence that could answer this
    // (LoginFormObservation.injectingScriptOrigin) lives in a different
    // evidence category (loginInterface), which this module cannot read
    // per §2.6. ScriptRuntimeEvidence's own dynamicScriptOrigins has no
    // link to credentialInterfaceInjected. See the header comment and
    // DEFECT-18.
    injectingScriptOriginDomain: null,
  };

  return { status: 'evaluated', findings };
}
