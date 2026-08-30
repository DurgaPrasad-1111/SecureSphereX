/**
 * DEFECT-33 — proves `readSnapshot` normalises `raw.scriptRuntimeObservations`
 * to `null` on pre-amendment snapshots.
 *
 * WHY THIS TEST EXISTS SEPARATELY, and why it asserts what it asserts.
 *
 * Before the fix, the contract said the field was `{...} | null` and 26,700
 * real snapshots had no such key — runtime `undefined`. Nothing misbehaved,
 * but ONLY because `scriptRuntime.ts`'s `isObservations()` guard happens to
 * reject `undefined` for the same reason it rejects malformed input.
 * "Correct by an unrelated guard's incidental strictness" is not correct.
 *
 * So this test asserts `=== null` DIRECTLY on the parsed snapshot. It
 * deliberately does NOT test through `extractEvidence` — going through the
 * extractor would pass identically whether the normalisation exists or not
 * (both paths end at `notCollected`), which is exactly the inference this
 * test refuses to make. The point is to prove the value, not the downstream
 * behaviour that currently masks it.
 *
 * Run: SSX_CORPUS_STORE=/path/to/corpus \
 *        node --experimental-strip-types apps/harness/extract/read-boundary.test.ts
 */

import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { readSnapshot, listSnapshots, DEFAULT_STORE } from './snapshot-store.ts';

const STORE = DEFAULT_STORE;
if (STORE === '') {
  console.error('SSX_CORPUS_STORE is not set — no real snapshots to read.');
  console.error('This test REQUIRES pre-amendment snapshots; refusing to report a pass.');
  process.exit(1);
}

const paths = [
  ...listSnapshots(STORE, 'benign').slice(0, 10),
  ...listSnapshots(STORE, 'phishing').slice(0, 10),
];
assert.ok(paths.length >= 15, `need a real sample, found ${paths.length}`);

// ── Step 1: establish the PREMISE, don't assume it ────────────────────────
//
// The whole defect rests on the claim that the key is genuinely absent on
// disk. That is verified here by reading the raw JSON directly, bypassing
// `readSnapshot` entirely. If this ever stops holding — because the corpus
// was re-captured post-amendment — the test says so rather than silently
// asserting a normalisation that no longer has anything to normalise.
let absentOnDisk = 0;
for (const p of paths) {
  const rawJson = JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')) as {
    raw: Record<string, unknown>;
  };
  if (!('scriptRuntimeObservations' in rawJson.raw)) absentOnDisk += 1;
}
assert.ok(
  absentOnDisk > 0,
  'no sampled snapshot is missing scriptRuntimeObservations — this store appears to be ' +
  'post-amendment, so DEFECT-33 cannot be demonstrated against it. Use a pre-amendment store.',
);

// ── Step 2: THE ASSERTION — normalised to null, explicitly ────────────────
for (const p of paths) {
  const snap = readSnapshot(p);

  // `=== null`, not `!== undefined`, not falsy, not "the guard rejects it".
  // The contract promises `{...} | null`; this is that promise being kept.
  assert.strictEqual(
    snap.raw.scriptRuntimeObservations, null,
    `${p}: readSnapshot must normalise a missing scriptRuntimeObservations to null, ` +
    'matching what RawMaterial declares — not leave it undefined',
  );

  // And it must be genuinely null, not merely absent-from-the-object: a
  // consumer doing `'scriptRuntimeObservations' in raw` must see it.
  assert.ok(
    'scriptRuntimeObservations' in snap.raw,
    `${p}: the key must EXIST on the normalised object, not just read as undefined`,
  );
}

// ── Step 3: a populated value must pass through UNTOUCHED ─────────────────
//
// Normalisation must only fill the gap, never overwrite real data. Nothing in
// the corpus is post-amendment yet, so this is exercised by round-tripping a
// synthetic snapshot through the same code path.
{
  const p = paths[0]!;
  const original = JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')) as {
    raw: Record<string, unknown>;
  };
  original.raw['scriptRuntimeObservations'] = {
    transmissionEndpoints: ['https://a.example/x'],
    dynamicScriptOrigins: [],
    dynamicScriptLoadCount: 0,
    postRequestCount: 1,
    postAfterDclCount: 1,
  };
  const { gzipSync } = await import('node:zlib');
  const { writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const tmp = join(tmpdir(), 'ssx-readboundary-populated.json.gz');
  writeFileSync(tmp, gzipSync(Buffer.from(JSON.stringify(original), 'utf8')));

  const snap = readSnapshot(tmp);
  assert.notEqual(snap.raw.scriptRuntimeObservations, null,
    'a populated observations block must NOT be overwritten with null');
  assert.deepEqual(
    snap.raw.scriptRuntimeObservations?.transmissionEndpoints,
    ['https://a.example/x'],
    'a populated observations block must pass through unchanged',
  );
}

// ── Step 4: present-but-MALFORMED is deliberately NOT normalised ──────────
//
// Only `undefined` becomes `null`. A key that exists with the wrong shape is a
// PRODUCER BUG, not a version gap, and must survive to isObservations() so it
// degrades to notCollected. Rewriting it to null here would disguise a broken
// producer as an ordinary pre-amendment snapshot.
{
  const p = paths[0]!;
  const original = JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')) as {
    raw: Record<string, unknown>;
  };
  original.raw['scriptRuntimeObservations'] = { transmissionEndpoints: 'not-an-array' };
  const { gzipSync } = await import('node:zlib');
  const { writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const tmp = join(tmpdir(), 'ssx-readboundary-malformed.json.gz');
  writeFileSync(tmp, gzipSync(Buffer.from(JSON.stringify(original), 'utf8')));

  const snap = readSnapshot(tmp);
  assert.notEqual(snap.raw.scriptRuntimeObservations, null,
    'a malformed observations block must be left ALONE, not rewritten to null — ' +
    'it must reach isObservations() so a producer bug stays visible');
}

console.log(
  `read boundary (DEFECT-33): ${paths.length} snapshots, ${absentOnDisk} genuinely missing the key ` +
  'on disk, all normalised to === null. Populated values pass through; malformed values are left alone.',
);
