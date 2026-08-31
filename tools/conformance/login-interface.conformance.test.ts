/**
 * CP-3 CONFORMANCE: harness (offline, parse5) vs extension (live DOM) must
 * produce IDENTICAL loginInterface evidence on SHARED fields.
 *
 * WHY THIS LIVES IN tools/conformance AND NOT IN EITHER PACKAGE. It imports
 * BOTH producers. The dependency matrix (CLAUDE.md §2, G-4) forbids
 * apps/extension → apps/harness and apps/harness → apps/extension, so a test
 * importing both cannot live in either. A cross-producer conformance check is
 * neither package's concern — it verifies they AGREE — so it belongs in a
 * neutral location. dependency-cruiser restricts tools/capture but places no
 * rule on tools/conformance, so this import pair is legal.
 *
 * THE THING UNDER TEST is the SHARED CLASSIFIER, isolated. jsdom parses HTML
 * with parse5 internally — the same parser the harness uses — so any
 * difference between the two paths is a difference in CLASSIFICATION, not in
 * parsing. Feeding both the same HTML and asserting identical output is
 * therefore a direct proof that `classifyField` et al. behave identically
 * whether fed by a parse5 node or a live DOM Element.
 *
 * Run:
 *   node --experimental-strip-types tools/conformance/login-interface.conformance.test.ts
 */

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { extractLoginInterface } from '../../apps/harness/extract/loginInterface.ts';
import { collectLoginInterface } from '../../apps/extension/collect-evidence.ts';
import type { LoginInterfaceEvidence } from '../../packages/contracts/evidence.contract.v1.ts';

/**
 * Reduce a LoginInterfaceEvidence to the fields SHARED by both producers.
 *
 * INCLUDED (must match): credentialFormPresent; per form its method, its
 * fields[] of {kind, hidden, autocompleteDisabled} — the pure classification
 * output that the shared core drives — actionUrl (resolved absolute on BOTH
 * sides), AND actionRegistrableDomain, now derived on both sides through the
 * SAME shared PSL path (packages/engine/psl.ts). This field was previously
 * excluded because the extension hardcoded it null while PSL was harness-only;
 * once the extension computes it via the shared psl.ts, it MUST agree — and it
 * is precisely the field CRED-01/07 compare against url.registrableDomain, so
 * asserting agreement here is what proves those rules can fire live.
 *
 * EXCLUDED, each for a stated reason:
 *   - injectedAfterLoad / injectingScriptOrigin: the extension can observe
 *     these from a live page (MutationObserver); the harness structurally
 *     CANNOT (DEFECT-31) and hardcodes false/null. Only one side produces
 *     them, so they are excluded by definition — a genuine extension gain,
 *     not a disagreement.
 *   - fingerprint: both emit notCollected identically; not classification.
 */
function sharedFields(ev: LoginInterfaceEvidence): unknown {
  const forms = ev.forms.state === 'present'
    ? ev.forms.value.map((f) => ({
      method: f.method,
      actionUrl: f.actionUrl,
      actionRegistrableDomain: f.actionRegistrableDomain,
      fields: f.fields,
    }))
    : { notPresent: ev.forms.state };
  return { credentialFormPresent: ev.credentialFormPresent, forms };
}

interface Case { readonly name: string; readonly html: string; }

const CASES: readonly Case[] = [
  {
    name: 'clean login (tier-1 type=password + text username)',
    html: '<form method="post" action="/login"><input type="text" name="username"><input type="password" name="password"></form>',
  },
  {
    name: 'no credential (search box only, classifies to nothing)',
    html: '<form><input type="text" name="search" id="q"></form>',
  },
  {
    name: 'hidden credential field (type=password + display:none)',
    html: '<form><input type="password" name="pw" style="display:none"></form>',
  },
  {
    name: 'autocomplete off inherited from form',
    html: '<form autocomplete="off"><input type="password" name="pw"></form>',
  },
  {
    name: 'tier-2 autocomplete=current-password + tier-1 email',
    html: '<form><input type="email" autocomplete="email"><input type="text" autocomplete="current-password" name="secret"></form>',
  },
  {
    name: 'tier-3 name/id guesswork (text field named "pass")',
    html: '<form><input type="text" name="pass"></form>',
  },
  {
    name: 'orphan credential fields outside any form',
    html: '<div><input type="password" name="pw"><input type="email"></div>',
  },
  {
    name: 'multiple forms, one credential-bearing one not',
    html: '<form id="a"><input type="text" name="q"></form><form id="b" method="post"><input type="password" name="pw"></form>',
  },
];

const BASE_URL = 'https://example.com/page';
let passed = 0;

for (const c of CASES) {
  // Path A — harness: raw HTML string → parse5 → extractLoginInterface.
  const harnessEv = extractLoginInterface(c.html, BASE_URL);

  // Path B — extension: same HTML → jsdom DOM → collectLoginInterface.
  // JSDOM is given the SAME base URL the harness resolves against, so
  // document.baseURI matches pageUrl and relative actions resolve identically.
  const dom = new JSDOM(c.html, { url: BASE_URL });
  const extEv = collectLoginInterface(dom.window.document as unknown as ParentNode, BASE_URL);

  const a = JSON.stringify(sharedFields(harnessEv));
  const b = JSON.stringify(sharedFields(extEv));
  assert.equal(a, b,
    `CONFORMANCE FAILED on "${c.name}":\n  harness:   ${a}\n  extension: ${b}`);
  passed += 1;
}

// Negative control: the comparison has TEETH. A deliberately divergent pair
// (harness sees a password field; extension is handed HTML with it removed)
// MUST be caught by sharedFields — otherwise the assertions above prove
// nothing.
{
  const withPw = extractLoginInterface('<form><input type="password" name="pw"></form>', BASE_URL);
  const withoutPw = collectLoginInterface(
    new JSDOM('<form><input type="text" name="q"></form>', { url: BASE_URL }).window.document as unknown as ParentNode,
    BASE_URL,
  );
  assert.notEqual(JSON.stringify(sharedFields(withPw)), JSON.stringify(sharedFields(withoutPw)),
    'NEGATIVE CONTROL FAILED: sharedFields did not distinguish a credential form from a non-credential one');
}

console.log(`CP-3 loginInterface conformance PROVEN: ${passed}/${CASES.length} HTML cases produce `
  + 'byte-identical SHARED fields (incl. actionUrl AND actionRegistrableDomain, both now shared-PSL) '
  + 'across the harness (parse5) and extension (live DOM) paths.');
console.log('Excluded from comparison (documented): injectedAfterLoad/injectingScriptOrigin '
  + '(extension-only, DEFECT-31 gain); fingerprint (both notCollected). Negative control fired.');
