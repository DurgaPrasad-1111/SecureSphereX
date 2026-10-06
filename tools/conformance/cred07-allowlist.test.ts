/**
 * DEC-50 / DEFECT-46 — proves the knownFormProcessors allowlist suppresses the
 * CRED-07 false positive, scoped to CRED-07 only (CRED-01 unaffected).
 *
 * Drives the REAL extension collectors (collectLoginInterface etc.) over a jsdom
 * DOM, then the REAL engine (runAnalysisPass) against the shipped rule set — same
 * neutral-location pattern as cred-live-path.test.ts.
 *
 * Run: node --experimental-strip-types tools/conformance/cred07-allowlist.test.ts
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
const forbiddenStore: AuthStoreReader = { lookup: async () => { throw new Error('store must not be consulted'); } };

// A concealed credential form (password with autocomplete disabled → CRED-07's
// concealment disjunct) posting OFF-ORIGIN to `action`. Page registrable domain
// is example.com; `action` is always a different registrable domain.
function htmlWithAction(action: string): string {
  return `<!doctype html><html><body>
    <form method="POST" action="${action}">
      <input type="text" name="username" autocomplete="username">
      <input type="password" name="password" autocomplete="off">
      <button type="submit">Sign in</button>
    </form></body></html>`;
}

async function livePass(pageUrl: string, html: string): Promise<readonly string[]> {
  const dom = new JSDOM(html, { url: pageUrl });
  const parts = {
    url: collectUrl(pageUrl),
    domainRepresentation: collectDomainRepresentation(pageUrl),
    transport: collectTransport(new URL(pageUrl).protocol),
    loginInterface: collectLoginInterface(dom.window.document as unknown as ParentNode, dom.window.document.baseURI),
    scriptRuntime: collectScriptRuntime({ transmissionEndpoints: [], dynamicScriptOrigins: [] }),
  };
  const outcome = await runAnalysisPass(assembleEvidence(parts, pageUrl, '2026-10-06'), ruleSet, forbiddenStore, null);
  return outcome.findings.map((f) => f.ruleId);
}

const PAGE = 'https://news.example.com/signup';

// ── 1. Allowlisted processor (Mailchimp list-manage.com) → CRED-07 SUPPRESSED ──
{
  const fired = await livePass(PAGE, htmlWithAction('https://list-manage.com/subscribe/post'));
  assert.ok(!fired.includes('CRED-07'),
    `CRED-07 must NOT fire when the off-site action is an allowlisted form processor; fired [${fired.join(', ')}]`);
  // Scoped to CRED-07 only (DEC-50): CRED-01 (off-origin credential post) still fires.
  assert.ok(fired.includes('CRED-01'),
    `CRED-01 must still fire (allowlist is CRED-07-scoped — DEC-50 says do not wire into CRED-01); fired [${fired.join(', ')}]`);
  console.log('  [1] off-site action to list-manage.com: CRED-07 SUPPRESSED, CRED-01 still fires ✓');
}

// ── 2. CONTROL: non-allowlisted off-site action → CRED-07 FIRES ────────────────
{
  const fired = await livePass(PAGE, htmlWithAction('https://evil-collect.example/harvest'));
  assert.ok(fired.includes('CRED-07'),
    `CRED-07 must FIRE on a concealed off-site credential form to a non-allowlisted domain; fired [${fired.join(', ')}]`);
  console.log('  [2] off-site action to evil-collect.example (not allowlisted): CRED-07 FIRES ✓');
}

// ── 3. A second allowlisted processor (Salesforce) → also suppressed ──────────
{
  const fired = await livePass(PAGE, htmlWithAction('https://salesforce.com/servlet/servlet.WebToLead'));
  assert.ok(!fired.includes('CRED-07'), `CRED-07 must NOT fire on salesforce.com (allowlisted); fired [${fired.join(', ')}]`);
  console.log('  [3] off-site action to salesforce.com: CRED-07 SUPPRESSED ✓');
}

console.log('DEC-50 / DEFECT-46 PROVEN: the knownFormProcessors allowlist suppresses CRED-07 on a '
  + 'concealed off-site credential form posting to a known processor (list-manage.com, salesforce.com), '
  + 'fires on a non-allowlisted off-site action, and leaves CRED-01 untouched (CRED-07-scoped).');
