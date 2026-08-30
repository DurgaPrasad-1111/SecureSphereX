/**
 * `scriptRuntime` extraction — DEC-29 Tier 1, the NETWORK-OBSERVED subset only.
 *
 * Three of six fields are now genuinely derivable, because `capture.py`
 * observes them passively at the network layer (`page.on("request")`):
 *
 *   transmissionEndpoints    <- script-initiated off-navigation POSTs
 *   dynamicScriptLoadCount   <- scripts requested after DOMContentLoaded
 *   dynamicScriptOrigins     <- their URLs
 *
 * The other three still require in-page instrumentation (DEC-29 Tier 3) or a
 * governance ruling (Tier 4), and remain `notCollected`:
 *
 *   listenerOnCredentialField       Tier 3 — CDP DOMDebugger.getEventListeners
 *   credentialInterfaceInjected     Tier 3 — pre-load MutationObserver
 *   clientSideTransmissionObserved  Tier 4 — see the note at its assignment
 *
 * ────────────────────────────────────────────────────────────────────────
 * ⚠️ READS A KEY THAT IS NOT YET IN THE FROZEN CONTRACT.
 *
 * `RawMaterial` (snapshot.format.v1.ts:177-197) has NO field for network
 * observations. `capture.py` writes `raw.scriptRuntimeObservations` as a
 * SUPERSET key; the contract amendment adding it is a HAND edit by the
 * Architecture Owner, never by tooling (CLAUDE.md: "Amendments are made by
 * hand, never by Claude Code").
 *
 * Until that lands this module reads the key defensively and returns
 * fully-notCollected evidence when it is absent — which is every snapshot in
 * every corpus captured before today. That is the CORRECT reading under S-7:
 * those captures did not observe the network, so the fields were not
 * collected. It is not `absent`.
 * ────────────────────────────────────────────────────────────────────────
 */

import {
  present, notCollected,
  type ScriptRuntimeEvidence, type Observation,
} from '../../../packages/contracts/evidence.contract.v1.ts';
import type { RawMaterial } from '../../../packages/contracts/snapshot.format.v1.ts';
import { registrableDomainsOf } from './psl.ts';

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

export function extractScriptRuntime(raw: RawMaterial): ScriptRuntimeEvidence {
  // The superset key, read without widening RawMaterial itself.
  const observations = (raw as unknown as Record<string, unknown>)['scriptRuntimeObservations'];

  if (!isObservations(observations)) {
    // Every snapshot captured before DEC-29 Tier 1 lands here. notCollected,
    // never absent: the network was not observed, so nothing was established.
    return {
      listenerOnCredentialField: nc<boolean>(),
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

    // ── Tier 3, not built ────────────────────────────────────────────────
    // Both need code running inside the page. DEC-29 constrains that to CDP
    // (DOMDebugger.getEventListeners), never monkey-patching addEventListener.
    listenerOnCredentialField: nc<boolean>(),
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
