/**
 * DEC-30 Tier 1 END-TO-END: capture.py's real output -> extractEvidence ->
 * ScriptRuntimeEvidence, through BOTH landed contract amendments.
 *
 * The snapshot this reads was produced by the REAL `capture.py` against a
 * synthetic page whose behaviour was written in advance — not hand-built here.
 * That matters: a hand-built object would prove the extractor works on data
 * shaped the way the extractor's author imagined, which is the failure this
 * whole exercise keeps finding.
 *
 * Set SSX_E2E_SNAPSHOT to a capture.py-produced .json.gz carrying
 * `raw.scriptRuntimeObservations`. Skips loudly if unset — never silently.
 *
 * Run: SSX_E2E_SNAPSHOT=/path/to/snap.json.gz \
 *        node --experimental-strip-types apps/harness/extract/tier1-e2e.test.ts
 */

import assert from 'node:assert/strict';
import { readSnapshot } from './snapshot-store.ts';
import { extractEvidence } from './extract.ts';
import { registrableDomainsOf } from './psl.ts';

const SNAP = process.env['SSX_E2E_SNAPSHOT'] ?? '';
if (SNAP === '') {
  console.error('SSX_E2E_SNAPSHOT is not set — no real capture.py output to read.');
  console.error('Refusing to report a pass: this test exists to prove the capture->extract path.');
  process.exit(1);
}

const snapshot = readSnapshot(SNAP);

// ── The producer half actually landed in the snapshot ─────────────────────
const obs = snapshot.raw.scriptRuntimeObservations;
assert.notEqual(obs, null,
  'the captured snapshot carries no scriptRuntimeObservations — capture.py did not populate it');
assert.ok(obs !== null && obs.transmissionEndpoints.length > 0,
  'the fixture kit beacons on load, so at least one transmission endpoint must be recorded');

const sr = extractEvidence(snapshot).evidence.scriptRuntime;

// ── Amendment A reaches the extractor ─────────────────────────────────────
assert.equal(sr.transmissionEndpoints.state, 'present',
  'transmissionEndpoints must be PRESENT now that capture observed them — ' +
  'notCollected here would mean the extractor never saw the amendment field');
assert.deepEqual(
  sr.transmissionEndpoints.state === 'present' ? sr.transmissionEndpoints.value : null,
  [...obs!.transmissionEndpoints].sort(),
  'endpoints must pass through canonically sorted and otherwise unchanged',
);
assert.equal(sr.dynamicScriptLoadCount.state, 'present', 'dynamicScriptLoadCount must be present');

// ── Amendment B is DERIVED, not passed through ────────────────────────────
//
// This is the Tier 2 assertion: the producer performs the PSL derivation that
// javascript.ts's header says a module must never do.
assert.equal(sr.transmissionEndpointDomains.state, 'present',
  'transmissionEndpointDomains must be PRESENT — derived by the producer, ' +
  'which is exactly what Amendment B exists for');

const derived = sr.transmissionEndpointDomains.state === 'present'
  ? sr.transmissionEndpointDomains.value : null;

// The fixture exfiltrates to 127.0.0.1, which is an IP LITERAL and has no
// eTLD+1. So the correct derived value is the EMPTY LIST — present-and-empty,
// never notCollected. This is deliberately asserted rather than treated as a
// weakness of the fixture: "observed, and there are no registrable domains"
// is a real finding, and it is exactly the case where a careless
// implementation would emit a bogus "127.0.0.1" domain and make CRED-05's
// notSameSite comparison fire against garbage.
assert.deepEqual(derived, [],
  'endpoints on an IP literal yield NO registrable domains — present([]), ' +
  'never a fabricated host-as-domain');

// ── The derivation itself, on endpoints that DO have registrable domains ──
//
// The captured fixture cannot exercise this (localhost has no eTLD+1), so the
// same producer path is driven with realistic endpoints. Same function, same
// V-15-gated PSL — only the input differs.
{
  const realistic = {
    ...snapshot,
    raw: {
      ...snapshot.raw,
      scriptRuntimeObservations: {
        ...obs!,
        transmissionEndpoints: [
          'https://exfil.evil.tld/collect',
          'https://cdn.exfil.evil.tld/beacon',   // same eTLD+1 — must DEDUPE
          'https://other.example.co.uk/x',       // multi-label suffix
        ],
      },
    },
  };
  const d = extractEvidence(realistic).evidence.scriptRuntime.transmissionEndpointDomains;
  assert.equal(d.state, 'present');
  assert.deepEqual(
    d.state === 'present' ? d.value : null,
    ['evil.tld', 'example.co.uk'],
    'domains must be PSL-derived, de-duplicated across subdomains, and sorted',
  );

  // The shared helper is the same one url.ts and loginInterface.ts use — so
  // CRED-05's notSameSite comparison against url.registrableDomain cannot
  // disagree with itself. Asserted, not assumed.
  assert.deepEqual(
    registrableDomainsOf(['https://exfil.evil.tld/collect']), ['evil.tld'],
    'psl.ts is the single derivation path for all three categories');
}

// ── Tier 3 / Tier 4 fields stay honest ────────────────────────────────────
assert.equal(sr.listenerOnCredentialField.state, 'notCollected',
  'listenerOnCredentialField needs Tier 3 (CDP) and must not be guessed');
assert.equal(sr.clientSideTransmissionObserved.state, 'notCollected',
  'clientSideTransmissionObserved must NOT be inferred from an observed POST (DEC-30 Part 3)');

// ── S-6 through the full path ─────────────────────────────────────────────
assert.equal(
  JSON.stringify(extractEvidence(readSnapshot(SNAP))),
  JSON.stringify(extractEvidence(readSnapshot(SNAP))),
  'S-6: two extractions of the same captured snapshot must be byte-identical',
);

console.log(
  'Tier 1 END-TO-END passed: capture.py -> readSnapshot -> extractEvidence.\n' +
  `  transmissionEndpoints  present, ${obs!.transmissionEndpoints.length} endpoint(s), sorted\n` +
  '  transmissionEndpointDomains  present, PSL-derived via psl.ts (V-15-gated)\n' +
  '  IP-literal endpoints correctly yield present([]), not a fabricated domain\n' +
  '  Tier 3/4 fields still notCollected; S-6 byte-identical across two extractions',
);
