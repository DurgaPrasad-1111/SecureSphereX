/**
 * LIVE-PATH proof for CRED-03 (Deceptive identity with credential collection),
 * and the record of its S-10-style DIVERGENCE — the same shape as CRED-04.
 *
 * CRED-03's predicate is `and(<deceptive-identity signal>, loginForm.credentialFormPresent)`,
 * where the deceptive-identity `or` reads the homograph module
 * (confusableSkeleton != null, isMixedScript, isIdn, containsNonAscii). Both
 * required modules (homograph, loginForm) are present in the ruleset and the
 * rule is `Active`. The rule is NOT blocked the way CRED-05/PM-01 are — but it
 * DIVERGES by producer:
 *
 *   - HARNESS path: `apps/harness/extract/domainRepresentation.ts` uses node:url's
 *     ICU `domainToUnicode`, decoding an `xn--` host back to Unicode, so a
 *     Cyrillic/Greek homograph is measured correctly → homograph EVALUABLE →
 *     CRED-03 FIRES on a homograph domain carrying a credential form.
 *   - EXTENSION live path: `new URL().hostname` yields the PUNYCODE form, and a
 *     content script CANNOT decode punycode → Unicode (ProducerCapabilityManifest:
 *     unicodeDomain 0/6 NOT OBSERVABLE). So `collectDomainRepresentation` marks
 *     the script-dependent fields `notCollected` for an IDN host → homograph
 *     UNEVALUABLE → CRED-03 cannot fire live on exactly the pages it targets.
 *     An honest capability gap, never a fabricated clean bill of health.
 *
 * So CRED-03 is live-functional on the OFFLINE producer and live-UNREACHABLE on
 * the EXTENSION producer for IDN homographs — S-10 DIVERGENT, like CRED-04. This
 * test pins both halves so the divergence is a recorded property, not a surprise.
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

// A mixed-script homograph of "paypal": Cyrillic 'р' (U+0440) + 'а' (U+0430).
const HOMOGRAPH_URL = 'https://раypal.example/login';
const ASCII_URL = 'https://accounts.example.com/login';

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

/* ── 1. HARNESS path — CRED-03 FIRES on a homograph + credential form ─────── */
{
  const punyHost = new URL(HOMOGRAPH_URL).hostname; // 'xn--...'
  const harnessDR = extractDomainRepresentation(punyHost);
  assert.equal(harnessDR.isMixedScript.state === 'present' && harnessDR.isMixedScript.value, true, 'harness decodes the IDN and sees mixed script');
  const parts = { ...extParts(HOMOGRAPH_URL), domainRepresentation: harnessDR };
  const out = await runAnalysisPass(assembleEvidence(parts, HOMOGRAPH_URL, '2026-09-04'), ruleSet, emptyStore, null);
  assert.equal(out.evaluations.homograph.result.status, 'evaluated', 'homograph is evaluable on the harness path');
  assert.ok(fired(out, 'CRED-03'), `CRED-03 must FIRE on the harness path; fired [${out.findings.map((f) => f.ruleId).join(', ')}]`);
  console.log(`  [1] HARNESS: homograph decoded (mixed-script, skeleton ${harnessDR.confusableSkeleton.state === 'present' ? harnessDR.confusableSkeleton.value : '?'}) -> CRED-03 FIRES ✓`);
}

/* ── 2. EXTENSION path — homograph UNEVALUABLE for the IDN -> CRED-03 silent ─ */
{
  const extDR = collectDomainRepresentation(HOMOGRAPH_URL);
  assert.equal(extDR.isIdn.state === 'present' && extDR.isIdn.value, true, 'extension sees the host as an IDN');
  assert.equal(extDR.isMixedScript.state, 'notCollected', 'extension cannot measure mixed-script on the punycode form (capability gap)');
  const out = await runAnalysisPass(assembleEvidence(extParts(HOMOGRAPH_URL), HOMOGRAPH_URL, '2026-09-04'), ruleSet, emptyStore, null);
  assert.equal(out.evaluations.homograph.result.status, 'unevaluable', 'homograph is UNEVALUABLE on the extension path for an IDN host');
  assert.ok(!fired(out, 'CRED-03'), `CRED-03 must NOT fire on the extension live path (homograph unevaluable); fired [${out.findings.map((f) => f.ruleId).join(', ')}]`);
  console.log('  [2] EXTENSION (IDN homograph): homograph UNEVALUABLE (punycode undecodable in a content script) -> CRED-03 correctly does NOT fire ✓');
}

/* ── 3. EXTENSION path, ASCII non-homograph -> CRED-03 correctly silent ────── */
{
  const extDR = collectDomainRepresentation(ASCII_URL);
  assert.equal(extDR.isMixedScript.state, 'present', 'a plain ASCII host is evaluable (no IDN gap)');
  const out = await runAnalysisPass(assembleEvidence(extParts(ASCII_URL), ASCII_URL, '2026-09-04'), ruleSet, emptyStore, null);
  assert.equal(out.evaluations.homograph.result.status, 'evaluated', 'homograph evaluable on an ASCII host');
  assert.ok(!fired(out, 'CRED-03'), 'CRED-03 must NOT fire on a plain ASCII domain (no deceptive-identity signal) — correct, not a gap');
  console.log('  [3] EXTENSION (plain ASCII): homograph evaluable, no deception signal -> CRED-03 correctly silent ✓');
}

console.log('CRED-03 live-path PROVEN and DIVERGENCE recorded (S-10, like CRED-04): FIRES on the harness/offline '
  + 'producer (node:url decodes the IDN); LIVE-UNREACHABLE on the extension producer for IDN homographs '
  + '(a content script cannot decode punycode -> Unicode, so homograph is unevaluable); correctly silent on plain ASCII.');
