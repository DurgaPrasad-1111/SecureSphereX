/**
 * G-10 — deterministic replay gate (closes CP-4's automated half).
 *
 * Replays a small, COMMITTED set of synthetic golden snapshots through the real
 * pipeline (readSnapshot → extractEvidence → runAnalysisPass) and compares every
 * decision BYTE-FOR-BYTE against the committed expected-output file. Any drift —
 * or any non-determinism (two passes disagreeing) — fails the gate.
 *
 * The golden snapshots are SYNTHETIC fixtures authored here (capture.py's snapshot
 * format, mirroring apps/harness/extract/tier1-e2e-fixture.json), NOT corpus
 * payloads — so they are committable (DEC-1 keeps real payloads out of git) and run
 * in CI, which has no corpus. They cover every currently-firing rule
 * (CRED-01 / CRED-04 / CRED-06 / CRED-07) plus one Low/no-finding case.
 *
 * Modes:
 *   node --experimental-strip-types tools/ci/g10-replay.ts
 *       CHECK (CI / verify:all). Exit 0 iff every golden replays to its committed
 *       expected decision AND is byte-stable across two passes.
 *   node --experimental-strip-types tools/ci/g10-replay.ts --generate
 *       Regenerate tools/ci/golden/*.json.gz + expected.json from the SNAPSHOTS
 *       defined below (asserts each intended rule fires). Run after an intentional
 *       engine/ruleset change, then review the expected.json diff.
 *   SSX_E2E_SNAPSHOT=/path/to/real.json.gz node --experimental-strip-types tools/ci/g10-replay.ts
 *       Local-only: replay a REAL capture.py snapshot twice and assert the decision
 *       is byte-identical across passes (determinism on real data; no expected file).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1.ts';
import { extractEvidence } from '../../apps/harness/extract/extract.ts';
import { readSnapshot } from '../../apps/harness/extract/snapshot-store.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOLDEN_DIR = join(REPO, 'tools', 'ci', 'golden');
const EXPECTED = join(GOLDEN_DIR, 'expected.json');
const ruleSet = JSON.parse(readFileSync(join(REPO, 'rulesets', 'rules-v0.1.0.json'), 'utf8')) as RuleSet;

// S-8: the auth store must never be consulted in replay; a throwing reader proves it.
const forbiddenStore: AuthStoreReader = {
  lookup: async () => { throw new Error('S-8 VIOLATION: store consulted during G-10 replay'); },
};

const H = '0'.repeat(64); // placeholder domContentHash (does not affect any rule)
function loginDom(title: string, action: string, pwAutocomplete: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>`
    + `<form method="POST" action="${action}">`
    + '<input type="text" name="u" autocomplete="username">'
    + `<input type="password" name="p" autocomplete="${pwAutocomplete}">`
    + '<button type="submit">Sign in</button></form></body></html>';
}
interface RawHop { fromUrl: string; toUrl: string; mechanism: string; statusCode: number; }
function snapshot(opts: {
  id: string; label: 'phishing' | 'benign'; requestedUrl: string; finalUrl: string;
  dom: string; redirectChain?: RawHop[]; splitKey: string;
}): Record<string, unknown> {
  return {
    snapshotId: opts.id,
    formatVersion: '1.1.0',
    capturedOn: '2026-10-06',
    provenance: { label: opts.label, feed: 'manual', feedVerified: null, reportedOn: null, feedRecordId: null, impersonatedBrand: null },
    split: { split: 'test', assignmentFunctionVersion: 'split-v2', splitKey: opts.splitKey, proportions: { train: 0.6, validation: 0.2, test: 0.2 }, assignedOn: '2026-10-06' },
    fetch: { outcome: 'success', httpStatus: 200, durationMs: 1000, finalUrl: opts.finalUrl, attemptOrdinal: 1 },
    raw: {
      requestedUrl: opts.requestedUrl,
      finalUrl: opts.finalUrl,
      renderedDom: opts.dom,
      domContentHash: H,
      responseHeaders: { 'content-type': 'text/html' },
      redirectChain: opts.redirectChain ?? [],
      tlsCertificateChain: null,
      dnsRecords: null,
      screenshotRef: null,
      scriptRuntimeObservations: { transmissionEndpoints: [], dynamicScriptOrigins: [], dynamicScriptLoadCount: 0, postRequestCount: 0, postAfterDclCount: 0 },
    },
    extraction: null,
    presentsCredentialInterface: null,
  };
}

/** The 5 golden snapshots + the rule each is authored to exercise (generation sanity). */
const SNAPSHOTS: readonly { name: string; mustFire: readonly string[]; snapshot: Record<string, unknown> }[] = [
  {
    name: 'cred01-off-origin-post', mustFire: ['CRED-01'],
    snapshot: snapshot({
      id: 'g10cred01000000000000000000000000', label: 'phishing', splitKey: 'bank-one.example',
      requestedUrl: 'https://accounts.bank-one.example/login', finalUrl: 'https://accounts.bank-one.example/login',
      dom: loginDom('Sign in', 'https://harvest-one.example/collect', 'current-password'),
    }),
  },
  {
    name: 'cred06-cleartext', mustFire: ['CRED-06'],
    snapshot: snapshot({
      id: 'g10cred06000000000000000000000000', label: 'phishing', splitKey: 'bank-six.example',
      requestedUrl: 'http://login.bank-six.example/', finalUrl: 'http://login.bank-six.example/',
      dom: loginDom('Sign in', '/login', 'current-password'), // same-site action over http
    }),
  },
  {
    name: 'cred07-concealed-off-origin', mustFire: ['CRED-07'],
    snapshot: snapshot({
      id: 'g10cred07000000000000000000000000', label: 'phishing', splitKey: 'bank-seven.example',
      requestedUrl: 'https://signup.bank-seven.example/', finalUrl: 'https://signup.bank-seven.example/',
      dom: loginDom('Sign in', 'https://harvest-seven.example/collect', 'off'), // autocomplete off = concealed
    }),
  },
  {
    name: 'cred04-laundered-redirect', mustFire: ['CRED-04'],
    snapshot: snapshot({
      id: 'g10cred04000000000000000000000000', label: 'phishing', splitKey: 'bank-four.example',
      requestedUrl: 'https://start-four.example/', finalUrl: 'https://final.bank-four.example/login',
      dom: loginDom('Sign in', '/login', 'current-password'), // same-site action; CRED-04 via redirect
      redirectChain: [
        { fromUrl: 'https://start-four.example/', toUrl: 'https://mid-four.example/go', mechanism: 'http_3xx', statusCode: 302 },
        { fromUrl: 'https://mid-four.example/go', toUrl: 'https://final.bank-four.example/login', mechanism: 'http_3xx', statusCode: 302 },
      ],
    }),
  },
  {
    name: 'low-benign-no-finding', mustFire: [],
    snapshot: snapshot({
      id: 'g10low00000000000000000000000000', label: 'benign', splitKey: 'benign-low.example',
      requestedUrl: 'https://www.benign-low.example/', finalUrl: 'https://www.benign-low.example/',
      dom: '<!doctype html><html><head><title>Welcome</title></head><body><p>Hello.</p></body></html>',
    }),
  },
];

interface Decision { fired: string[]; score: number; rawTier: string; effectiveTier: string; unevaluable: string[]; }
async function decide(snap: ReturnType<typeof readSnapshot>): Promise<Decision> {
  const outcome = await runAnalysisPass(extractEvidence(snap), ruleSet, forbiddenStore, null);
  return {
    fired: outcome.findings.map((f) => f.ruleId).sort(),
    score: outcome.aggregation.score,
    rawTier: outcome.aggregation.rawTier,
    effectiveTier: outcome.aggregation.effectiveTier,
    unevaluable: Object.entries(outcome.evaluations)
      .filter(([, e]) => e.result.status === 'unevaluable').map(([m]) => m).sort(),
  };
}
const canon = (d: Decision): string => JSON.stringify(d);

async function generate(): Promise<void> {
  mkdirSync(GOLDEN_DIR, { recursive: true });
  const expected: Record<string, Decision> = {};
  for (const g of SNAPSHOTS) {
    const path = join(GOLDEN_DIR, `${g.name}.json.gz`);
    writeFileSync(path, gzipSync(Buffer.from(JSON.stringify(g.snapshot))));
    const d = await decide(readSnapshot(path));
    for (const rule of g.mustFire) {
      if (!d.fired.includes(rule)) {
        console.error(`GENERATE SANITY FAIL: golden ${g.name} must fire ${rule}; fired [${d.fired.join(', ')}]`);
        process.exit(2);
      }
    }
    if (g.mustFire.length === 0 && d.fired.length > 0) {
      console.error(`GENERATE SANITY FAIL: Low golden ${g.name} must fire nothing; fired [${d.fired.join(', ')}]`);
      process.exit(2);
    }
    expected[g.name] = d;
    console.log(`  generated ${g.name}: fired [${d.fired.join(', ')}] score=${d.score} tier=${d.effectiveTier}`);
  }
  writeFileSync(EXPECTED, JSON.stringify(expected, null, 2) + '\n');
  console.log(`G-10 goldens + expected.json regenerated (${SNAPSHOTS.length} snapshots).`);
}

async function checkReal(path: string): Promise<void> {
  const a = canon(await decide(readSnapshot(path)));
  const b = canon(await decide(readSnapshot(path)));
  if (a !== b) { console.error(`G-10 NON-DETERMINISTIC on ${path}:\n  pass1 ${a}\n  pass2 ${b}`); process.exit(1); }
  console.log(`G-10 real-snapshot determinism OK (two passes byte-identical): ${path}`);
}

async function check(): Promise<void> {
  if (!existsSync(EXPECTED)) { console.error(`G-10: ${EXPECTED} missing — run with --generate first.`); process.exit(2); }
  const expected = JSON.parse(readFileSync(EXPECTED, 'utf8')) as Record<string, Decision>;
  const failures: string[] = [];
  for (const g of SNAPSHOTS) {
    const path = join(GOLDEN_DIR, `${g.name}.json.gz`);
    if (!existsSync(path)) { failures.push(`${g.name}: golden snapshot missing (${path})`); continue; }
    const d1 = canon(await decide(readSnapshot(path)));
    const d2 = canon(await decide(readSnapshot(path)));
    if (d1 !== d2) { failures.push(`${g.name}: NON-DETERMINISTIC (pass1 != pass2)`); continue; }
    const exp = expected[g.name];
    if (exp === undefined) { failures.push(`${g.name}: no expected entry`); continue; }
    if (canon(exp) !== d1) failures.push(`${g.name}: DECISION DRIFT\n    expected ${canon(exp)}\n    actual   ${d1}`);
  }
  console.log(`G-10 deterministic replay — ${SNAPSHOTS.length} golden snapshots`);
  if (failures.length > 0) {
    console.error('G-10 FAIL:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  for (const g of SNAPSHOTS) console.log(`  ✓ ${g.name}: [${expected[g.name]!.fired.join(', ')}] tier=${expected[g.name]!.effectiveTier}`);
  console.log('G-10 PASS: every golden replays byte-for-byte to its committed expected decision, and is pass-to-pass deterministic.');
}

const real = process.env['SSX_E2E_SNAPSHOT'];
if (process.argv.includes('--generate')) await generate();
else if (real !== undefined && real !== '') await checkReal(real);
else await check();
