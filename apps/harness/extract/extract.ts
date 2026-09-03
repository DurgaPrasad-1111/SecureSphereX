/**
 * `extractEvidence` — Snapshot -> SecurityEvidence. The extraction stage that
 * `ExtractionRecord` always implied and that had never been written.
 *
 * The pipeline was always three stages: capture produces `RawMaterial`, an
 * EXTRACTOR turns it into `SecurityEvidence`, the engine consumes that.
 * `Snapshot.extraction` is typed `ExtractionRecord | null` and was `null` on
 * every snapshot ever captured (0/60 sampled, DEC-26). This is that missing
 * stage, for the three categories DEC-26 as amended puts in scope.
 *
 * ────────────────────────────────────────────────────────────────────────
 * S-6 IS THE GOVERNING INVARIANT HERE. `snapshot.format.v1.ts:277-278`:
 *
 *   S-6  Re-extraction is deterministic: identical RawMaterial + identical
 *        extractorVersion ⇒ identical SecurityEvidence.
 *
 * Three rules follow, and every one of them is a place this could silently
 * break:
 *
 *   1. NO CLOCK. `collectedOn` comes from the snapshot's own `capturedOn`,
 *      never `new Date()`. A clock here would make byte-identity fail across
 *      midnight and, worse, PASS all day — a determinism test that is green
 *      until it isn't.
 *   2. NO GENERATED IDS. `evidenceId`, `targetResourceId` and
 *      `analysisSessionId` are DERIVED from `snapshotId`, never randomised.
 *      A UUID here would break S-6 on the second call, every time.
 *   3. NO UNORDERED ITERATION. Nothing iterates `Object.keys` of captured
 *      data or collects through a Set whose insertion order depends on input
 *      order. `scriptsUsed` is built by testing a fixed list in a fixed
 *      order; `subdomainLabels` is document order.
 * ────────────────────────────────────────────────────────────────────────
 */

import {
  type SecurityEvidence, type EvidenceByCategory,
  type TargetResourceId, type AnalysisSessionId, type DayStamp,
  EVIDENCE_CONTRACT_VERSION,
} from '../../../packages/contracts/evidence.contract.v1.ts';
import type { Snapshot, ExtractionRecord } from '../../../packages/contracts/snapshot.format.v1.ts';

import { EXTRACTOR_VERSION } from './version.ts';
import { extractUrlEvidence } from './url.ts';
import { extractDomainRepresentation } from './domainRepresentation.ts';
import { extractLoginInterface } from './loginInterface.ts';
import { extractScriptRuntime } from './scriptRuntime.ts';
import { extractRedirect } from './redirect.ts';
import {
  extractTransport, stubDns,
  stubDownloadContext, stubPermissionContext,
} from './stubs.ts';

/**
 * The host and scheme both derived categories key on, parsed ONCE.
 *
 * Parsing the URL separately in each category would risk them disagreeing
 * about the same snapshot — the kind of drift that only shows up on malformed
 * input, which is exactly what a phishing corpus is full of.
 */
function parseTarget(finalUrl: string | null): { host: string | null; scheme: string | null } {
  if (finalUrl === null || finalUrl === '') return { host: null, scheme: null };
  try {
    const u = new URL(finalUrl);
    return { host: u.hostname.toLowerCase(), scheme: u.protocol.replace(/:$/, '').toLowerCase() };
  } catch {
    return { host: null, scheme: null };
  }
}

export function extractEvidence(snapshot: Snapshot): SecurityEvidence {
  const finalUrl = snapshot.raw.finalUrl ?? snapshot.raw.requestedUrl;
  const { host, scheme } = parseTarget(finalUrl);

  const evidence: EvidenceByCategory = {
    url: extractUrlEvidence(finalUrl),
    transport: extractTransport(scheme),
    domainRepresentation: extractDomainRepresentation(host),
    loginInterface: extractLoginInterface(snapshot.raw.renderedDom, finalUrl),

    scriptRuntime: extractScriptRuntime(snapshot.raw),

    dns: stubDns(),
    redirect: extractRedirect(snapshot.raw),
    downloadContext: stubDownloadContext(),
    permissionContext: stubPermissionContext(),
  };

  return {
    // Derived, not generated — S-6 rule 2. The `as` casts follow the committed
    // fixtures' precedent for these brands (`fixtures/clean-login.ts:30-31`);
    // G-2 governs `as Origin` specifically, which does not appear here.
    targetResourceId: `res_${snapshot.snapshotId}` as TargetResourceId,
    analysisSessionId: `sess_${snapshot.snapshotId}` as AnalysisSessionId,
    evidenceId: `ev_${snapshot.snapshotId}`,

    collectionContext: {
      collector: 'capture_harness',
      collectorVersion: EXTRACTOR_VERSION,

      // Tier 2. The harness is not subject to the tiered acquisition policy a
      // live extension is: it holds the full snapshot already, so nothing is
      // withheld by `tier_not_reached`. Fields absent here are absent because
      // capture never collected them, not because a tier gate suppressed them.
      tier: 2,

      // Extraction is a single pass over a static artifact. There is no
      // Analysis Session to be the Nth pass of.
      passOrdinal: 1,

      // From the snapshot, NEVER from a clock — S-6 rule 1.
      collectedOn: snapshot.capturedOn as DayStamp,
      evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
    },
    evidence,
  };
}

/**
 * The full `ExtractionRecord` that would be written back to
 * `Snapshot.extraction`.
 *
 * `extractedOn` is the one field that legitimately reflects when extraction
 * RAN rather than when capture happened — it is provenance, not evidence, and
 * `ExtractionRecord` sits OUTSIDE the `SecurityEvidence` that S-6 constrains.
 * It is therefore an explicit parameter rather than a `Date.now()` call, so
 * that determinism tests can hold it fixed and callers cannot accidentally
 * make an otherwise-deterministic record vary.
 */
export function toExtractionRecord(snapshot: Snapshot, extractedOn: string): ExtractionRecord {
  return {
    extractorVersion: EXTRACTOR_VERSION,
    evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
    extractedOn: extractedOn as DayStamp,
    evidence: extractEvidence(snapshot),
  };
}
