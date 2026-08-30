/**
 * S-6 determinism proof for the extractor.
 *
 * `packages/contracts/snapshot.format.v1.ts:277-278`, verbatim:
 *
 *   S-6  Re-extraction is deterministic: identical RawMaterial + identical
 *        extractorVersion ⇒ identical SecurityEvidence.
 *
 * "Identical" is taken at its word: BYTE-IDENTICAL over the whole
 * `SecurityEvidence` via `JSON.stringify`, not field spot-checks. Same
 * standard B1.3-1 uses for P-13. Spot-checks would pass while an unstable
 * array order or a stray clock moved something the checks did not name.
 *
 * ⚠️ WHY THIS RUNS ON A NON-CANONICAL STORE. `corpus/` in this repository has
 * `INDEX.jsonl` (26,700 entries) and ZERO payloads — correct per DEC-1, but it
 * means the indexed corpus is unreachable here. This runs against whatever
 * store `SSX_CORPUS_STORE` names. That is sound for S-6 specifically, because
 * S-6 is a property of the EXTRACTOR — any real snapshot set proves or
 * disproves it equally well. It would NOT be sound for metrics (C1.5), which
 * need the real corpus. DEC-27 item 5 records that as an open operational item.
 *
 * Run:
 *   SSX_CORPUS_STORE=/path/to/corpus \
 *     node --experimental-strip-types apps/harness/extract/s6-determinism.test.ts
 */

import assert from 'node:assert/strict';
import { extractEvidence } from './extract.ts';
import { readSnapshot, listSnapshots, DEFAULT_STORE } from './snapshot-store.ts';
import type { LoginFormObservation } from '../../../packages/contracts/evidence.contract.v1.ts';

const STORE = DEFAULT_STORE;
if (STORE === '') {
  console.error('SSX_CORPUS_STORE is not set — no payload store to run against.');
  console.error('S-6 CANNOT BE PROVEN without real snapshots; refusing to report a pass.');
  process.exit(1);
}

/** Both labels, deterministically chosen: sorted paths, first N of each. */
const PER_LABEL = 12;
const paths = [
  ...listSnapshots(STORE, 'benign').slice(0, PER_LABEL),
  ...listSnapshots(STORE, 'phishing').slice(0, PER_LABEL),
];
assert.ok(paths.length >= 20, `need 20+ snapshots to be meaningful, found ${paths.length}`);

// ── Property 1: same snapshot, extracted twice, byte-identical ─────────────
//
// FRESH PARSE EACH TIME. `readSnapshot` re-reads and re-decompresses from disk
// on every call and does not cache, so run B genuinely re-parses rather than
// being handed run A's object back. A memoising loader would make this
// assertion vacuous — it would compare an object to itself.
let withDom = 0;
for (const p of paths) {
  const a = JSON.stringify(extractEvidence(readSnapshot(p)));
  const b = JSON.stringify(extractEvidence(readSnapshot(p)));
  assert.equal(a, b, `S-6 VIOLATED: two extractions of ${p} differ`);
  if (readSnapshot(p).raw.renderedDom) withDom += 1;
}

// ── Property 2: a third run, interleaved, still identical ─────────────────
//
// Guards order-dependent state — a module-level cache or accumulator that
// would only show up when extractions are interleaved rather than paired.
{
  const first = paths.map((p) => JSON.stringify(extractEvidence(readSnapshot(p))));
  const second = paths.map((p) => JSON.stringify(extractEvidence(readSnapshot(p))));
  assert.deepEqual(second, first, 'S-6 VIOLATED: interleaved extraction order changed output');
}

// ── Property 3: reversed order, still identical ───────────────────────────
{
  const forward = new Map(paths.map((p) => [p, JSON.stringify(extractEvidence(readSnapshot(p)))]));
  for (const p of [...paths].reverse()) {
    assert.equal(JSON.stringify(extractEvidence(readSnapshot(p))), forward.get(p),
      `S-6 VIOLATED: ${p} extracted differently in reverse order`);
  }
}

// ── Property 4: NO CLOCK anywhere in the output ───────────────────────────
//
// The failure mode S-6 is most vulnerable to, and the one a same-process
// double-extraction CANNOT catch: `new Date()` returns the same day all day,
// so a clock-dependent extractor passes properties 1-3 and fails across
// midnight. Asserted structurally instead — collectedOn must equal the
// snapshot's own capturedOn, never today.
{
  const today = new Date().toISOString().slice(0, 10);
  let sawNonToday = false;
  for (const p of paths) {
    const snap = readSnapshot(p);
    const ev = extractEvidence(snap);
    assert.equal(ev.collectionContext.collectedOn, snap.capturedOn,
      `${p}: collectedOn MUST come from the snapshot, never a clock`);
    if (snap.capturedOn !== today) sawNonToday = true;
  }
  // Makes the assertion above meaningful rather than accidentally true: if
  // every snapshot happened to be captured today, matching capturedOn would
  // be indistinguishable from reading the clock.
  assert.ok(sawNonToday,
    'every snapshot was captured TODAY, so the no-clock assertion proves nothing — use an older store');
}

// ── Property 5: IDs are derived, not generated ────────────────────────────
{
  const p = paths[0]!;
  const snap = readSnapshot(p);
  const ev = extractEvidence(snap);
  assert.ok(ev.evidenceId.includes(snap.snapshotId), 'evidenceId must derive from snapshotId');
  assert.ok(ev.targetResourceId.includes(snap.snapshotId), 'targetResourceId must derive from snapshotId');
  assert.ok(ev.analysisSessionId.includes(snap.snapshotId), 'analysisSessionId must derive from snapshotId');
}

// ── Property 6: NEGATIVE CONTROL — a perturbed input must NOT pass ────────
//
// The point of the whole file. Properties 1-5 all pass trivially for an
// extractor that ignores its input and returns a constant. This proves the
// assertions have teeth: change the input meaningfully, and the output MUST
// change. "Silently sometimes different" is the failure S-6 exists to prevent,
// and "silently always identical" is how a determinism test lies about it.
{
  const p = paths.find((q) => readSnapshot(q).raw.finalUrl !== null);
  assert.ok(p !== undefined, 'need at least one snapshot with a finalUrl for the negative control');

  const snap = readSnapshot(p);
  const baseline = JSON.stringify(extractEvidence(snap));

  const perturbed = {
    ...snap,
    raw: { ...snap.raw, finalUrl: 'https://attacker-controlled.example.net/login' },
  };
  assert.notEqual(JSON.stringify(extractEvidence(perturbed)), baseline,
    'NEGATIVE CONTROL FAILED: a different finalUrl produced identical evidence — ' +
    'the determinism assertions above are vacuous');

  // And the same perturbation twice is still deterministic — determinism must
  // hold for the changed input too, not only for the corpus as captured.
  assert.equal(JSON.stringify(extractEvidence(perturbed)), JSON.stringify(extractEvidence(perturbed)),
    'the perturbed input must ALSO extract deterministically');
}

// ── Property 7: NEGATIVE CONTROL — header reordering must NOT change output ─
//
// The complement of property 6. `responseHeaders` is a plain object, so
// `Object.keys` order follows insertion. Nothing in the three built categories
// reads it — so reordering must be INVISIBLE. If this ever fails, something
// started iterating captured object keys and S-6 is at risk.
{
  const p = paths.find((q) => {
    const h = readSnapshot(q).raw.responseHeaders;
    return h !== null && Object.keys(h).length >= 2;
  });
  if (p !== undefined) {
    const snap = readSnapshot(p);
    const headers = snap.raw.responseHeaders!;
    const reversed = Object.fromEntries(Object.entries(headers).reverse());
    assert.equal(
      JSON.stringify(extractEvidence({ ...snap, raw: { ...snap.raw, responseHeaders: reversed } })),
      JSON.stringify(extractEvidence(snap)),
      'reordering responseHeaders changed the output — captured object-key order is leaking in',
    );
  }
}

// ── Property 8: loginInterface specifically — the FORMS ARRAY ─────────────
//
// `loginInterface` is the only category producing a NESTED ARRAY OF OBJECTS
// (`forms[]`, each with its own `fields[]`). Properties 1-3 cover it via
// whole-evidence byte equality, but an ordering bug there is the single most
// likely way S-6 breaks from here — DEFECT-26 and DEFECT-27 were both array
// ordering defects, and both passed every non-ordering test.
//
// So it is asserted DIRECTLY and at depth, on the snapshots that actually
// exercise it, rather than being trusted to the aggregate check.
{
  const withForms = paths.filter((p) => {
    const li = extractEvidence(readSnapshot(p)).evidence.loginInterface;
    return li.forms.state === 'present' && li.forms.value.length > 0;
  });

  // If nothing in the sample has a form, this property proves nothing and
  // must say so rather than reporting a silent pass over an empty set.
  assert.ok(withForms.length > 0,
    'no snapshot in the sample produced any form — property 8 would be vacuous; widen the sample');

  for (const p of withForms) {
    const a = extractEvidence(readSnapshot(p)).evidence.loginInterface;
    const b = extractEvidence(readSnapshot(p)).evidence.loginInterface;

    assert.equal(JSON.stringify(a), JSON.stringify(b),
      `${p}: loginInterface differs between extractions`);

    // Narrowed into locals: `assert.ok` does not narrow a discriminated union
    // for the type-checker, so reading `a.forms.value` directly leaves it
    // `any` and TS7022s on the loop below. The gate is `tsc -b`, not just a
    // green run.
    if (a.forms.state !== 'present' || b.forms.state !== 'present') {
      assert.fail(`${p}: forms became notCollected between extractions`);
    }
    const formsA: readonly LoginFormObservation[] = a.forms.value;
    const formsB: readonly LoginFormObservation[] = b.forms.value;
    assert.equal(formsA.length, formsB.length, `${p}: form COUNT is unstable`);

    // Per-form and per-field, in order. Deep-equal on the whole array would
    // catch this too, but a failure here names WHICH form and WHICH field,
    // which is what makes an ordering regression diagnosable rather than just
    // detected.
    for (let i = 0; i < formsA.length; i += 1) {
      const fa = formsA[i]!;
      const fb = formsB[i]!;
      assert.deepEqual(fa, fb, `${p}: form ${i} differs between extractions`);
      assert.equal(fa.fields.length, fb.fields.length, `${p}: form ${i} FIELD COUNT is unstable`);
      for (let j = 0; j < fa.fields.length; j += 1) {
        assert.deepEqual(fa.fields[j], fb.fields[j],
          `${p}: form ${i} field ${j} differs — field ORDER within a form is not stable`);
      }
    }
  }

  // Whitespace between attributes must not change the parse. parse5 applies
  // HTML5 tree construction, so this SHOULD be invisible — asserting it makes
  // that an actual guarantee rather than an assumption about the parser.
  const p = withForms[0]!;
  const snap = readSnapshot(p);
  const dom = snap.raw.renderedDom!;
  const respaced = dom.replace(/<input\s+/gi, '<input  ');
  assert.equal(
    JSON.stringify(extractEvidence({ ...snap, raw: { ...snap.raw, renderedDom: respaced } }).evidence.loginInterface),
    JSON.stringify(extractEvidence(snap).evidence.loginInterface),
    'extra whitespace between attributes changed the parse — extraction is markup-fragile',
  );

  console.log(
    `  loginInterface: ${withForms.length}/${paths.length} snapshots produced forms; ` +
    'form and field ORDER stable across extractions; attribute whitespace invisible.',
  );
}

// ── Property 9: loginInterface NEGATIVE CONTROL ───────────────────────────
//
// Proves property 8 has teeth. Removing a credential field from the markup
// MUST change the output; if it does not, the parser is not being consulted.
{
  const p = paths.find((q) => {
    const dom = readSnapshot(q).raw.renderedDom;
    return dom !== null && /<input[^>]*type\s*=\s*["']?password/i.test(dom);
  });

  if (p !== undefined) {
    const snap = readSnapshot(p);
    const dom = snap.raw.renderedDom!;
    const stripped = dom
      .replace(/<input([^>]*)type\s*=\s*["']?password["']?/gi, '<input$1type="submit"')
      .replace(/autocomplete\s*=\s*["']?(current-password|new-password)["']?/gi, 'autocomplete="off"');
    const before = extractEvidence(snap).evidence.loginInterface;
    const after = extractEvidence({ ...snap, raw: { ...snap.raw, renderedDom: stripped } }).evidence.loginInterface;
    assert.notEqual(JSON.stringify(before), JSON.stringify(after),
      'NEGATIVE CONTROL FAILED: removing every password input left loginInterface unchanged — ' +
      'the DOM is not actually being read');
    console.log('  loginInterface negative control fired: password inputs removed -> evidence changed.');
  } else {
    // Reported, not silently skipped: a control that did not run must not be
    // counted as a control that passed.
    console.log('  ⚠️ loginInterface negative control SKIPPED — no password input in the sample.');
  }
}

// ── Property 10: scriptRuntime — the DEC-29 Tier 1 network category ──────
//
// Every snapshot in this store predates Tier 1, so all six fields must be
// notCollected — and that is the assertion. It proves the defensive read in
// scriptRuntime.ts treats a missing `raw.scriptRuntimeObservations` as a
// CAPABILITY GAP (S-7: notCollected, never absent), rather than as "observed,
// nothing happened" — which would be the I-2 conflation in a new place.
{
  let checked = 0;
  for (const p of paths) {
    const sr = extractEvidence(readSnapshot(p)).evidence.scriptRuntime;
    for (const [name, obs] of Object.entries(sr)) {
      assert.equal(obs.state, 'notCollected',
        `${p}: scriptRuntime.${name} must be notCollected on a pre-Tier-1 snapshot, ` +
        'never absent and never a fabricated value');
    }
    checked += 1;
  }
  assert.ok(checked > 0, 'no snapshots checked — property 10 would be vacuous');

  // Synthetic Tier 1 observations, to prove the POPULATED path is also
  // deterministic and canonically ordered. Real captured snapshots carrying
  // this key do not exist in this store yet, so it is injected here rather
  // than left untested until a re-capture happens.
  const base = readSnapshot(paths[0]!);
  const withObs = {
    ...base,
    raw: {
      ...base.raw,
      scriptRuntimeObservations: {
        // Deliberately UNSORTED input: the extractor must canonicalise.
        transmissionEndpoints: ['https://z.example/c', 'https://a.example/b'],
        dynamicScriptOrigins: ['https://z.example/s2.js', 'https://a.example/s1.js'],
        dynamicScriptLoadCount: 2,
        postRequestCount: 2,
        postAfterDclCount: 1,
      },
    },
  };
  const x = extractEvidence(withObs).evidence.scriptRuntime;
  const y = extractEvidence(withObs).evidence.scriptRuntime;
  assert.equal(JSON.stringify(x), JSON.stringify(y),
    'scriptRuntime extraction is not deterministic');
  assert.deepEqual(
    x.transmissionEndpoints.state === 'present' ? x.transmissionEndpoints.value : null,
    ['https://a.example/b', 'https://z.example/c'],
    'transmissionEndpoints must be canonically SORTED, not input order');
  assert.equal(x.dynamicScriptLoadCount.state === 'present' ? x.dynamicScriptLoadCount.value : null, 2);

  // Tier 4 / DEFECT-32 discipline: an off-site POST must NOT be silently
  // upgraded into "credentials were transmitted".
  assert.equal(x.clientSideTransmissionObserved.state, 'notCollected',
    'clientSideTransmissionObserved must NOT be inferred from the presence of a POST');
  assert.equal(x.listenerOnCredentialField.state, 'notCollected',
    'listenerOnCredentialField needs Tier 3 (CDP) and must stay notCollected');

  // Malformed observations must fall back to notCollected, not half-populate.
  //
  // ⚠️ THIS LINE DELIBERATELY BYPASSES THE TYPE CHECKER, and the cast is the
  // point of the test rather than a workaround for it.
  //
  // `RawMaterial.scriptRuntimeObservations` is now a real, typed contract
  // field, so TypeScript correctly rejects `{ transmissionEndpoints: 'oops' }`.
  // But the value under test never comes from TypeScript — it comes from a
  // gzipped JSON file on disk, written by `capture.py`, possibly by an older
  // version of it, and reaching the extractor through `readSnapshot`'s
  // `as Snapshot`. The type system cannot police that boundary, which is
  // exactly what DEFECT-33 was about.
  //
  // So this test constructs invalid data ON PURPOSE to prove RUNTIME
  // robustness: that `isObservations()` rejects a wrong-shaped block rather
  // than half-populating evidence from it. Removing the cast would delete the
  // only check that a malformed producer output degrades safely.
  //
  // Scoped to this one expression. Do not widen it, and do not "fix" the test
  // by making the object well-formed — a well-formed object tests nothing here.
  const malformed = {
    ...base,
    raw: { ...base.raw, scriptRuntimeObservations: { transmissionEndpoints: 'oops' } },
  } as unknown as Parameters<typeof extractEvidence>[0];
  const m = extractEvidence(malformed).evidence.scriptRuntime;
  assert.equal(m.transmissionEndpoints.state, 'notCollected',
    'a malformed observations block must degrade to notCollected, never be trusted');
  assert.equal(m.transmissionEndpointDomains.state, 'notCollected',
    'and its derived domains must degrade with it — never derived from a rejected block');

  console.log(`  scriptRuntime: ${checked} pre-Tier-1 snapshots all notCollected (S-7); ` +
    'populated path deterministic, canonically sorted, and does not infer transmission.');
}

console.log(
  `S-6 determinism proven: ${paths.length} snapshots (${PER_LABEL} benign + ${PER_LABEL} phishing), ` +
  `${withDom} with a rendered DOM, 3 extractions each, byte-identical via JSON.stringify.\n` +
  'Negative controls fired correctly (changed input -> changed output; reordered headers -> no change).',
);
