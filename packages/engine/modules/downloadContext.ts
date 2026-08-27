/**
 * Download Context Evaluation Module (module 9 of 10, §2.6). Serves DL-01,
 * DL-02 (docs/pipeline-design-note.md; confirmed against
 * rulesets/rules-v0.1.0.json requiredModules directly).
 *
 * Contract, verified against evaluation.contract.v1.ts directly (DEC-11 —
 * see docs/pipeline-design-note.md's "module interface signature" section):
 * a module consumes only its own evidence category and produces the
 * Evaluability<F> for its FindingsByModule slot. This function is that core
 * computation for the `downloadContext` category: DownloadContextEvidence
 * in, Evaluability<DownloadContextFindings> out. Assembling the surrounding
 * SecurityEvaluation<'downloadContext'> envelope (evaluationId, evidenceRefs,
 * indicators, consistency, summary, moduleVersion, collectionContext) is
 * Stage 1 orchestration, not this module's concern — out of scope here.
 *
 * Prohibitions observed (docs/pipeline-design-note.md, "What a module is
 * forbidden from doing"): no membership test (R-01..R-04 stay at Stage 2) —
 * DownloadContextFindings' own doc comment (evaluation.contract.v1.ts:206-209)
 * restates this for this module specifically: "Applies NO membership test
 * against the executable set — R-02 is a predicate refinement applied at
 * Stage 2 (§5.3), not a module responsibility. The module reports the
 * classification inputs; the rule decides membership." `declaredExtension`
 * is therefore reported as-observed, never checked against
 * refinementSets.executableTypes here — that's DL-01's `inSet` operand's job.
 * Also observed: no correlation with another module's output, no network
 * access, no store access.
 *
 * Unlike redirect.ts (DEFECT-19) and loginForm.ts/javascript.ts
 * (DEFECT-15/18), this category has NO structural gap:
 * `downloadRegistrableDomain` and `referrerRegistrableDomain` are already
 * pre-extracted domain strings in the evidence itself
 * (evidence.contract.v1.ts:270,272) — the producer, not this module, does
 * the PSL-equivalent extraction, exactly the shape the other three
 * categories are missing. Every DownloadContextFindings field is genuinely
 * groundable from DownloadContextEvidence.
 *
 * `extensionMimeConsistent` (DL-02) has no direct source field — same
 * situation as url.ts's `suspiciousKeywordCount`/`specialCharacterDensity`:
 * no contract text specifies its derivation, so one is built here and
 * reasoned about explicitly (see `EXTENSION_MIME_MAP` below and DL-02's own
 * knownLimitations in rulesets/rules-v0.1.0.json: "Declared content types
 * are frequently generic, limiting how often the inconsistency test can
 * conclude anything" — the map is deliberately conservative and returns
 * `null` (cannot conclude) rather than guessing, for any extension or MIME
 * type it does not recognize with confidence).
 */

import type { DownloadContextEvidence } from '../../contracts/evidence.contract.v1';
import type { DownloadContextFindings, Evaluability } from '../../contracts/evaluation.contract.v1';

/**
 * Conservative, IANA-registered-only mapping from a declared extension to
 * the set of declared MIME types considered CONSISTENT with it. Extensions
 * from refinementSets.executableTypes (rulesets/rules-v0.1.0.json) with no
 * single well-established canonical MIME type (`bat`, `cmd`, `com`, `scr`,
 * `ps1`, `lnk` — all Windows-native formats with no IANA-registered media
 * type) are deliberately OMITTED rather than guessed; an omitted extension
 * always yields `null` (cannot conclude) below. A draft, conservative
 * starting map, same spirit as refinementSets.executableTypes itself being
 * documented as a "draft starting list."
 */
const EXTENSION_MIME_MAP: Readonly<Record<string, readonly string[]>> = {
  exe: ['application/x-msdownload', 'application/x-dosexec', 'application/vnd.microsoft.portable-executable'],
  msi: ['application/x-msi'],
  dmg: ['application/x-apple-diskimage'],
  pkg: ['application/x-newton-compatible-pkg'],
  sh: ['application/x-sh', 'text/x-shellscript'],
  vbs: ['text/vbscript'],
  js: ['text/javascript', 'application/javascript'],
  jar: ['application/java-archive'],
  apk: ['application/vnd.android.package-archive'],
  zip: ['application/zip', 'application/x-zip-compressed'],
  rar: ['application/vnd.rar', 'application/x-rar-compressed'],
  '7z': ['application/x-7z-compressed'],
  iso: ['application/x-iso9660-image'],
};

/**
 * Generic/catch-all content types that no declared extension can be judged
 * consistent OR inconsistent against — the exact case DL-02's
 * knownLimitations names ("servers emitting generic octet-stream content
 * types"). Always inconclusive, regardless of extension.
 */
const GENERIC_MIME_TYPES = new Set(['application/octet-stream', 'binary/octet-stream', 'application/unknown']);

function computeExtensionMimeConsistent(
  extension: string | null,
  mimeType: string | null,
): boolean | null {
  if (extension === null || mimeType === null) return null;
  const normalizedMime = mimeType.toLowerCase().trim();
  if (GENERIC_MIME_TYPES.has(normalizedMime)) return null;
  const known = EXTENSION_MIME_MAP[extension.toLowerCase().trim()];
  if (known === undefined) return null;
  return known.includes(normalizedMime);
}

/**
 * `hasCompoundExtension` is non-nullable in DownloadContextFindings, so its
 * source Observation MUST be `present` — `absent` or `notCollected` makes
 * the whole evaluation unevaluable; no default may be guessed, per
 * evidence.contract.v1.ts I-2. Same reasoning as url.ts's non-nullable
 * fields: a plain boolean output type has no slot to distinguish "observed
 * false" from "not observed."
 *
 * `referrerPresent` is ALSO non-nullable, but is handled differently: it is
 * not a passthrough of any single evidence field, it is a derived summary
 * of `referrerUrl`'s own Observation state — `present` means a referrer was
 * observed (true), `absent` means one was genuinely looked for and not
 * found (false; DL-01's own knownLimitations names this as the expected
 * direct-navigation case, not a capability gap), and only `notCollected`
 * (could not look) makes the evaluation unevaluable. This is a faithful 1:1
 * encoding of what was actually observed, not a guessed default — the same
 * reasoning url.ts applies deriving `isSecureScheme` from `scheme`.
 *
 * `declaredExtension`, `declaredMimeType`, `downloadRegistrableDomain`, and
 * `referrerRegistrableDomain` are all nullable in Findings, so they follow
 * url.ts's registrableDomain precedent: `present` → the value, `absent` →
 * `null` (a genuine negative finding — e.g. no extension on the filename,
 * no content-type header, an IP-literal download/referrer URL), and
 * `notCollected` → the whole evaluation is unevaluable (collapsing a
 * capability gap into `null` would misrepresent it as a confirmed-absent
 * fact, the same I-2 concern url.ts documents for its own nullable field).
 *
 * `downloadUrl`, `referrerUrl`'s VALUE (only its Observation state is used,
 * for `referrerPresent`), and `declaredFilename` are not read at all — no
 * Findings field is sourced from them.
 */
export function computeDownloadContextFindings(
  evidence: DownloadContextEvidence,
): Evaluability<DownloadContextFindings> {
  if (
    evidence.hasCompoundExtension.state !== 'present' ||
    evidence.referrerUrl.state === 'notCollected' ||
    evidence.declaredExtension.state === 'notCollected' ||
    evidence.declaredMimeType.state === 'notCollected' ||
    evidence.downloadRegistrableDomain.state === 'notCollected' ||
    evidence.referrerRegistrableDomain.state === 'notCollected'
  ) {
    return { status: 'unevaluable', reason: 'required_evidence_not_collected' };
  }

  const declaredExtension = evidence.declaredExtension.state === 'present' ? evidence.declaredExtension.value : null;
  const declaredMimeType = evidence.declaredMimeType.state === 'present' ? evidence.declaredMimeType.value : null;
  const downloadRegistrableDomain =
    evidence.downloadRegistrableDomain.state === 'present' ? evidence.downloadRegistrableDomain.value : null;
  const referrerRegistrableDomain =
    evidence.referrerRegistrableDomain.state === 'present' ? evidence.referrerRegistrableDomain.value : null;

  const findings: DownloadContextFindings = {
    declaredExtension,
    declaredMimeType,
    extensionMimeConsistent: computeExtensionMimeConsistent(declaredExtension, declaredMimeType),
    hasCompoundExtension: evidence.hasCompoundExtension.value,
    downloadRegistrableDomain,
    referrerRegistrableDomain,
    referrerPresent: evidence.referrerUrl.state === 'present',
  };

  return { status: 'evaluated', findings };
}
