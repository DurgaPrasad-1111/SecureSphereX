/**
 * Homograph Evaluation Module (module 7 of 10, §2.6). CRED-03 is the only
 * rule served (docs/pipeline-design-note.md).
 *
 * Contract, verified against evaluation.contract.v1.ts directly (DEC-11 —
 * see docs/pipeline-design-note.md's "module interface signature" section):
 * a module consumes only its own evidence category and produces the
 * Evaluability<F> for its FindingsByModule slot. This function is that core
 * computation for the `domainRepresentation` category: DomainRepresentationEvidence
 * in, Evaluability<HomographFindings> out. Assembling the surrounding
 * SecurityEvaluation<'homograph'> envelope (evaluationId, evidenceRefs,
 * indicators, consistency, summary, moduleVersion, collectionContext) is
 * Stage 1 orchestration, not this module's concern — out of scope here.
 *
 * Direct field-for-field mapping — no derivation logic. All five
 * HomographFindings fields (isIdn, containsNonAscii, isMixedScript,
 * scriptsUsed, confusableSkeleton) map to identically-named,
 * identically-shaped DomainRepresentationEvidence fields.
 *
 * `unicodeDomain` and `punycodeDomain` are DELIBERATELY NEVER READ — neither
 * has a corresponding HomographFindings field, and this is not an oversight
 * (docs/ProducerCapabilityManifest.md: `punycodeDomain` is producer-observable
 * but no rule needs the raw string form, only the derived signals below;
 * `unicodeDomain` is not even observable — no content-script API returns the
 * decoded Unicode form separately from the ASCII/punycode form). Neither
 * field's Observation state affects this module's evaluability.
 *
 * Prohibitions observed (docs/pipeline-design-note.md, "What a module is
 * forbidden from doing"): no membership test (R-01..R-04 stay at Stage 2),
 * no correlation with another module's output, no network access, no store
 * access.
 */

import type { DomainRepresentationEvidence } from '../../contracts/evidence.contract.v1';
import type { HomographFindings, Evaluability } from '../../contracts/evaluation.contract.v1';

/**
 * isIdn, containsNonAscii, isMixedScript, and scriptsUsed are all
 * non-nullable in HomographFindings, so their source Observations MUST be
 * `present` — `absent` or `notCollected` on any of them makes the whole
 * evaluation unevaluable; no default may be guessed, per
 * evidence.contract.v1.ts I-2 ("a producer MUST NOT emit absent where it
 * means notCollected... conflating them silently converts a capability gap
 * into a clean bill of health"). This applies equally to scriptsUsed even
 * though it is an array: `scriptsUsed: present([])` is the correct way for a
 * producer to report "observed, zero non-default scripts"; `absent()` is not
 * an unstated synonym for that — same reasoning as loginForm.ts's `forms`
 * field precedent, not url.ts's registrableDomain precedent.
 *
 * confusableSkeleton is the one exception: HomographFindings types it
 * `string | null`, so `absent` (a domain genuinely has no confusable
 * skeleton distinct from itself) maps cleanly to `null` — a real, positive
 * finding, the same shape as url.ts's registrableDomain. `notCollected` on
 * confusableSkeleton still makes the whole evaluation unevaluable;
 * collapsing it to `null` would misrepresent a capability gap as a
 * confirmed-absent fact (the same I-2 concern as above).
 */
export function computeHomographFindings(
  evidence: DomainRepresentationEvidence,
): Evaluability<HomographFindings> {
  if (
    evidence.isIdn.state !== 'present' ||
    evidence.containsNonAscii.state !== 'present' ||
    evidence.isMixedScript.state !== 'present' ||
    evidence.scriptsUsed.state !== 'present' ||
    evidence.confusableSkeleton.state === 'notCollected'
  ) {
    return { status: 'unevaluable', reason: 'required_evidence_not_collected' };
  }

  const confusableSkeleton =
    evidence.confusableSkeleton.state === 'present' ? evidence.confusableSkeleton.value : null;

  const findings: HomographFindings = {
    isIdn: evidence.isIdn.value,
    containsNonAscii: evidence.containsNonAscii.value,
    isMixedScript: evidence.isMixedScript.value,
    scriptsUsed: evidence.scriptsUsed.value,
    confusableSkeleton,
  };

  return { status: 'evaluated', findings };
}
