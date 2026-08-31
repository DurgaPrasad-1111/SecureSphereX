/**
 * A1.4 — the extension's collected evidence feeds the engine's loginForm and
 * javascript modules deterministically, and injectedAfterLoad is observed FOR
 * REAL (the field DEFECT-31 forced the harness to fabricate as false).
 *
 * The modules (packages/engine/modules/*) are pure and already fixture-tested
 * in the engine; what A1.4 adds is that the EXTENSION's live-DOM collection
 * (collectLoginInterface, collectScriptRuntime) produces evidence those
 * modules evaluate, deterministically. Run under node + jsdom (which supports
 * MutationObserver), no browser needed.
 *
 * Run: node --experimental-strip-types apps/extension/module-eval.test.ts
 */

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { collectLoginInterface, collectScriptRuntime, createInjectionTracker } from './collect-evidence.ts';
import { computeLoginFormFindings } from '../../packages/engine/modules/loginForm.ts';
import { computeJavaScriptFindings } from '../../packages/engine/modules/javascript.ts';

const BASE = 'https://login.example/signin';
const tick = () => new Promise((r) => setTimeout(r, 0));

/* ── injectedAfterLoad observed for real (DEFECT-31 gain) ─────────────────
 * A form present at collection time is NOT injected; a form added after the
 * tracker starts IS. The harness cannot make this distinction at all. */
{
  const dom = new JSDOM('<form id="static"><input type="password" name="pw"></form>', { url: BASE });
  const doc = dom.window.document;
  // createInjectionTracker uses the global MutationObserver (which exists in a
  // real content script). Under node it does not, so expose jsdom's — the same
  // "make the browser global resolvable in the test" shim the collector's
  // DOM access relies on.
  (globalThis as { MutationObserver?: unknown }).MutationObserver = dom.window.MutationObserver;
  const tracker = createInjectionTracker(doc as unknown as Node);

  // Inject a second credential form AFTER the tracker is observing.
  const injected = doc.createElement('form');
  injected.id = 'injected';
  const pw = doc.createElement('input');
  pw.setAttribute('type', 'password');
  pw.setAttribute('name', 'pw2');
  injected.appendChild(pw);
  doc.body.appendChild(injected);
  await tick();  // MutationObserver callbacks are microtask/async

  const ev = collectLoginInterface(doc as unknown as ParentNode, BASE, tracker.isInjected);
  tracker.stop();

  assert.equal(ev.forms.state, 'present');
  const forms = ev.forms.state === 'present' ? ev.forms.value : [];
  const staticForm = forms.find((f) => f.injectedAfterLoad === false);
  const injectedForm = forms.find((f) => f.injectedAfterLoad === true);
  assert.ok(staticForm !== undefined, 'the pre-existing form must be injectedAfterLoad=false');
  assert.ok(injectedForm !== undefined,
    'the dynamically-added credential form must be injectedAfterLoad=true — the DEFECT-31 field, observed for real');
}

/* ── determinism: same DOM/observations -> byte-identical evidence ────────── */
{
  const html = '<form method="post" action="/login"><input type="email"><input type="password" name="pw"></form>';
  const a = collectLoginInterface(new JSDOM(html, { url: BASE }).window.document as unknown as ParentNode, BASE);
  const b = collectLoginInterface(new JSDOM(html, { url: BASE }).window.document as unknown as ParentNode, BASE);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'collectLoginInterface must be deterministic');

  // scriptRuntime: unsorted input must canonicalise identically.
  const s1 = collectScriptRuntime({ transmissionEndpoints: ['https://z/c', 'https://a/b'], dynamicScriptOrigins: ['https://z/s2', 'https://a/s1'] });
  const s2 = collectScriptRuntime({ transmissionEndpoints: ['https://a/b', 'https://z/c'], dynamicScriptOrigins: ['https://a/s1', 'https://z/s2'] });
  assert.equal(JSON.stringify(s1), JSON.stringify(s2), 'collectScriptRuntime must be order-independent (sorted sets)');
  assert.deepEqual(s1.transmissionEndpoints.state === 'present' ? s1.transmissionEndpoints.value : null,
    ['https://a/b', 'https://z/c'], 'transmissionEndpoints canonically sorted');
  // Blocked fields honestly notCollected (content-script constraints).
  assert.equal(s1.listenerOnCredentialField.state, 'notCollected');
  assert.equal(s1.clientSideTransmissionObserved.state, 'notCollected');
}

/* ── the engine modules evaluate the extension evidence, deterministically ── */
{
  const doc = new JSDOM('<form method="post"><input type="password" name="pw"></form>', { url: BASE }).window.document;
  const li = collectLoginInterface(doc as unknown as ParentNode, BASE);
  const lf1 = computeLoginFormFindings(li);
  const lf2 = computeLoginFormFindings(li);
  assert.equal(JSON.stringify(lf1), JSON.stringify(lf2), 'loginForm module deterministic on extension evidence');
  assert.ok(lf1.status === 'evaluated' || lf1.status === 'unevaluable', 'loginForm returns a valid Evaluability');

  const sr = collectScriptRuntime({ transmissionEndpoints: ['https://x/post'], dynamicScriptOrigins: [] });
  const js1 = computeJavaScriptFindings(sr);
  const js2 = computeJavaScriptFindings(sr);
  assert.equal(JSON.stringify(js1), JSON.stringify(js2), 'javascript module deterministic on extension evidence');
  // CRED-05's inputs are notCollected here, so the module is unevaluable — the
  // honest result, not a fabricated finding.
  assert.equal(js1.status, 'unevaluable',
    'javascript module is unevaluable when listener/transmission are notCollected (content-script limit)');
}

console.log('A1.4 PROVEN: extension-collected loginInterface + scriptRuntime feed the loginForm and');
console.log('  javascript modules deterministically; injectedAfterLoad observed FOR REAL via MutationObserver');
console.log('  (the DEFECT-31 field). listenerOnCredentialField / clientSideTransmissionObserved honestly');
console.log('  notCollected in the content-script context (DEC-30 monkey-patch ban; §20.2 + DEC-29 Tier 4).');
