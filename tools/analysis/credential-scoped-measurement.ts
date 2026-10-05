/**
 * Credential-interface-scoped recall measurement (Part 6b) — READ-ONLY.
 *
 * Measures recall and false-positive rate on the ELIGIBLE population defined and
 * PRE-REGISTERED in DECISIONS.md DEC-49 (before any result was computed):
 *   ELIGIBLE = fetch.outcome ∈ {success, http_error}  AND
 *              loginInterface.credentialFormPresent === true (from extractEvidence,
 *              NOT the uniformly-null snapshot.presentsCredentialInterface — DEFECT-45).
 *
 * Changes NO rule, weight, threshold, or empiricalConfidence. Cross-references,
 * does not replace, the whole-corpus Calibration-Sensitivity-Report.
 *
 * Integrity check: the whole-corpus true-positive count at the 30 threshold MUST
 * equal 564 (the Calibration report's figure); otherwise the script aborts.
 *
 * Run:
 *   SSX_CORPUS_STORE=corpus \
 *     node --experimental-strip-types tools/analysis/credential-scoped-measurement.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1.ts';
import { extractEvidence } from '../../apps/harness/extract/extract.ts';
import { readSnapshot, listSnapshots, DEFAULT_STORE } from '../../apps/harness/extract/snapshot-store.ts';

const STORE = DEFAULT_STORE || 'corpus';
const CACHE = 'tools/analysis/.cred-scoped-scores.jsonl';
const MEDIUM = 30;
const HIGH = 60;
const BOOT = 2000;
const EXPECTED_WHOLE_CORPUS_TP = 564; // Calibration-Sensitivity-Report, flagged at 30

const ruleSet = JSON.parse(readFileSync('rulesets/rules-v0.1.0.json', 'utf8')) as RuleSet;

interface Row {
  readonly label: 'benign' | 'phishing';
  readonly splitKey: string;
  readonly outcome: string;
  readonly credForm: boolean;
  readonly score: number;
  readonly fired: readonly string[];
}

async function score(): Promise<Row[]> {
  if (existsSync(CACHE) && process.env['SSX_RESCORE'] !== '1') {
    process.stderr.write(`USING CACHED SCORES (${CACHE}); delete it or set SSX_RESCORE=1 to re-score\n`);
    return readFileSync(CACHE, 'utf8').split('\n').filter((l) => l.length > 0).map((l) => JSON.parse(l) as Row);
  }
  const forbidden: AuthStoreReader = { lookup: async () => { throw new Error('S-8 VIOLATION'); } };
  const out: Row[] = [];
  let errors = 0;
  for (const label of ['phishing', 'benign'] as const) {
    const files = listSnapshots(STORE, label);
    let i = 0;
    for (const path of files) {
      i += 1;
      if (i % 5000 === 0) process.stderr.write(`  ${label}: ${i}/${files.length}\n`);
      try {
        const snap = readSnapshot(path);
        const ev = extractEvidence(snap);
        const outcome = await runAnalysisPass(ev, ruleSet, forbidden, null);
        const li = ev.evidence.loginInterface;
        out.push({
          label,
          splitKey: snap.split.splitKey,
          outcome: (snap.fetch as { outcome?: string }).outcome ?? 'MISSING',
          credForm: li.credentialFormPresent.state === 'present' && li.credentialFormPresent.value === true,
          score: outcome.aggregation.score,
          fired: outcome.findings.map((f) => f.ruleId),
        });
      } catch { errors += 1; }
    }
  }
  process.stderr.write(`scored ${out.length} snapshots, ${errors} errors\n`);
  writeFileSync(CACHE, out.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return out;
}

const rows = await score();
const r4 = (x: number): number | null => (Number.isFinite(x) ? Number(x.toFixed(4)) : null);
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function pctile(a: readonly number[], p: number): number | null {
  if (a.length === 0) return null;
  const s = [...a].sort((x, y) => x - y); const idx = (s.length - 1) * p; const lo = Math.floor(idx); const hi = Math.ceil(idx);
  return Number((s[lo]! + (s[hi]! - s[lo]!) * (idx - lo)).toFixed(4));
}

const CONTENT = new Set(['success', 'http_error']);
const detected = (r: Row, thr: number) => r.score >= thr;
const eligible = (r: Row) => CONTENT.has(r.outcome) && r.credForm;

/* ── integrity check: whole-corpus TP at 30 must equal 564 ─────────────────── */
const wholeTP = rows.filter((r) => r.label === 'phishing' && detected(r, MEDIUM)).length;
if (wholeTP !== EXPECTED_WHOLE_CORPUS_TP) {
  console.error(`INTEGRITY FAIL: whole-corpus TP@${MEDIUM} = ${wholeTP}, expected ${EXPECTED_WHOLE_CORPUS_TP}. Aborting.`);
  process.exit(2);
}

/* ── cascade: whole → content-bearing → eligible → detected≥30 → ≥60 ───────── */
function count(pred: (r: Row) => boolean) {
  const sub = rows.filter(pred);
  const ph = sub.filter((r) => r.label === 'phishing');
  const bn = sub.filter((r) => r.label === 'benign');
  const doms = new Set(sub.map((r) => r.splitKey)).size;
  return { total: sub.length, phishing: ph.length, benign: bn.length, domains: doms };
}
const cascade = {
  wholeCorpus: count(() => true),
  contentBearing: count((r) => CONTENT.has(r.outcome)),
  eligible: count((r) => eligible(r)),
  eligibleDetected30: count((r) => eligible(r) && detected(r, MEDIUM)),
  eligibleDetected60: count((r) => eligible(r) && detected(r, HIGH)),
};

/* ── recall + FP on the eligible population, with domain-level bootstrap CIs ── */
const elig = rows.filter(eligible);
const eligByKey = new Map<string, Row[]>();
for (const r of elig) { const a = eligByKey.get(r.splitKey) ?? []; a.push(r); eligByKey.set(r.splitKey, a); }
const eligKeys = [...eligByKey.keys()];

const eligPhish = elig.filter((r) => r.label === 'phishing');
const eligBenign = elig.filter((r) => r.label === 'benign');
const recallPoint = eligPhish.length ? eligPhish.filter((r) => detected(r, MEDIUM)).length / eligPhish.length : NaN;
const fprPoint = eligBenign.length ? eligBenign.filter((r) => detected(r, MEDIUM)).length / eligBenign.length : NaN;

const rng = mulberry32(0xCAFED00D);
const recallSamples: number[] = []; const fprSamples: number[] = [];
for (let b = 0; b < BOOT; b += 1) {
  let tp = 0, fn = 0, fp = 0, tn = 0;
  for (let k = 0; k < eligKeys.length; k += 1) {
    const rowsK = eligByKey.get(eligKeys[(rng() * eligKeys.length) | 0]!)!;
    for (const r of rowsK) {
      const d = detected(r, MEDIUM);
      if (r.label === 'phishing') { if (d) tp += 1; else fn += 1; } else if (d) fp += 1; else tn += 1;
    }
  }
  if (tp + fn > 0) recallSamples.push(tp / (tp + fn));
  if (fp + tn > 0) fprSamples.push(fp / (fp + tn));
}

/* ── rank undetected eligible-phishing misses by cause ─────────────────────── */
const misses = eligPhish.filter((r) => !detected(r, MEDIUM));
const missNoRuleFired = misses.filter((r) => r.score === 0).length;      // no rule matched at all
const missSubThreshold = misses.filter((r) => r.score > 0 && r.score < MEDIUM).length; // fired but < 30
// of the no-fire misses, which CRED rules are even in play is structural; report the
// fired-rule distribution among DETECTED eligible phishing for contrast.
const detFired = new Map<string, number>();
for (const r of eligPhish) if (detected(r, MEDIUM)) for (const id of new Set(r.fired)) detFired.set(id, (detFired.get(id) ?? 0) + 1);

const out = {
  store: STORE,
  preRegisteredBy: 'DEC-49',
  integrity: { wholeCorpusTP_at30: wholeTP, expected: EXPECTED_WHOLE_CORPUS_TP, ok: wholeTP === EXPECTED_WHOLE_CORPUS_TP },
  cascade,
  eligiblePopulation: { phishing: eligPhish.length, benign: eligBenign.length, distinctDomains: eligKeys.length },
  recall_at30: { point: r4(recallPoint), ci95: [pctile(recallSamples, 0.025), pctile(recallSamples, 0.975)], detected: eligPhish.filter((r) => detected(r, MEDIUM)).length },
  falsePositiveRate_at30: { point: r4(fprPoint), ci95: [pctile(fprSamples, 0.025), pctile(fprSamples, 0.975)], falsePos: eligBenign.filter((r) => detected(r, MEDIUM)).length },
  undetectedEligiblePhishing: {
    total: misses.length,
    byCause: { noRuleFired_score0: missNoRuleFired, firedButSubThreshold_0to30: missSubThreshold },
    detectedFiredRuleDistribution: [...detFired.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ rule: id, count: n })),
  },
};
console.log('SSX_CREDSCOPED_JSON_BEGIN');
console.log(JSON.stringify(out, null, 1));
console.log('SSX_CREDSCOPED_JSON_END');
