/**
 * LIVE-PATH proof for CRED-03 (Deceptive identity with credential collection) —
 * now LIVE-FUNCTIONAL in the extension after DEC-47 (Option B).
 *
 * DEC-47 did two things: (1) narrowed CRED-03's frozen predicate to gate on
 * `homograph.isMixedScript` (a Latin↔non-Latin mix within the domain — the actual
 * homograph signature) instead of the old bare `isIdn`/`containsNonAscii`/
 * confusable-skeleton `or` that fired on ANY non-Latin IDN; and (2) wired a shared
 * pure-JS RFC-3492 punycode decoder into the extension's `collectDomainRepresentation`
 * (proven byte-identical to the harness's node:url `domainToUnicode`), so homograph
 * is evaluable live for IDN hosts instead of `notCollected`.
 *
 * Result — CRED-03 fires LIVE through the extension where it should, and correctly
 * stays silent on legitimate domains:
 *   - раypal.example (Latin+Cyrillic homograph of paypal) → mixed-script → FIRES.
 *   - пример.рф (genuine Russian, pure Cyrillic) → single-script → SILENT (the old
 *     false positive is gone).
 *   - plain ASCII → SILENT.
 *
 * The harness path (which always decoded) still fires on the homograph — the two
 * producers now agree, so this is no longer S-10 DIVERGENT.
 *
 * Run:
 *   node --experimental-strip-types tools/conformance/cred03-live-path.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  collectUrl, collectDomainRepresentation, collectTransport,
  collectLoginInterface, collectScriptRuntime,
} from '../../apps/extension/collect-evidence.ts';
import { assembleEvidence, type CollectedParts } from '../../apps/extension/assemble-evidence.ts';
import { extractDomainRepresentation } from '../../apps/harness/extract/domainRepresentation.ts';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ruleSet = JSON.parse(readFileSync(join(REPO, 'rulesets', 'rules-v0.1.0.json'), 'utf8')) as RuleSet;
const emptyStore: AuthStoreReader = {
  lookup: async () => ({ status: 'available' as const, originPresent: false, lifecycleState: null, fingerprintDrift: null, bestCrossOriginMatch: null }),
};

const LOGIN_HTML = '<!doctype html><html><head><title>Sign in</title></head><body>'
  + '<form method="POST" action="/login"><input type="text" name="u"><input type="password" name="p"></form></body></html>';

const HOMOGRAPH_URL = 'https://xn--ypal-43d9g.example/login'; // раypal (Latin+Cyrillic homograph)
const LEGIT_IDN_URL = 'https://xn--e1afmkfd.xn--p1ai/login';  // пример.рф (genuine Russian, pure Cyrillic)
const ASCII_URL = 'https://accounts.example.com/login';

/** The FULL extension collection path (with the DEC-47 punycode decode). */
function extParts(url: string): CollectedParts {
  const dom = new JSDOM(LOGIN_HTML, { url });
  const doc = dom.window.document;
  return {
    url: collectUrl(url),
    domainRepresentation: collectDomainRepresentation(url),
    transport: collectTransport('https:'),
    loginInterface: collectLoginInterface(doc as unknown as ParentNode, doc.baseURI, () => false, doc.title),
    scriptRuntime: collectScriptRuntime({ transmissionEndpoints: [], dynamicScriptOrigins: [] }),
  };
}
const fired = (o: { findings: readonly { ruleId: string }[] }, id: string) => o.findings.some((f) => f.ruleId === id);

/* ── 1. EXTENSION path — CRED-03 FIRES on a mixed-script homograph ─────────── */
{
  const dr = collectDomainRepresentation(HOMOGRAPH_URL);
  assert.equal(dr.unicodeDomain.state === 'present' ? dr.unicodeDomain.value : null, 'раypal.example', 'the decoder recovers the Unicode form live');
  assert.equal(dr.isMixedScript.state === 'present' && dr.isMixedScript.value, true, 'raypal is mixed-script');
  const out = await runAnalysisPass(assembleEvidence(extParts(HOMOGRAPH_URL), HOMOGRAPH_URL, '2026-09-04'), ruleSet, emptyStore, null);
  assert.equal(out.evaluations.homograph.result.status, 'evaluated', 'homograph is now EVALUABLE live for an IDN host');
  assert.ok(fired(out, 'CRED-03'), `CRED-03 must FIRE live on a mixed-script homograph; fired [${out.findings.map((f) => f.ruleId).join(', ')}]`);
  console.log('  [1] EXTENSION раypal.example (Latin+Cyrillic homograph): decoded live, mixed-script -> CRED-03 FIRES ✓');
}

/* ── 2. EXTENSION path — CRED-03 SILENT on a legitimate single-script IDN ──── */
{
  const dr = collectDomainRepresentation(LEGIT_IDN_URL);
  assert.equal(dr.unicodeDomain.state === 'present' ? dr.unicodeDomain.value : null, 'пример.рф', 'the decoder recovers the legit IDN too');
  assert.equal(dr.isMixedScript.state === 'present' && dr.isMixedScript.value, false, 'пример.рф is single-script (Cyrillic only)');
  const out = await runAnalysisPass(assembleEvidence(extParts(LEGIT_IDN_URL), LEGIT_IDN_URL, '2026-09-04'), ruleSet, emptyStore, null);
  assert.equal(out.evaluations.homograph.result.status, 'evaluated', 'homograph evaluable (decoded) — not an honest-gap silence');
  assert.ok(!fired(out, 'CRED-03'), `CRED-03 must NOT fire on a legitimate single-script IDN (DEC-47 predicate); fired [${out.findings.map((f) => f.ruleId).join(', ')}]`);
  console.log('  [2] EXTENSION пример.рф (genuine Russian, pure Cyrillic): decoded live, single-script -> CRED-03 SILENT ✓ (old FP gone)');
}

/* ── 3. EXTENSION path, plain ASCII — CRED-03 silent ──────────────────────── */
{
  const out = await runAnalysisPass(assembleEvidence(extParts(ASCII_URL), ASCII_URL, '2026-09-04'), ruleSet, emptyStore, null);
  assert.ok(!fired(out, 'CRED-03'), 'CRED-03 must NOT fire on a plain ASCII domain');
  console.log('  [3] EXTENSION accounts.example.com (ASCII): single-script -> CRED-03 SILENT ✓');
}

/* ── 4. HARNESS path still fires on the homograph — producers now AGREE ────── */
{
  const harnessDR = extractDomainRepresentation(new URL(HOMOGRAPH_URL).hostname);
  const parts = { ...extParts(HOMOGRAPH_URL), domainRepresentation: harnessDR };
  const out = await runAnalysisPass(assembleEvidence(parts, HOMOGRAPH_URL, '2026-09-04'), ruleSet, emptyStore, null);
  assert.ok(fired(out, 'CRED-03'), 'CRED-03 still fires on the harness path (both producers agree — no longer S-10 divergent)');
  console.log('  [4] HARNESS раypal.example: still FIRES — extension and harness now AGREE ✓');
}

console.log('CRED-03 live-path PROVEN: LIVE-FUNCTIONAL in the extension after DEC-47 — the shared punycode '
  + 'decode makes homograph evaluable, and the isMixedScript predicate fires on a Latin↔Cyrillic homograph '
  + '(раypal.example) while staying silent on a legitimate single-script IDN (пример.рф) and on ASCII. '
  + 'Extension and harness agree; no longer S-10 divergent.');
