/**
 * Authentication Context Evaluation Module (module 8 of 10, §2.6, §20.11).
 * Serves CRED-02 (docs/pipeline-design-note.md). The sole architectural
 * path between the Authentication History Store and the evaluation
 * pipeline (B-1: no rule, suppression, or aggregation stage queries the
 * store directly).
 *
 * Contract, verified against evaluation.contract.v1.ts directly (DEC-11 —
 * see docs/pipeline-design-note.md's "module interface signature" section):
 * a module consumes only its own evidence category and produces the
 * Evaluability<F> for its FindingsByModule slot. This module's evidence
 * category is `loginInterface` — the SAME LoginInterfaceEvidence
 * loginForm.ts reads — but only its `fingerprint` field; `credentialFormPresent`
 * and `forms` are entirely loginForm.ts's concern and are ignored here,
 * the exact mirror of loginForm.ts ignoring `fingerprint`. Assembling the
 * surrounding SecurityEvaluation<'authContext'> envelope is Stage 1
 * orchestration, not this module's concern — out of scope here, same as
 * every other module.
 *
 * STRUCTURALLY DIFFERENT FROM url/loginForm/javascript, in two ways forced
 * by the actual contract, not by convention:
 *
 * ASYNC. AuthStoreReader.lookup(origin, current): Promise<AuthStoreLookupResult>
 * (boundary.interfaces.v1.ts) is inherently Promise-returning, so this
 * function returns Promise<Evaluability<AuthContextFindings>>, not a bare
 * Evaluability<AuthContextFindings>.
 *
 * ORIGIN IS A PARAMETER, NOT DERIVED HERE. `lookup()` requires an `Origin`
 * (B-2: "Only toOrigin() constructs an Origin — no cast, no assertion").
 * LoginInterfaceEvidence — this module's only evidence category — carries
 * no URL/domain field to build one from (the same shape of gap as
 * DEFECT-15/18's pageRegistrableDomain: a needed value with no source
 * inside the module's own evidence category). Unlike those, this is an
 * INPUT dependency, not an output field with nowhere to put a real value —
 * so the resolution is architectural, not a documented null: `origin` is
 * supplied by Stage 1 orchestration, constructed via `toOrigin()` against
 * `UrlEvidence.fullUrl` — the full URL, NOT `UrlEvidence.registrableDomain`,
 * which is the eTLD+1 only and a different value entirely (an Origin is
 * `scheme://host[:port]`, not a registrable domain). This module never
 * calls `toOrigin()` and never constructs an `Origin` itself — it only
 * ever receives one, already resolved, as a parameter.
 *
 * storeReader IS DEPENDENCY-INJECTED (an AuthStoreReader, per B-1). Same
 * principle as url.ts/loginForm.ts/javascript.ts's fixture evidence
 * standing in for a real browser: tests supply a fake object implementing
 * the real AuthStoreReader interface, returning canned AuthStoreLookupResult
 * values, since no real Authentication History Store implementation exists
 * yet (docs/How-To-Start-Coding.md: "the store does not exist until week 4").
 *
 * B-3 (the ACEM never calls AuthStoreWriter): enforced by omission — no
 * AuthStoreWriter import exists anywhere in this file, and the injected
 * storeReader parameter is typed AuthStoreReader only, so an AuthStoreWriter
 * could not be passed here without a type error.
 *
 * B-4, structurally enforced, not just followed: `versionMismatch` returns
 * unevaluable(fingerprint_version_mismatch) immediately, before any
 * AuthContextFindings value is constructed. AuthContextFindings itself has
 * no field that could represent "version mismatch" as a value — once the
 * branch below routes 'versionMismatch' to unevaluable correctly, there is
 * no remaining code path by which it could be reported as an absent match.
 *
 * Prohibitions observed (docs/pipeline-design-note.md, "What a module is
 * forbidden from doing"): no membership test, no correlation with another
 * module's output, no network access (the store IS the one sanctioned
 * exception, per B-1 — this is the one module in the register permitted to
 * touch it), no store WRITE access (B-3).
 */

import type { LoginInterfaceEvidence, Origin } from '../../contracts/evidence.contract.v1';
import type { AuthContextFindings, Evaluability } from '../../contracts/evaluation.contract.v1';
import type { AuthStoreReader } from '../../contracts/boundary.interfaces.v1';

/**
 * `fingerprint` is AuthContextFindings' only source field, and every
 * AuthContextFindings field this module can control the shape of (there are
 * none nullable-by-design here the way UrlFindings.registrableDomain is —
 * every field below comes from the store's own response, not from this
 * evidence at all) depends on it being usable. `notCollected` makes the
 * whole evaluation unevaluable — no default may be guessed, per
 * evidence.contract.v1.ts I-2, same reasoning as every other module
 * tonight. `absent` is treated the same as `notCollected`: a page that
 * loaded at all necessarily has SOME title tokens, SOME field composition
 * (even if empty), SOME dominant colors — there is no genuine "the page
 * has no fingerprint" fact the way an IP-literal URL genuinely has no
 * registrable domain, so `absent` here signals a producer defect, not a
 * positive finding, matching url.ts's own precedent for its non-
 * registrableDomain fields.
 */
export async function computeAuthContextFindings(
  origin: Origin,
  evidence: LoginInterfaceEvidence,
  storeReader: AuthStoreReader,
): Promise<Evaluability<AuthContextFindings>> {
  if (evidence.fingerprint.state !== 'present') {
    return { status: 'unevaluable', reason: 'required_evidence_not_collected' };
  }

  const result = await storeReader.lookup(origin, evidence.fingerprint.value);

  if (result.status === 'versionMismatch') {
    // B-4: NEVER surfaced as an absent match. See the header comment — this
    // is the ONLY place a 'versionMismatch' response is handled; no other
    // branch below can be reached with one.
    return { status: 'unevaluable', reason: 'fingerprint_version_mismatch' };
  }

  if (result.status === 'unavailable') {
    // 'store_unavailable' — the only UnevaluableReason tagged "§15.3, ACEM
    // only" (evaluation.contract.v1.ts). result.reason (store_corrupt /
    // store_rebuilding / io_error) has no more specific UnevaluableReason
    // to map to; all three collapse to this one value.
    return { status: 'unevaluable', reason: 'store_unavailable' };
  }

  // result.status === 'available' — the only remaining variant. All four
  // fields are genuine, groundable pass-throughs from the store's own
  // response; no derivation needed.
  const findings: AuthContextFindings = {
    originPresent: result.originPresent,
    lifecycleState: result.lifecycleState,
    fingerprintDrift: result.fingerprintDrift,
    bestCrossOriginMatch: result.bestCrossOriginMatch,
    // true whenever the store responded with a real 'available' result —
    // versionMismatch and unavailable both return above and never reach
    // here, so reaching this line already proves the store was available.
    storeAvailable: true,
  };

  return { status: 'evaluated', findings };
}
