/**
 * Reading gzipped snapshots off the payload store.
 *
 * ⚠️ CORPUS LOCALITY (DEC-27 item 5). `corpus/` in this repository holds
 * `INDEX.jsonl` (26,700 entries) and `.gitkeep` — ZERO payloads. That is
 * correct per DEC-1 (payload never enters git), but it means the corpus the
 * committed index describes is not reachable from the working tree, and no
 * payload store matching those 26,700 entries was found on this machine.
 *
 * So the store path is a PARAMETER with an env override, never hardcoded to a
 * developer's local copy. Determinism proving does not care which real
 * snapshots it runs on — S-6 is a property of the extractor — but metrics
 * (C1.5) will need the real corpus, and that is an open operational item.
 *
 * S-8 is respected trivially and deliberately: nothing here reads or writes
 * the Authentication History Store. "A snapshot NEVER contains user data. The
 * capture pipeline MUST NOT read or write the Authentication History Store."
 */

import { gunzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Snapshot } from '../../../packages/contracts/snapshot.format.v1.ts';

export const DEFAULT_STORE = process.env['SSX_CORPUS_STORE'] ?? '';

/**
 * Reads and parses one snapshot. Decompresses from disk on EVERY call — no
 * caching, deliberately: the S-6 test needs a genuinely fresh parse each time,
 * and a memoising loader would make the determinism assertion vacuous by
 * handing back the identical object it returned before.
 *
 * ────────────────────────────────────────────────────────────────────────
 * NORMALISES `raw.scriptRuntimeObservations` — DEFECT-33.
 *
 * `RawMaterial` declares the field as `{...} | null`, and its docstring says
 * "null for every snapshot captured before this field existed". On disk that
 * is FALSE: pre-amendment snapshots have no such key at all, so the runtime
 * value is `undefined`, not `null`. Verified against a real snapshot — `raw`
 * carries exactly nine keys and this is not one of them.
 *
 * Before this normalisation, an unchecked `as Snapshot` asserted the contract
 * shape over 26,700 snapshots that did not have it. Nothing broke, but only
 * because `scriptRuntime.ts`'s `isObservations()` guard rejects `undefined`
 * for the same reason it rejects malformed input — an unrelated guard's
 * incidental strictness, not a guarantee.
 *
 * So the key is set to `null` HERE, at the boundary, once. Every consumer
 * downstream then sees what the type promises. The alternative — widening the
 * type to include `undefined` — was explicitly rejected: it would encode the
 * gap rather than close it, and blur "we did not look" against "we looked and
 * there is nothing", which is the exact distinction S-7 and I-2 exist to keep
 * sharp.
 *
 * SCOPE, stated so this is not mistaken for full validation: only the
 * amendment field is normalised. The remaining `as Snapshot` still asserts
 * the rest of the shape unchecked — a snapshot with a missing `capturedOn` or
 * a malformed `fetch` would still pass. That is a separate and larger gap
 * (a full runtime validator for D0.5), recorded in DEFECT-33 and NOT fixed
 * here.
 *
 * PRESENT-BUT-MALFORMED is deliberately left alone. Only `undefined` becomes
 * `null`. A key that exists but has the wrong shape is a genuinely different
 * situation — a producer bug, not a version gap — and it must reach
 * `isObservations()` so it degrades to `notCollected` rather than being
 * quietly rewritten to `null` here, which would look like a clean
 * pre-amendment snapshot and hide the bug.
 * ────────────────────────────────────────────────────────────────────────
 */
export function readSnapshot(path: string): Snapshot {
  const parsed: unknown = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8'));

  if (typeof parsed === 'object' && parsed !== null) {
    const raw = (parsed as { raw?: Record<string, unknown> }).raw;
    if (typeof raw === 'object' && raw !== null && raw['scriptRuntimeObservations'] === undefined) {
      raw['scriptRuntimeObservations'] = null;
    }
  }

  return parsed as Snapshot;
}

/**
 * Enumerates snapshot paths under a store root, in SORTED order.
 *
 * Sorted, not `readdirSync` order: directory order is filesystem-dependent, so
 * an unsorted walk would make "the first 20 snapshots" mean different things
 * on different machines and quietly change what a test covers.
 */
export function listSnapshots(root: string, label?: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.json.gz')) out.push(p);
    }
  };
  const base = label === undefined ? root : join(root, label);
  walk(base);
  return out.sort();
}
