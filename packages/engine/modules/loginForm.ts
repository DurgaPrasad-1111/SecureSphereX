/**
 * Login Form Evaluation Module (module 5 of 10, §2.6). Serves CRED-01…07,
 * CRED-A1 (docs/pipeline-design-note.md).
 *
 * Contract, verified against evaluation.contract.v1.ts directly (DEC-11 —
 * see docs/pipeline-design-note.md's "module interface signature" section):
 * a module consumes only its own evidence category and produces the
 * Evaluability<F> for its FindingsByModule slot. This function is that core
 * computation for the `loginInterface` category: LoginInterfaceEvidence in,
 * Evaluability<LoginFormFindings> out. Assembling the surrounding
 * SecurityEvaluation<'loginForm'> envelope (evaluationId, evidenceRefs,
 * indicators, consistency, summary, moduleVersion, collectionContext) is
 * Stage 1 orchestration, not this module's concern — out of scope here.
 *
 * `loginInterface` also feeds module 8 (Authentication Context Evaluation,
 * the ACEM) via its `fingerprint` field. This module reads only the two
 * fields LoginFormFindings actually needs — `credentialFormPresent` and
 * `forms`; `fingerprint` is entirely the ACEM's concern and is ignored here,
 * including its Observation state, which never affects this module's
 * evaluability.
 *
 * Prohibitions observed (docs/pipeline-design-note.md, "What a module is
 * forbidden from doing"): no membership test (R-01..R-04 stay at Stage 2),
 * no correlation with another module's output, no network access, no store
 * access.
 *
 * KNOWN STRUCTURAL LIMITATION — `pageRegistrableDomain` (DEFECT-15,
 * docs/DEFECTS.md): LoginInterfaceEvidence carries no field representing the
 * page's own URL or registrable domain — nothing to derive it from. Per
 * §2.6, this module consumes only its own evidence category, so it cannot
 * reach into UrlEvidence (a different category) to obtain one either.
 * `pageRegistrableDomain` is therefore reported `null` unconditionally,
 * documented at its assignment below. This is a genuinely different `null`
 * from url.ts's `registrableDomain`, which can be a confirmed-absent fact
 * (e.g. an IP-literal URL genuinely has none) — here it is a structural gap
 * in the evidence category, not an observation about the page. See the
 * assignment comment and DEFECT-15 for the full explanation and the four
 * live rules (CRED-01, CRED-02, CRED-07, CRED-A1) this makes permanently
 * vacuous until fixed.
 */

import type { LoginInterfaceEvidence } from '../../contracts/evidence.contract.v1';
import type { LoginFormFindings, LoginFormFinding, Evaluability } from '../../contracts/evaluation.contract.v1';

/**
 * Both LoginFormFindings.credentialFormPresent and .forms are non-nullable,
 * so both source Observations MUST be `present` — `absent` or `notCollected`
 * on either makes the whole evaluation unevaluable; no default may be
 * guessed, per evidence.contract.v1.ts I-2 ("a producer MUST NOT emit absent
 * where it means notCollected... conflating them silently converts a
 * capability gap into a clean bill of health"). Same reasoning as url.ts's
 * non-registrableDomain fields: unlike UrlFindings.registrableDomain, no
 * field here has a nullable output type that could legitimately absorb an
 * `absent` observation as a genuine negative finding — `forms: present([])`
 * is already the correct way to report "observed, zero forms present";
 * treating `forms: absent()` as an unstated synonym for that would be
 * guessing what a producer meant, not reading what it reported.
 */
export function computeLoginFormFindings(evidence: LoginInterfaceEvidence): Evaluability<LoginFormFindings> {
  if (
    evidence.credentialFormPresent.state !== 'present' ||
    evidence.forms.state !== 'present'
  ) {
    return { status: 'unevaluable', reason: 'required_evidence_not_collected' };
  }

  const forms: readonly LoginFormFinding[] = evidence.forms.value.map((form) => ({
    fieldKinds: form.fields.map((f) => f.kind),
    method: form.method,
    actionRegistrableDomain: form.actionRegistrableDomain,
    hasHiddenCredentialField: form.fields.some((f) => f.hidden),
    hasAutocompleteDisabledCredential: form.fields.some((f) => f.autocompleteDisabled),
    injectedAfterLoad: form.injectedAfterLoad,
  }));

  const findings: LoginFormFindings = {
    credentialFormPresent: evidence.credentialFormPresent.value,
    forms,
    // Always null — LoginInterfaceEvidence contains no domain field. This is
    // a STRUCTURAL LIMITATION of this evidence category, not a
    // confirmed-absent fact. Distinct from url.ts's registrableDomain, which
    // can be a genuine confirmed-absent (IP literal). See DEFECT-15.
    pageRegistrableDomain: null,
  };

  return { status: 'evaluated', findings };
}
