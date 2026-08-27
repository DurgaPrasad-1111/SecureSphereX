/**
 * Permission Context Evaluation Module (module 10 of 10, §2.6). Serves
 * PM-01 (docs/pipeline-design-note.md; confirmed against
 * rulesets/rules-v0.1.0.json requiredModules directly).
 *
 * Contract, verified against evaluation.contract.v1.ts directly (DEC-11 —
 * see docs/pipeline-design-note.md's "module interface signature" section):
 * a module consumes only its own evidence category and produces the
 * Evaluability<F> for its FindingsByModule slot. This function is that core
 * computation for the `permissionContext` category: PermissionContextEvidence
 * in, Evaluability<PermissionContextFindings> out. Assembling the
 * surrounding SecurityEvaluation<'permissionContext'> envelope
 * (evaluationId, evidenceRefs, indicators, consistency, summary,
 * moduleVersion, collectionContext) is Stage 1 orchestration, not this
 * module's concern — out of scope here.
 *
 * Prohibitions observed (docs/pipeline-design-note.md, "What a module is
 * forbidden from doing"): no membership test — PermissionContextFindings'
 * own doc comment (evaluation.contract.v1.ts:222-225) restates this for this
 * module specifically: "Applies NO membership test against the
 * sensitive-permission set — R-03 is applied at Stage 2 (§5.4)."
 * `requestedPermission` is reported as-observed; PM-01's own predicate does
 * the `neq(..., null)` check, and R-03's sensitivePermissions refinement set
 * membership (rulesets/rules-v0.1.0.json) is never consulted here — in fact
 * it cannot fail to match, since `SensitivePermission` is already a closed
 * enum whose members mirror that set exactly (see the refinement set's own
 * rationale). Also observed: no correlation with another module's output,
 * no network access, no store access.
 *
 * STRUCTURAL LIMITATION — `requestingRegistrableDomain`, logged as
 * DEFECT-20 (docs/DEFECTS.md). Same *shape* of gap as DEFECT-15/18/19 (a
 * Findings field with no groundable evidence source): `requestingOrigin`
 * (evidence.contract.v1.ts:284) is a raw origin string, not a registrable
 * domain — deriving one would require PSL-equivalent extraction this module
 * must not perform. UNLIKE DEFECT-15/18/19, this field is currently
 * load-bearing for NO live rule (confirmed by grep against
 * rulesets/rules-v0.1.0.json: `requestingRegistrableDomain` appears nowhere
 * outside its own contract declaration) — recorded for completeness and
 * consistency with the other three occurrences, not because anything reads
 * it today. Reported as `null` unconditionally; `requestingOrigin` is never
 * read.
 */

import type { PermissionContextEvidence } from '../../contracts/evidence.contract.v1';
import type { PermissionContextFindings, Evaluability } from '../../contracts/evaluation.contract.v1';

/**
 * Every Findings field in PermissionContextFindings is nullable
 * (`requestedPermission`, `requestingRegistrableDomain`,
 * `precededByUserGesture`, `pageAgeMs` — all `T | null`), so this module has
 * no non-nullable field forcing unevaluability on its own `absent` reading.
 * Following url.ts's registrableDomain / downloadContext.ts's nullable-field
 * precedent uniformly across all three genuinely-sourced fields: `present`
 * → the value, `absent` → `null` (a genuine negative finding — e.g. no
 * permission was requested at all, the common case: see fixtures/*.ts,
 * where `requestedPermission`/`requestingOrigin`/`precededByUserGesture`
 * are `absent()` together on every page with no permission prompt), and
 * `notCollected` → the whole evaluation is unevaluable (collapsing a
 * capability gap into `null` would misrepresent it as a confirmed-absent
 * fact, the same evidence.contract.v1.ts I-2 concern every other module in
 * this package documents).
 *
 * `requestingOrigin` is NOT gated here and is never read at all (see the
 * header comment) — it backs no field whose evaluability should depend on
 * its Observation state, since `requestingRegistrableDomain` is already an
 * unconditional structural gap regardless of what it reports.
 */
export function computePermissionContextFindings(
  evidence: PermissionContextEvidence,
): Evaluability<PermissionContextFindings> {
  if (
    evidence.requestedPermission.state === 'notCollected' ||
    evidence.precededByUserGesture.state === 'notCollected' ||
    evidence.pageAgeMs.state === 'notCollected'
  ) {
    return { status: 'unevaluable', reason: 'required_evidence_not_collected' };
  }

  const findings: PermissionContextFindings = {
    requestedPermission: evidence.requestedPermission.state === 'present' ? evidence.requestedPermission.value : null,
    // Always null — see the header comment and DEFECT-20.
    requestingRegistrableDomain: null,
    precededByUserGesture:
      evidence.precededByUserGesture.state === 'present' ? evidence.precededByUserGesture.value : null,
    pageAgeMs: evidence.pageAgeMs.state === 'present' ? evidence.pageAgeMs.value : null,
  };

  return { status: 'evaluated', findings };
}
