/**
 * LIVE-PATH proof for the DL family (DL-01, DL-02) — mirror of
 * cred04-live-path.test.ts. Drives the REAL extension download producer
 * (computeDownloadContextEvidence) into REAL runAnalysisPass and asserts DL
 * firing. No browser, no real download, deterministic.
 *
 * WHAT THIS SETTLES. DEFECT-38 removed downloadContext as a blocker: the
 * producer now yields real DownloadContextEvidence from a tab-scoped record.
 * This proves DL-02 fires on a real malicious-shaped download and stays silent
 * on a benign one, and documents DL-01's REMAINING, SEPARATE blocker.
 *
 * ⚠️ S-9. DL is in-browser-only; the harness never produces downloadContext, so
 * DL rules fire 0 times against the corpus BY DESIGN. This live-path is the only
 * place DL becomes real — never a corpus figure.
 *
 * ⚠️ DL-01 HAS A SECOND BLOCKER, unrelated to DEFECT-38: its predicate ends in
 * `priorFindingActive`, which reads Analysis History and is not wired
 * (stage2.ts throws -> the rule is `blocked`, never fabricated). So DL-01's
 * downloadContext conjuncts now evaluate, but the rule cannot MATCH until
 * priorFindingActive is wired. This test asserts DL-01 reaches `blocked` (not
 * unevaluable-on-downloadContext), which is the proof DEFECT-38's blocker is
 * gone and a DIFFERENT one remains — the same two-blocker honesty S-10 gave
 * CRED-04.
 *
 * Run: node --experimental-strip-types tools/conformance/dl-live-path.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { collectUrl, collectDomainRepresentation, collectTransport, collectLoginInterface, collectScriptRuntime } from '../../apps/extension/collect-evidence.ts';
import { assembleEvidence } from '../../apps/extension/assemble-evidence.ts';
import { computeDownloadContextEvidence, type DownloadRecord } from '../../apps/extension/download-context.ts';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ruleSet = JSON.parse(readFileSync(join(REPO, 'rulesets', 'rules-v0.1.0.json'), 'utf8')) as RuleSet;
const forbiddenStore: AuthStoreReader = { lookup: async () => { throw new Error('no fingerprint -> store not consulted'); } };

const PAGE = 'https://shop.example.com/checkout';
const EMPTY_DOM = '<!doctype html><html><head><title>Shop</title></head><body><p>No login form.</p></body></html>';

async function passWithDownload(rec: DownloadRecord | undefined) {
  const dom = new JSDOM(EMPTY_DOM, { url: PAGE });
  const base = {
    url: collectUrl(PAGE),
    domainRepresentation: collectDomainRepresentation(PAGE),
    transport: collectTransport(new URL(PAGE).protocol),
    loginInterface: collectLoginInterface(dom.window.document as unknown as ParentNode, dom.window.document.baseURI),
    scriptRuntime: collectScriptRuntime({ transmissionEndpoints: [], dynamicScriptOrigins: [] }),
  };
  const parts = rec ? { ...base, downloadContext: computeDownloadContextEvidence(rec) } : base;
  const evidence = assembleEvidence(parts, PAGE, '2026-09-03');
  return runAnalysisPass(evidence, ruleSet, forbiddenStore, null);
}

const dlRule = (o: { ruleOutcomes: readonly { ruleId: string; status: string }[] }, id: string) =>
  o.ruleOutcomes.find((r) => r.ruleId === id);
const fired = (o: { findings: readonly { ruleId: string }[] }, id: string) => o.findings.some((f) => f.ruleId === id);

// ── DL-02 POSITIVE 1: compound extension (invoice.pdf.exe) ────────────────
{
  const rec: DownloadRecord = {
    url: 'https://cdn.evil.tld/invoice.pdf.exe', filename: 'invoice.pdf.exe',
    mime: 'application/x-msdownload', referrer: 'https://shop.example.com/checkout', observedAt: 1,
  };
  const out = await passWithDownload(rec);
  assert.ok(fired(out, 'DL-02'), `DL-02 must FIRE on a compound-extension download (invoice.pdf.exe); fired: ${out.findings.map(f=>f.ruleId).join(',')||'none'}`);
  console.log('  [1] DL-02 fires on compound extension invoice.pdf.exe ✓');
}

// ── DL-02 POSITIVE 2: extension/mime mismatch (.exe served as image/png) ──
{
  const rec: DownloadRecord = {
    url: 'https://cdn.evil.tld/setup.exe', filename: 'setup.exe',
    mime: 'image/png', referrer: '', observedAt: 1,
  };
  const out = await passWithDownload(rec);
  assert.ok(fired(out, 'DL-02'), `DL-02 must FIRE on an extension/mime mismatch (.exe as image/png); fired: ${out.findings.map(f=>f.ruleId).join(',')||'none'}`);
  console.log('  [2] DL-02 fires on extension/MIME mismatch (.exe as image/png) ✓');
}

// ── DL-02 NEGATIVE: consistent benign download (archive.zip / application/zip) ─
// NOTE: the benign case uses `zip`, which IS in the module's EXTENSION_MIME_MAP,
// so zip+application/zip resolves to extensionMimeConsistent=TRUE -> DL-02 silent.
// A `.pdf`/application/pdf download does NOT stay silent, because `pdf` is absent
// from that 14-entry (executable-focused) map -> consistency=null ->
// `not(is(null))` matches -> DL-02 fires. That over-fire on honest non-executable
// downloads is a PRE-EXISTING module/ruleset behavior (not DEFECT-38), flagged in
// the report as a candidate finding, not silently encoded as "expected" here.
{
  const rec: DownloadRecord = {
    url: 'https://shop.example.com/archive.zip', filename: 'archive.zip',
    mime: 'application/zip', referrer: 'https://shop.example.com/checkout', observedAt: 1,
  };
  const out = await passWithDownload(rec);
  assert.ok(!fired(out, 'DL-02'), `DL-02 must NOT fire on a consistent in-map download (zip/application/zip); fired: ${out.findings.map(f=>f.ruleId).join(',')}`);
  console.log('  [3] DL-02 silent on a consistent in-map download archive.zip/application/zip ✓');
}

// ── DL-01: cross-domain executable download reaches priorFindingActive ────
// The first three conjuncts (executable ext, referrer present, cross-domain)
// now EVALUATE thanks to DEFECT-38. The fourth (priorFindingActive) throws ->
// rule `blocked`. Asserting `blocked` (not unevaluable, not matched) proves the
// downloadContext blocker is gone and priorFindingActive is the one that remains.
{
  const rec: DownloadRecord = {
    url: 'https://cdn.evil.tld/installer.exe', filename: 'installer.exe',
    mime: 'application/x-msdownload', referrer: 'https://shop.example.com/checkout', observedAt: 1,
  };
  const out = await passWithDownload(rec);
  const dl01 = dlRule(out, 'DL-01');
  assert.ok(dl01 !== undefined, 'DL-01 must have an outcome');
  assert.equal(dl01!.status, 'blocked',
    `DL-01 must reach 'blocked' (priorFindingActive), proving downloadContext no longer blocks it; got '${dl01!.status}'`);
  assert.ok(!fired(out, 'DL-01'), 'DL-01 must not produce a finding while priorFindingActive is unwired');
  console.log('  [4] DL-01 reaches priorFindingActive -> blocked (downloadContext blocker GONE; separate blocker remains) ✓');
}

// ── notCollected: no download for this pass -> downloadContext unevaluable ──
// The DEFECT-38 honesty boundary: when the listener did NOT confidently attribute
// a download (no record), the producer is never called, the assembler stubs
// downloadContext to notCollected, and BOTH DL rules are unevaluable — never a
// misattributed guess from a stale global key.
{
  const out = await passWithDownload(undefined);
  assert.ok(!fired(out, 'DL-01') && !fired(out, 'DL-02'),
    'with no download record, neither DL rule may fire');
  const dl02 = dlRule(out, 'DL-02');
  assert.equal(dl02!.status, 'unevaluable',
    `no download -> DL-02 unevaluable (module notCollected), not a false negative from a guess; got '${dl02!.status}'`);
  console.log('  [5] No download record -> downloadContext notCollected -> DL rules unevaluable (no misattribution) ✓');
}

console.log('DL LIVE-PATH PROVEN: DL-02 fires on compound-ext + ext/MIME mismatch, silent on benign; DL-01 downloadContext blocker removed (priorFindingActive remains); no-record path is honestly unevaluable, never a global-key guess (DEFECT-38).');
