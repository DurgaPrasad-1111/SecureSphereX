/**
 * `scriptRuntime` extraction — DEC-29 Tier 1 (network) + DEC-30/33/34 Tier 3
 * (listener detection), both now genuinely derivable:
 *
 *   transmissionEndpoints    <- script-initiated off-navigation POSTs
 *   dynamicScriptLoadCount   <- scripts requested after DOMContentLoaded
 *   dynamicScriptOrigins     <- their URLs
 *   listenerOnCredentialField <- CDP DOMDebugger.getEventListeners, scoped to
 *                                DEC-33's signed declared-signal selector
 *
 * Two fields remain `notCollected` unconditionally:
 *
 *   credentialInterfaceInjected     Tier 3 step 5 (pre-load MutationObserver)
 *                                   — NOT built, DEC-30 Part 4
 *   clientSideTransmissionObserved  Tier 4 — deliberately never inferred;
 *                                   see the note at its assignment
 *
 * ────────────────────────────────────────────────────────────────────────
 * Reads TWO independent, independently-nullable RawMaterial keys —
 * `scriptRuntimeObservations` (Tier 1) and `listenerObservations` (Tier 3),
 * both now IN the frozen contract, hand-typed by the Architecture Owner.
 * They are NOT coupled: a snapshot can have one, both, or neither, even
 * though today's `capture_one()` always attempts both together. Each is
 * read and validated independently — `listenerOnCredentialField` is
 * computed from `listenerObservations` alone, never gated behind
 * `scriptRuntimeObservations`'s own validity (see
 * `computeListenerOnCredentialField` below).
 *
 * Absence of either key, for any snapshot, reads as `notCollected`, never
 * `absent` (S-7) — that snapshot's capture predates the relevant tier, so
 * nothing was established about it, which is a capability gap, not a
 * negative finding.
 * ────────────────────────────────────────────────────────────────────────
 */

import {
  present, notCollected,
  type ScriptRuntimeEvidence, type Observation,
} from '../../../packages/contracts/evidence.contract.v1.ts';
import type { RawMaterial } from '../../../packages/contracts/snapshot.format.v1.ts';
import { registrableDomainsOf } from '../../../packages/engine/psl.ts';

const nc = <T>(): Observation<T> => notCollected<T>('api_unavailable');

/**
 * The shape `capture.py` writes. Declared here rather than imported because
 * it is deliberately NOT in the frozen contract yet — this interface IS the
 * proposed amendment, in the form the extractor needs it.
 */
export interface ScriptRuntimeObservations {
  readonly transmissionEndpoints: readonly string[];
  readonly dynamicScriptOrigins: readonly string[];
  readonly dynamicScriptLoadCount: number;
  readonly postRequestCount: number;
  readonly postAfterDclCount: number;
}

/**
 * Structural validation before trusting the key.
 *
 * Not defensive programming for its own sake: a snapshot is an on-disk
 * artifact that may have been written by ANY version of `capture.py`,
 * including one predating this field or an intermediate one whose shape
 * differed. Reading it unchecked would let a malformed or partial observation
 * become confident-looking evidence, which is the I-2 failure in a new place.
 */
function isObservations(v: unknown): v is ScriptRuntimeObservations {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o['transmissionEndpoints'])
    && Array.isArray(o['dynamicScriptOrigins'])
    && typeof o['dynamicScriptLoadCount'] === 'number';
}

/**
 * The shape `capture.py`'s `_collect_listener_observations` writes, via
 * `RawMaterial.listenerObservations` (DEC-30/DEC-33/DEC-34 amendment).
 * Declared here for the same reason `ScriptRuntimeObservations` is: this
 * interface IS what the raw key is validated against, kept next to its
 * validator rather than imported from the frozen contract's inline type.
 */
export interface ListenerObservationEntry {
  readonly mainFrame: boolean;
  readonly fieldIndex: number;
  readonly listenerTypes: readonly string[];
}

function isListenerObservations(v: unknown): v is readonly ListenerObservationEntry[] {
  return Array.isArray(v) && v.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const e = entry as Record<string, unknown>;
    return typeof e['mainFrame'] === 'boolean'
      && typeof e['fieldIndex'] === 'number'
      && Array.isArray(e['listenerTypes']);
  });
}

/**
 * `listenerOnCredentialField` computed INDEPENDENTLY of
 * `scriptRuntimeObservations` (Tier 1) -- `listenerObservations` (Tier 3) is
 * its own separate, independently-nullable RawMaterial field per the
 * contract, and nothing guarantees the two co-occur beyond today's
 * `capture_one()` happening to write both together. Nesting this inside the
 * Tier-1 early-return below would silently report `notCollected` for a
 * snapshot that has real Tier 3 data but malformed/absent Tier 1 data --
 * a real bug, not a hypothetical, given the two are independently nullable.
 *
 * Present/absent, not a capability-SHAPE gap (contrast DEFECT-31, where
 * `Observation<T[]>` cannot express a per-element gap inside an array). This
 * is a whole-field question the existing three-state Observation model
 * already answers cleanly: the array itself is either genuinely there
 * (Tier 3 ran) or it is not (it did not) -- no shape mismatch to work around.
 *
 * `'api_unavailable'` reused deliberately, not a new reason code: this is
 * the SAME situation `scriptRuntimeObservations`'s absence already uses it
 * for -- capture predates the capability, not a runtime failure of one that
 * exists (that would be `collector_error` or `timeout`, per the per-field
 * try/except in `_collect_listener_observations` degrading to fewer results,
 * never to a failure signal reaching here).
 */
function computeListenerOnCredentialField(raw: RawMaterial): Observation<boolean> {
  const listenerObservations = (raw as unknown as Record<string, unknown>)['listenerObservations'];
  if (!isListenerObservations(listenerObservations)) return nc<boolean>();
  // Present(false) is a real, meaningful negative: Tier 3 ran, queried the
  // declared-signal credential fields, and found zero listeners of interest
  // -- exactly as S-7 requires or 3,895+ genuine "no listener" snapshots
  // would incorrectly collapse into "we don't know".
  return present(listenerObservations.length > 0);
}

export function extractScriptRuntime(raw: RawMaterial): ScriptRuntimeEvidence {
  // The superset key, read without widening RawMaterial itself.
  const observations = (raw as unknown as Record<string, unknown>)['scriptRuntimeObservations'];
  const listenerOnCredentialField = computeListenerOnCredentialField(raw);

  if (!isObservations(observations)) {
    // Every snapshot captured before DEC-29 Tier 1 lands here. notCollected,
    // never absent: the network was not observed, so nothing was established.
    // listenerOnCredentialField is NOT forced notCollected here -- see its
    // own computation above, independent of this Tier 1 gate.
    return {
      listenerOnCredentialField,
      clientSideTransmissionObserved: nc<boolean>(),
      transmissionEndpoints: nc<readonly string[]>(),
      // Same reason code as its source field, necessarily: a derived value
      // cannot be better-established than what it is derived FROM. The
      // endpoints were not collected, so their domains were not either.
      transmissionEndpointDomains: nc<readonly string[]>(),
      dynamicScriptLoadCount: nc<number>(),
      dynamicScriptOrigins: nc<readonly string[]>(),
      credentialInterfaceInjected: nc<boolean>(),
    };
  }

  // S-6: capture.py already sorts and de-duplicates both arrays at
  // serialisation. Re-sorting here is deliberate belt-and-braces — the
  // extractor must not depend on a producer's ordering discipline holding,
  // and a copy is taken because the contract types are readonly.
  const endpoints = [...observations.transmissionEndpoints].sort();
  const scriptOrigins = [...observations.dynamicScriptOrigins].sort();

  // ── Amendment B: PRODUCER-SIDE PSL derivation ────────────────────────
  //
  // This is the derivation the contract says belongs here. `javascript.ts`'s
  // header is explicit that a MODULE must not do it ("PSL-equivalent
  // registrable-domain extraction logic inside this module — exactly the class
  // of thing a module must not do; that derivation belongs at Stage 1 in the
  // evidence PRODUCER"). The extractor IS the producer, so this is its job.
  //
  // Uses `psl.ts` — the same V-15-gated path `url.registrableDomain` and
  // `actionRegistrableDomain` use. That shared path is load-bearing, not
  // tidiness: CRED-05 compares these domains against `url.registrableDomain`
  // with `notSameSite`, and a comparison between two values derived by
  // different code is only meaningful if they cannot diverge.
  const endpointDomains = registrableDomainsOf(endpoints);

  return {
    transmissionEndpoints: present(endpoints),
    transmissionEndpointDomains: present(endpointDomains),
    dynamicScriptOrigins: present(scriptOrigins),
    dynamicScriptLoadCount: present(observations.dynamicScriptLoadCount),

    // ── Tier 3 ───────────────────────────────────────────────────────────
    // listenerOnCredentialField: DEC-30/33/34, BUILT -- computed above,
    // independent of this Tier 1 branch (see computeListenerOnCredentialField).
    // credentialInterfaceInjected: step 5 (pre-load MutationObserver) is
    // NOT built (DEC-30 Part 4); stays notCollected until it is.
    listenerOnCredentialField,
    credentialInterfaceInjected: nc<boolean>(),

    // ── Tier 4, deliberately NOT inferred ────────────────────────────────
    //
    // It is tempting to write `present(endpoints.length > 0)` here. That would
    // be WRONG, and the reason is the whole of DEC-29's Tier 4 finding.
    //
    // An off-site POST proves a request happened. It does NOT prove
    // CREDENTIALS left the page — analytics, telemetry and ad beacons produce
    // identical network signatures. Inferring transmission from any POST would
    // over-report in an unbounded direction, and per DEFECT-32's reasoning a
    // bidirectional error yields no publishable bound at all.
    //
    // Worse, it would over-report on BENIGN pages preferentially, since those
    // are the ones carrying real analytics — the same failure shape that
    // DEFECT-32's email-only classification had, and which was measured at 36%
    // of benign positives before it was ruled out.
    //
    // Measured directly (DEC-29 Tier 4): a synthetic kit exfiltrating ONLY on
    // submit produced ZERO observable network activity. The signal does not
    // exist passively for that kit class — not "we cannot see it", but "it has
    // not happened".
    clientSideTransmissionObserved: nc<boolean>(),
  };
}
