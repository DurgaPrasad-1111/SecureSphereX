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
 * `transmissionEndpointDomains` — RESOLVED (engine-consumption half,
 * 2026-09-03), the same shape of fix as DEFECT-19's RedirectFindings.
 * ScriptRuntimeEvidence now carries a producer-PSL-resolved
 * `transmissionEndpointDomains: Observation<readonly string[]>` (contract
 * Amendment B, evidence.contract.v1.ts; the harness extractor
 * apps/harness/extract/scriptRuntime.ts derives it via the shared psl.ts
 * resolver, §2.6-compliant because the derivation is producer-side). This
 * module now READS it — a projection, not a derivation: present -> value,
 * absent -> [] (looked, no endpoints), notCollected -> the whole evaluation
 * unevaluable, mirroring the `chain` handling in redirect.ts exactly. It
 * never derives a domain itself. Consequence: CRED-05's `exists` over this
 * field is no longer vacuously false — the operand carries real domains once
 * the module is evaluable. The remaining CRED-05 blocker is the SEPARATE
 * transmission-observation gate (`clientSideTransmissionObserved`, Tier 4,
 * notCollected until the sentinel run) — this fix removes a structural
 * blocker that sat BEHIND that gate, it does not change that gate. See
 * DEFECT-18.
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
 * `transmissionEndpointDomains` IS now gated and read (DEFECT-18
 * engine-consumption fix): notCollected -> unevaluable, present -> value,
 * absent -> [] — the `chain` precedent in redirect.ts. `transmissionEndpoints`
 * (the raw strings) stays unread — the producer-resolved domain field is what
 * this module projects, never the raw endpoints.
 *
 * `dynamicScriptOrigins` is NOT gated here and is never read at all —
 * `evidence.dynamicScriptOrigins.value` is ignored (see the header comment on
 * injectingScriptOriginDomain). It does not back a field whose evaluability
 * should depend on its Observation state, since injectingScriptOriginDomain
 * remains an unconditional structural gap (no evidence source in this
 * category at all) regardless of what it reports.
 */
export function computeJavaScriptFindings(evidence: ScriptRuntimeEvidence): Evaluability<JavaScriptFindings> {
  if (
    evidence.listenerOnCredentialField.state !== 'present' ||
    evidence.clientSideTransmissionObserved.state !== 'present' ||
    evidence.dynamicScriptLoadCount.state !== 'present' ||
    evidence.credentialInterfaceInjected.state !== 'present' ||
    // notCollected -> unevaluable (I-2: never fabricate [] for "not looked");
    // absent is legitimate ("looked, no endpoints") and maps to [] below,
    // exactly as redirect.ts treats its `chain`.
    evidence.transmissionEndpointDomains.state === 'notCollected'
  ) {
    return { status: 'unevaluable', reason: 'required_evidence_not_collected' };
  }

  const findings: JavaScriptFindings = {
    listenerOnCredentialField: evidence.listenerOnCredentialField.value,
    clientSideTransmissionObserved: evidence.clientSideTransmissionObserved.value,
    // DEFECT-18 engine-consumption fix (mirrors DEFECT-19's redirect fix):
    // project the producer-derived domains from evidence — present -> value,
    // absent -> [] (looked, no endpoints); notCollected is gated to
    // unevaluable above. §2.6: a projection, not a derivation. See the header
    // comment and DEFECT-18.
    transmissionEndpointDomains:
      evidence.transmissionEndpointDomains.state === 'present'
        ? evidence.transmissionEndpointDomains.value
        : [],
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
