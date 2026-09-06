/**
 * Calibration sensitivity analysis for SecureSphere X — READ-ONLY.
 *
 * This CHARACTERIZES the sensitivity of the shipped thresholds and reports honest
 * uncertainty. It does NOT alter any threshold, weight, or empiricalConfidence,
 * and it does NOT constitute §18.2 validation (which requires a held-out test set
 * meeting a false-positive budget). See docs/Calibration-Sensitivity-Report.md.
 *
 * Method (why it is cheap):
 *   Stage 7 `computeRawTier(score, {medium, high})` is a pure reclassification of
 *   an already-computed raw score — rule matching / scoring is INDEPENDENT of the
 *   thresholds. So each snapshot's score is computed ONCE via the real pipeline
 *   (readSnapshot -> extractEvidence -> runAnalysisPass, prior=null), then every
 *   threshold in every sweep and every bootstrap resample is a comparison against
 *   those cached scores — no re-scoring.
 *
 * Independence unit (DesignNote-Corpus-Split-Independence.md): the registrable
 * domain, recorded as each snapshot's `split.splitKey`. Bootstrap resamples
 * splitKeys (domains) with replacement, never individual snapshots.
 *
 * Scope (DEC-28 / S-10): the corpus can validate only the rules that (a) are
 * live and (b) fire from statically-extracted snapshot evidence with no store and
 * no browser. The script reports which rules actually fired, so the scope is a
 * measured fact in the output, not an assumption.
 *
 * Run (scores + sweeps + bootstrap, prints a JSON blob the report quotes):
 *   SSX_CORPUS_STORE=corpus \
 *     node --experimental-strip-types tools/analysis/threshold-sensitivity.ts
 */

import { readFileSync } from 'node:fs';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1.ts';
import { extractEvidence } from '../../apps/harness/extract/extract.ts';
import { readSnapshot, listSnapshots, DEFAULT_STORE } from '../../apps/harness/extract/snapshot-store.ts';

const STORE = DEFAULT_STORE || 'corpus';
const ruleSet = JSON.parse(readFileSync('rulesets/rules-v0.1.0.json', 'utf8')) as RuleSet;
const SHIPPED_MEDIUM = ruleSet.parameters.find((p) => p.id === 'threshold_medium')!.value as number;
const SHIPPED_HIGH = ruleSet.parameters.find((p) => p.id === 'threshold_high')!.value as number;

/** S-8: the store must never be consulted during corpus evaluation; a throwing
 *  reader makes that a crash rather than an assumption. */
const forbiddenStore: AuthStoreReader = {
  lookup: async () => { throw new Error('S-8 VIOLATION: store consulted during corpus evaluation'); },
};

interface Scored { label: 'benign' | 'phishing'; splitKey: string; score: number; credForm: boolean; fired: readonly string[]; }

/* ── 1. Score every snapshot ONCE through the real pipeline ─────────────────── */
const scored: Scored[] = [];
let errors = 0;
const firedCount = new Map<string, { benign: number; phishing: number }>();
for (const label of ['phishing', 'benign'] as const) {
  const files = listSnapshots(STORE, label);
  let i = 0;
  for (const path of files) {
    i += 1;
    if (i % 5000 === 0) process.stderr.write(`  ${label}: ${i}/${files.length}\n`);
    try {
      const snap = readSnapshot(path);
      const ev = extractEvidence(snap);
      const outcome = await runAnalysisPass(ev, ruleSet, forbiddenStore, null);
      const li = ev.evidence.loginInterface;
      const fired = outcome.findings.map((f) => f.ruleId);
      scored.push({
        label,
        splitKey: snap.split.splitKey,
        score: outcome.aggregation.score,
        credForm: li.credentialFormPresent.state === 'present' && li.credentialFormPresent.value,
        fired,
      });
      for (const id of new Set(fired)) {
        const e = firedCount.get(id) ?? { benign: 0, phishing: 0 };
        e[label] += 1;
        firedCount.set(id, e);
      }
    } catch { errors += 1; }
  }
}

const allKeys = [...new Set(scored.map((r) => r.splitKey))];
const phishing = scored.filter((r) => r.label === 'phishing');
const benign = scored.filter((r) => r.label === 'benign');
const credRows = scored.filter((r) => r.credForm);

/* ── 2. metric helpers over cached scores ──────────────────────────────────── */
function metrics(rows: Scored[], flagged: (r: Scored) => boolean) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of rows) {
    const f = flagged(r);
    if (r.label === 'phishing') { if (f) tp += 1; else fn += 1; } else if (f) fp += 1; else tn += 1;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : NaN;
  const recall = tp + fn > 0 ? tp / (tp + fn) : NaN;
  const f1 = Number.isFinite(precision) && Number.isFinite(recall) && precision + recall > 0
    ? (2 * precision * recall) / (precision + recall) : NaN;
  return { tp, fp, fn, tn, precision, recall, f1 };
}
const r3 = (x: number) => Number.isFinite(x) ? Number(x.toFixed(4)) : null;

/* ── 3. Curve A: sweep threshold_medium (high fixed) — flagged = Medium+ ────── */
const curveMedium: unknown[] = [];
for (let m = 10; m <= 50; m += 2) {
  const g = metrics(scored, (r) => r.score >= m);
  curveMedium.push({ medium: m, ...g, precision: r3(g.precision), recall: r3(g.recall), f1: r3(g.f1) });
}

/* ── 4. Curve B: sweep threshold_high (medium fixed 30) ────────────────────── */
// Medium-or-above (flagged) depends ONLY on `medium`, so it is INVARIANT to high;
// what `high` controls is the Block (High) tier. Report both, honestly.
const flaggedAtMed30 = metrics(scored, (r) => r.score >= SHIPPED_MEDIUM);
const curveHigh: unknown[] = [];
for (let h = 35; h <= 90; h += 5) {
  const block = metrics(scored, (r) => r.score >= h);            // High/Block tier
  curveHigh.push({ high: h, blockPrecision: r3(block.precision), blockRecall: r3(block.recall), blockF1: r3(block.f1), tp: block.tp, fp: block.fp, fn: block.fn });
}

/* ── 5. Bootstrap CI at shipped (30/60), DOMAIN-level resampling ────────────── */
const rowsByKey = new Map<string, Scored[]>();
for (const r of scored) { const a = rowsByKey.get(r.splitKey) ?? []; a.push(r); rowsByKey.set(r.splitKey, a); }
const keys = [...rowsByKey.keys()];
function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(0x5ec0de);
const B = 2000;
const precs: number[] = []; const recs: number[] = []; let degeneratePrec = 0;
const flaggedShipped = (r: Scored) => r.score >= SHIPPED_MEDIUM; // Medium-or-above = intervene (§11.2)
for (let b = 0; b < B; b += 1) {
  let tp = 0, fp = 0, fn = 0;
  for (let k = 0; k < keys.length; k += 1) {
    const key = keys[(rng() * keys.length) | 0]!;
    for (const r of rowsByKey.get(key)!) {
      const f = flaggedShipped(r);
      if (r.label === 'phishing') { if (f) tp += 1; else fn += 1; } else if (f) fp += 1;
    }
  }
  if (tp + fp > 0) precs.push(tp / (tp + fp)); else degeneratePrec += 1;
  if (tp + fn > 0) recs.push(tp / (tp + fn));
}
function pct(arr: number[], p: number): number { const a = [...arr].sort((x, y) => x - y); const idx = (a.length - 1) * p; const lo = Math.floor(idx), hi = Math.ceil(idx); return a[lo]! + (a[hi]! - a[lo]!) * (idx - lo); }

const pointPrec = metrics(scored, flaggedShipped);

/* ── 6. Emit ───────────────────────────────────────────────────────────────── */
const out = {
  store: STORE,
  shipped: { medium: SHIPPED_MEDIUM, high: SHIPPED_HIGH },
  counts: {
    scored: scored.length, errors, phishing: phishing.length, benign: benign.length,
    credentialBearing: credRows.length, distinctSplitKeys: allKeys.length,
    scoreNonZero: scored.filter((r) => r.score > 0).length,
  },
  firedRules: [...firedCount.entries()].sort().map(([id, c]) => ({ id, ...c })),
  pointEstimateAtShipped: { precision: r3(pointPrec.precision), recall: r3(pointPrec.recall), f1: r3(pointPrec.f1), tp: pointPrec.tp, fp: pointPrec.fp, fn: pointPrec.fn, tn: pointPrec.tn },
  curveMedium,
  curveHigh_medFixed30: { flaggedMediumOrAbove_invariant: { precision: r3(flaggedAtMed30.precision), recall: r3(flaggedAtMed30.recall), f1: r3(flaggedAtMed30.f1) }, blockTierCurve: curveHigh },
  bootstrap: {
    iterations: B, effectiveN_distinctDomains: keys.length, resampleUnit: 'splitKey (registrable domain)',
    degeneratePrecisionIters: degeneratePrec,
    precision95CI: [r3(pct(precs, 0.025)), r3(pct(precs, 0.975))], precisionMedian: r3(pct(precs, 0.5)),
    recall95CI: [r3(pct(recs, 0.025)), r3(pct(recs, 0.975))], recallMedian: r3(pct(recs, 0.5)),
  },
};
console.log('SSX_SENSITIVITY_JSON_BEGIN');
console.log(JSON.stringify(out, null, 1));
console.log('SSX_SENSITIVITY_JSON_END');
