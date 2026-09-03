/**
 * LIVE-PATH proof for CRED-04 (credential form reached via a cross-registrable-
 * domain redirect chain), the mirror of cred02-live-path.test.ts. Drives the
 * REAL harness extractor (extractEvidence) over a synthetic Snapshot, feeds the
 * REAL engine (runAnalysisPass), and asserts whether CRED-04 fires. No browser,
 * no credentials, no network — fully deterministic.
 *
 * WHAT THIS SETTLES. CRED-04 was structurally unfirable (DEFECT-19): the
 * redirect module hard-coded initialRegistrableDomain / finalRegistrableDomain
 * to null, so its `notSameSite` conjunct could never match. The Annex A
 * amendment added the two Observation<string> fields; the producer now derives
 * them via the shared PSL resolver, and the module reads them (Option B). This
 * test proves the whole chain end to end.
 *
 * ⚠️ WHY THE HARNESS PATH, NOT THE EXTENSION. CRED-04 needs the full hop chain
 * (hopCount >= redirect_hop_min = 2). The extension's webNavigation-only
 * producer cannot see the chain (hopCount notCollected → module unevaluable for
 * redirects) — see redirect-producer.test.ts. The HARNESS observes SERVER-side
 * redirect chains from raw.redirectChain, which is exactly S-10's DIVERGENT
 * point: the harness sees chains the extension may not. So CRED-04 fires here,
 * on server-side data, and that divergence is the reason S-10 forbids folding
 * its corpus recall into a headline. See the S-10 assertion at the end.
 *
 * Scenarios:
 *   1. POSITIVE — a 2-hop chain crossing shorten.test -> evil.tld, landing on a
 *      credential form, with hopCount >= 2. CRED-04 FIRES.
 *   2. SAME-SITE NEGATIVE — a 2-hop chain that stays within one registrable
 *      domain (www.bank.test -> bank.test). notSameSite(bank.test, bank.test)
 *      is a noMatch. CRED-04 does NOT fire, even with a credential form and
 *      enough hops. This is the notSameSite(x, x) === false guarantee.
 *   3. NO-CREDENTIAL NEGATIVE — the positive chain but no credential form.
 *      CRED-04's third conjunct fails. Cross-domain redirect alone is not
 *      enough.
 *
 * Run: node --experimental-strip-types tools/conformance/cred04-live-path.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractEvidence } from '../../apps/harness/extract/extract.ts';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1.ts';
import type { Snapshot, RawRedirectHop } from '../../packages/contracts/snapshot.format.v1.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ruleSet = JSON.parse(
  readFileSync(join(REPO_ROOT, 'rulesets', 'rules-v0.1.0.json'), 'utf8'),
) as RuleSet;

// authContext is unevaluable without a fingerprint (every synthetic snapshot
// here has none), so the store is never consulted; a throwing reader proves it.
const forbiddenStore: AuthStoreReader = {
  lookup: async () => { throw new Error('store must not be consulted — no fingerprint present'); },
};

const CREDENTIAL_FORM = `<!doctype html><html><head><title>Sign in</title></head><body>
<form method="post" action="/login">
  <input type="email" name="email" autocomplete="username">
  <input type="password" name="password" autocomplete="current-password">
  <button type="submit">Log in</button>
</form></body></html>`;

const NO_CREDENTIAL = `<!doctype html><html><head><title>Welcome</title></head><body>
<p>Just a landing page. No form here.</p></body></html>`;

function snapshotWith(finalUrl: string, chain: RawRedirectHop[], dom: string): Snapshot {
  const requestedUrl = chain.length > 0 ? chain[0]!.fromUrl : finalUrl;
  return {
    snapshotId: 'cred04livepath0000000000000000',
    formatVersion: '1.1.0',
    capturedOn: '2026-09-03',
    provenance: { label: 'phishing', feed: 'synthetic', feedRecordId: null, impersonatedBrand: null },
    split: { split: 'test', assignmentFunctionVersion: 'split-v2', splitKey: 'evil.tld', proportions: {}, assignedOn: '2026-09-03' },
    fetch: { outcome: 'success', httpStatus: 200, durationMs: 1, finalUrl, attemptOrdinal: 1 },
    raw: {
      requestedUrl,
      finalUrl,
      renderedDom: dom,
      domContentHash: null,
      responseHeaders: null,
      redirectChain: chain,
      tlsCertificateChain: null,
      dnsRecords: null,
      screenshotRef: null,
    },
    extraction: null,
    presentsCredentialInterface: null,
  } as unknown as Snapshot;
}

const findingIds = (o: { findings: readonly { ruleId: string }[] }): string[] =>
  o.findings.map((f) => f.ruleId).sort();

// ── Scenario 1: POSITIVE — cross-domain 2-hop chain + credential form ──────
{
  const chain: RawRedirectHop[] = [
    { fromUrl: 'https://shorten.test/x', toUrl: 'https://mid.evil.tld/go', statusCode: 302, mechanism: 'http_3xx' },
    { fromUrl: 'https://mid.evil.tld/go', toUrl: 'https://login.evil.tld/signin', statusCode: 302, mechanism: 'http_3xx' },
  ];
  const snap = snapshotWith('https://login.evil.tld/signin', chain, CREDENTIAL_FORM);
  const ev = extractEvidence(snap);

  // The producer derived the two domains (Annex A / Option B).
  const r = ev.evidence.redirect;
  assert.equal(r.initialRegistrableDomain.state === 'present' ? r.initialRegistrableDomain.value : null, 'shorten.test');
  assert.equal(r.finalRegistrableDomain.state === 'present' ? r.finalRegistrableDomain.value : null, 'evil.tld');
  assert.equal(r.hopCount.state === 'present' ? r.hopCount.value : null, 2);

  const out = await runAnalysisPass(ev, ruleSet, forbiddenStore, null);
  assert.ok(findingIds(out).includes('CRED-04'),
    `CRED-04 must FIRE on a cross-domain (${'shorten.test'} -> evil.tld) 2-hop chain to a credential form; fired: ${findingIds(out).join(',') || '(none)'}`);
  console.log('  [1] POSITIVE: CRED-04 fires on cross-domain redirect to credential form ✓  (fired:', findingIds(out).join(',') || 'none', ')');
}

// ── Scenario 2: SAME-SITE NEGATIVE — notSameSite(x, x) must be false ───────
{
  const chain: RawRedirectHop[] = [
    { fromUrl: 'https://www.bank.test/', toUrl: 'https://secure.bank.test/', statusCode: 301, mechanism: 'http_3xx' },
    { fromUrl: 'https://secure.bank.test/', toUrl: 'https://secure.bank.test/login', statusCode: 302, mechanism: 'http_3xx' },
  ];
  const snap = snapshotWith('https://secure.bank.test/login', chain, CREDENTIAL_FORM);
  const ev = extractEvidence(snap);

  const r = ev.evidence.redirect;
  // Both endpoints on bank.test — the two domains are EQUAL.
  assert.equal(r.initialRegistrableDomain.state === 'present' ? r.initialRegistrableDomain.value : null, 'bank.test');
  assert.equal(r.finalRegistrableDomain.state === 'present' ? r.finalRegistrableDomain.value : null, 'bank.test');
  assert.equal(r.hopCount.state === 'present' ? r.hopCount.value : null, 2);

  const out = await runAnalysisPass(ev, ruleSet, forbiddenStore, null);
  assert.ok(!findingIds(out).includes('CRED-04'),
    `CRED-04 must NOT fire on a SAME-SITE redirect (notSameSite(bank.test, bank.test) === false), even with 2 hops + credential form; fired: ${findingIds(out).join(',')}`);
  console.log('  [2] SAME-SITE: CRED-04 correctly does NOT fire — notSameSite(x, x) is false ✓');
}

// ── Scenario 3: NO-CREDENTIAL NEGATIVE — third conjunct fails ──────────────
{
  const chain: RawRedirectHop[] = [
    { fromUrl: 'https://shorten.test/x', toUrl: 'https://mid.evil.tld/go', statusCode: 302, mechanism: 'http_3xx' },
    { fromUrl: 'https://mid.evil.tld/go', toUrl: 'https://login.evil.tld/', statusCode: 302, mechanism: 'http_3xx' },
  ];
  const snap = snapshotWith('https://login.evil.tld/', chain, NO_CREDENTIAL);
  const ev = extractEvidence(snap);
  const out = await runAnalysisPass(ev, ruleSet, forbiddenStore, null);
  assert.ok(!findingIds(out).includes('CRED-04'),
    `CRED-04 must NOT fire without a credential form, even on a cross-domain chain; fired: ${findingIds(out).join(',')}`);
  console.log('  [3] NO-CREDENTIAL: CRED-04 correctly does NOT fire — third conjunct (credentialFormPresent) is false ✓');
}

// ── S-10 GUARD — this test proves the MECHANISM, not corpus-validatability ──
//
// The positive case fires on a SERVER-side redirect chain — precisely the
// evidence S-10 says the harness sees but the extension may not. A green test
// here MUST NOT be read as "CRED-04 is now corpus-validatable". Assert S-10 is
// still in force in the contract so a future reader cannot quietly drop it.
{
  const contract = readFileSync(join(REPO_ROOT, 'packages/contracts/snapshot.format.v1.ts'), 'utf8');
  assert.ok(/S-10\s+CRED-04 is DIVERGENT/.test(contract),
    'S-10 must remain in snapshot.format.v1.ts — this fix lets CRED-04 fire but does NOT make its corpus recall a headline figure');
  console.log('  [S-10] DIVERGENT status intact: CRED-04 fires, but corpus recall stays separately-reported (not corpus-headline-valid) ✓');
}

console.log('CRED-04 LIVE-PATH PROVEN: fires on cross-domain redirect to a credential form; stays silent same-site and without a form; S-10 intact.');
