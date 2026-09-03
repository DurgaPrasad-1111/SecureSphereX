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
 * DL-01's second blocker (priorFindingActive) is now RESOLVED (Option C,
 * 2026-09-03): the predicate reads the threaded `PriorPassState.
 * anyPriorPrimaryFindingActive` instead of throwing, so the throw/`blocked`
 * path is retired. This test proves DL-01 both stays unmatched with no prior
 * committed finding AND fires end-to-end once a prior primary finding is
 * threaded in — DEFECT-38's downloadContext blocker gone AND priorFindingActive
 * answered. (Production still runs single-pass with prior=null in the
 * service-worker — see GROUND-TRUTH-STATUS.md — so DL-01 does not yet fire
 * live; the engine resolves it the moment the multi-pass session runtime is
 * wired.)
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
import type { PriorPassState } from '../../packages/engine/stage7-8.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ruleSet = JSON.parse(readFileSync(join(REPO, 'rulesets', 'rules-v0.1.0.json'), 'utf8')) as RuleSet;
const forbiddenStore: AuthStoreReader = { lookup: async () => { throw new Error('no fingerprint -> store not consulted'); } };

const PAGE = 'https://shop.example.com/checkout';
const EMPTY_DOM = '<!doctype html><html><head><title>Shop</title></head><body><p>No login form.</p></body></html>';

async function passWithDownload(rec: DownloadRecord | undefined, prior: PriorPassState | null = null) {
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
  return runAnalysisPass(evidence, ruleSet, forbiddenStore, prior);
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

// ── DL-02 POSITIVE: CONFIRMED inconsistency (.exe served as image/png) — this
// is extensionMimeConsistent = FALSE (a KNOWN-inconsistent pairing), which
// eq(x, false) matches. The over-fire fix (DEC-41) does NOT weaken true
// detection: a genuine mismatch still fires.
{
  const rec: DownloadRecord = {
    url: 'https://cdn.evil.tld/setup.exe', filename: 'setup.exe',
    mime: 'image/png', referrer: '', observedAt: 1,
  };
  const out = await passWithDownload(rec);
  assert.ok(fired(out, 'DL-02'), `DL-02 must FIRE on an extension/mime mismatch (.exe as image/png); fired: ${out.findings.map(f=>f.ruleId).join(',')||'none'}`);
  console.log('  [2] DL-02 fires on extension/MIME mismatch (.exe as image/png) ✓');
}

// ── DL-02 NEGATIVE 1: UNKNOWN extension — the exact report.pdf case that
// exposed DEFECT-39. `pdf` is not in EXTENSION_MIME_MAP -> extensionMimeConsistent
// = null (unknown). After DEC-41 (not(is) -> eq(x,false)), null no longer matches
// -> DL-02 SILENT. Under the old predicate this FIRED (null-as-false); that is
// the regression this asserts is gone.
{
  const rec: DownloadRecord = {
    url: 'https://shop.example.com/report.pdf', filename: 'report.pdf',
    mime: 'application/pdf', referrer: 'https://shop.example.com/checkout', observedAt: 1,
  };
  const out = await passWithDownload(rec);
  assert.ok(!fired(out, 'DL-02'), `DEFECT-39: DL-02 must NOT fire on an UNKNOWN-extension download (report.pdf -> extensionMimeConsistent null); fired: ${out.findings.map(f=>f.ruleId).join(',')}`);
  console.log('  [3a] DL-02 SILENT on unknown-extension report.pdf/application/pdf (DEFECT-39 fixed: null is no longer treated as false) ✓');
}

// ── DL-02 NEGATIVE 2: KNOWN-consistent download stays silent too ──────────
{
  const rec: DownloadRecord = {
    url: 'https://shop.example.com/archive.zip', filename: 'archive.zip',
    mime: 'application/zip', referrer: 'https://shop.example.com/checkout', observedAt: 1,
  };
  const out = await passWithDownload(rec);
  assert.ok(!fired(out, 'DL-02'), `DL-02 must NOT fire on a KNOWN-consistent download (zip/application/zip -> true); fired: ${out.findings.map(f=>f.ruleId).join(',')}`);
  console.log('  [3b] DL-02 silent on a known-consistent archive.zip/application/zip ✓');
}

// ── DL-01: cross-domain executable download reaches priorFindingActive ────
// The first three conjuncts (executable ext, referrer present, cross-domain)
// EVALUATE thanks to DEFECT-38. The fourth (priorFindingActive) now RESOLVES
// against threaded prior state (Option C, 2026-09-03) — the throw/`blocked`
// path is retired. This proves BOTH: (a) with no prior committed finding the
// whole `and` correctly does not match, and (b) with a prior primary finding
// threaded in, DL-01 fires end-to-end through the real pass — the first time
// DL-01 produces a finding against real evidence.
{
  const rec: DownloadRecord = {
    url: 'https://cdn.evil.tld/installer.exe', filename: 'installer.exe',
    mime: 'application/x-msdownload', referrer: 'https://shop.example.com/checkout', observedAt: 1,
  };

  // (a) No prior committed pass -> priorFindingActive noMatch -> DL-01 unmatched.
  const noPrior = await passWithDownload(rec, null);
  const dl01NoPrior = dlRule(noPrior, 'DL-01');
  assert.ok(dl01NoPrior !== undefined, 'DL-01 must have an outcome');
  assert.equal(dl01NoPrior!.status, 'unmatched',
    `DL-01 with no prior finding must be 'unmatched' (first three conjuncts match, priorFindingActive noMatch); got '${dl01NoPrior!.status}'`);
  assert.ok(!fired(noPrior, 'DL-01'), 'DL-01 must not fire without a prior committed finding');

  // (b) A prior committed pass carried a primary finding -> priorFindingActive
  // matches -> the full `and` matches -> DL-01 FIRES against real evidence.
  const priorWithFinding: PriorPassState = {
    highestInterventionTier: null, interventionPresented: false, anyPriorPrimaryFindingActive: true,
  };
  const withPrior = await passWithDownload(rec, priorWithFinding);
  const dl01WithPrior = dlRule(withPrior, 'DL-01');
  assert.equal(dl01WithPrior!.status, 'matched',
    `DL-01 must MATCH with a prior primary finding threaded in; got '${dl01WithPrior!.status}'`);
  assert.ok(fired(withPrior, 'DL-01'),
    'DL-01 must produce a finding end-to-end once priorFindingActive resolves true');
  console.log('  [4] DL-01 resolves priorFindingActive: unmatched with no prior, FIRES with a prior primary finding (Option C) ✓');
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

console.log('DL LIVE-PATH PROVEN: DL-02 fires on confirmed inconsistency + compound extension; SILENT on unknown-extension (report.pdf) and known-consistent downloads (DEFECT-39 fixed, DEC-41); DL-01 fully resolves — unmatched with no prior finding, FIRES with a prior primary finding threaded in (Option C / DEC-43); no-record path unevaluable, never a global-key guess (DEFECT-38).');
