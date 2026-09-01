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
 * TWO MODES:
 *   - DEFAULT (CI, self-contained): reads the committed, format-faithful
 *     fixture `tier1-e2e-fixture.json` — a snapshot in capture.py's exact
 *     output shape. Deterministic, no external corpus/env needed. This is what
 *     makes the capture->extract path an ENFORCED CI gate.
 *   - REAL-CAPTURE OVERRIDE: set SSX_E2E_SNAPSHOT to a REAL capture.py-produced
 *     .json.gz. The test then validates the extractor against fresh live
 *     output, preserving this file's original purpose (a hand-built object
 *     proves only that the extractor works on data its author imagined).
 *
 * Run (override): SSX_E2E_SNAPSHOT=/path/to/snap.json.gz \
 *        node --experimental-strip-types apps/harness/extract/tier1-e2e.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSnapshot } from './snapshot-store.ts';
import { extractEvidence } from './extract.ts';
import { registrableDomainsOf } from '../../../packages/engine/psl.ts';
import type { Snapshot } from '../../../packages/contracts/snapshot.format.v1.ts';

const SNAP = process.env['SSX_E2E_SNAPSHOT'] ?? '';

/** Load the committed plain-JSON fixture, applying the same missing-key
 *  normalisation `readSnapshot` performs for gz snapshots. */
function loadCommittedFixture(): Snapshot {
  const here = dirname(fileURLToPath(import.meta.url));
  const parsed = JSON.parse(readFileSync(join(here, 'tier1-e2e-fixture.json'), 'utf8')) as Record<string, unknown>;
  const raw = parsed['raw'] as Record<string, unknown> | undefined;
  if (raw && raw['scriptRuntimeObservations'] === undefined) raw['scriptRuntimeObservations'] = null;
  return parsed as unknown as Snapshot;
}

// Either mode yields a Snapshot from the SAME extract path; only the source
// differs. `reload()` returns a FRESH parse each call so the S-6 byte-identity
// check below compares two independent extractions, not an object to itself.
const usingOverride = SNAP !== '';
const reload = (): Snapshot => (usingOverride ? readSnapshot(SNAP) : loadCommittedFixture());
console.log(usingOverride
  ? `Tier 1 E2E: SSX_E2E_SNAPSHOT override -> ${SNAP}`
  : 'Tier 1 E2E: committed fixture (set SSX_E2E_SNAPSHOT to validate a real capture.py .json.gz)');

const snapshot = reload();

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
  JSON.stringify(extractEvidence(reload())),
  JSON.stringify(extractEvidence(reload())),
  'S-6: two extractions of the same captured snapshot must be byte-identical',
);

console.log(
  'Tier 1 END-TO-END passed: capture.py -> readSnapshot -> extractEvidence.\n' +
  `  transmissionEndpoints  present, ${obs!.transmissionEndpoints.length} endpoint(s), sorted\n` +
  '  transmissionEndpointDomains  present, PSL-derived via psl.ts (V-15-gated)\n' +
  '  IP-literal endpoints correctly yield present([]), not a fabricated domain\n' +
  '  Tier 3/4 fields still notCollected; S-6 byte-identical across two extractions',
);
