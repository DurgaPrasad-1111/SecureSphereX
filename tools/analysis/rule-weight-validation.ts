/**
 * Offline rule-weight validation analysis for SecureSphere X — READ-ONLY.
 *
 * Produces statistical evidence about RELATIVE rule importance on the shipped
 * corpus. It changes NO rule, weight, threshold, or empiricalConfidence, and it is
 * NOT §18.2 validation (no held-out test set, no pre-registered FP budget, and it
 * only covers rules with enough real firings to fit). See
 * docs/Rule-Weight-Validation-Report.md.
 *
 * Method:
 *   - Score every corpus snapshot once through the REAL pipeline
 *     (readSnapshot -> extractEvidence -> runAnalysisPass, prior=null, S-8 store
 *     forbidden), recording {label, splitKey, fired[]}. Cached to
 *     tools/analysis/.rule-scores.jsonl; delete it (or set SSX_RESCORE=1) to
 *     re-score.
 *   - Step 1: per-rule precision = fired-on-phishing / fired-total (snapshot
 *     level), with a 95% CI from a DOMAIN-level bootstrap (resample splitKey, not
 *     snapshots — kit duplication would falsely narrow a snapshot-level interval),
 *     plus effective-n = distinct domains where the rule fired.
 *   - Step 2: L2 (ridge) logistic regression on ONE ROW PER DOMAIN (dedup by
 *     splitKey; feature = "did this domain ever fire rule X"), scoped to rules
 *     firing on >= MIN_DOMAINS_FOR_FIT domains. Reports the pairwise indicator
 *     correlation matrix, fitted coefficients with domain-level bootstrap CIs,
 *     convergence + separation flags, and a rescaled relative-ranking comparison
 *     to the shipped baseWeights (NOT "the corrected weight to ship").
 *
 * Run:
 *   SSX_CORPUS_STORE=corpus \
 *     node --experimental-strip-types tools/analysis/rule-weight-validation.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { runAnalysisPass } from '../../packages/engine/pass.ts';
import type { RuleSet } from '../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../packages/contracts/boundary.interfaces.v1.ts';
import { extractEvidence } from '../../apps/harness/extract/extract.ts';
import { readSnapshot, listSnapshots, DEFAULT_STORE } from '../../apps/harness/extract/snapshot-store.ts';

const STORE = DEFAULT_STORE || 'corpus';
const CACHE = 'tools/analysis/.rule-scores.jsonl';
const LAMBDA = 2.0;                 // ridge penalty (log-odds scale); see report §2
const MIN_DOMAINS_FOR_FIT = 20;     // a predictor needs >= this many distinct firing domains
const BOOT = 2000;                  // bootstrap iterations (domain-level)
const SEP_FLAG = 6;                 // |coef| beyond this (log-odds) is treated as boundary/unstable

const ruleSet = JSON.parse(readFileSync('rulesets/rules-v0.1.0.json', 'utf8')) as RuleSet;
const baseWeightOf = new Map<string, number>(ruleSet.rules.map((r) => [r.id, r.baseWeight as number]));

interface Scored { readonly label: 'benign' | 'phishing'; readonly splitKey: string; readonly fired: readonly string[]; }

/* ── 1. Score every snapshot once (cached) ─────────────────────────────────── */
async function score(): Promise<Scored[]> {
  if (existsSync(CACHE) && process.env['SSX_RESCORE'] !== '1') {
    process.stderr.write(`USING CACHED SCORES (${CACHE}); delete it or set SSX_RESCORE=1 to re-score\n`);
    return readFileSync(CACHE, 'utf8').split('\n').filter((l) => l.length > 0).map((l) => JSON.parse(l) as Scored);
  }
  const forbiddenStore: AuthStoreReader = {
    lookup: async () => { throw new Error('S-8 VIOLATION: store consulted during corpus evaluation'); },
  };
  const out: Scored[] = [];
  let errors = 0;
  for (const label of ['phishing', 'benign'] as const) {
    const files = listSnapshots(STORE, label);
    let i = 0;
    for (const path of files) {
      i += 1;
      if (i % 5000 === 0) process.stderr.write(`  ${label}: ${i}/${files.length}\n`);
      try {
        const snap = readSnapshot(path);
        const outcome = await runAnalysisPass(extractEvidence(snap), ruleSet, forbiddenStore, null);
        out.push({ label, splitKey: snap.split.splitKey, fired: outcome.findings.map((f) => f.ruleId) });
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
function pct(arr: readonly number[], p: number): number | null {
  if (arr.length === 0) return null;
  const a = [...arr].sort((x, y) => x - y);
  const idx = (a.length - 1) * p; const lo = Math.floor(idx); const hi = Math.ceil(idx);
  return Number((a[lo]! + (a[hi]! - a[lo]!) * (idx - lo)).toFixed(4));
}

/* ── Step 0 counts ─────────────────────────────────────────────────────────── */
const phishing = rows.filter((r) => r.label === 'phishing').length;
const benign = rows.filter((r) => r.label === 'benign').length;
const allKeys = new Set(rows.map((r) => r.splitKey));
const firing = new Map<string, { benign: number; phishing: number; domains: Set<string> }>();
for (const r of rows) {
  for (const id of new Set(r.fired)) {
    const e = firing.get(id) ?? { benign: 0, phishing: 0, domains: new Set<string>() };
    e[r.label] += 1; e.domains.add(r.splitKey); firing.set(id, e);
  }
}
const firedRules = [...firing.keys()].sort();

/* ── Step 1: per-rule precision + domain-level bootstrap CI ────────────────── */
const snapsByKey = new Map<string, Scored[]>();
for (const r of rows) { const a = snapsByKey.get(r.splitKey) ?? []; a.push(r); snapsByKey.set(r.splitKey, a); }
const keys = [...snapsByKey.keys()];

const step1 = firedRules.map((id) => {
  const c = firing.get(id)!;
  const total = c.benign + c.phishing;
  const precision = total > 0 ? c.phishing / total : NaN;
  // domain-level bootstrap of precision
  const rng = mulberry32(0x51 + id.length * 7);
  const samples: number[] = []; let degenerate = 0;
  for (let b = 0; b < BOOT; b += 1) {
    let tp = 0; let tot = 0;
    for (let k = 0; k < keys.length; k += 1) {
      const snaps = snapsByKey.get(keys[(rng() * keys.length) | 0]!)!;
      for (const s of snaps) if (s.fired.includes(id)) { tot += 1; if (s.label === 'phishing') tp += 1; }
    }
    if (tot > 0) samples.push(tp / tot); else degenerate += 1;
  }
  return {
    rule: id, firedPhishing: c.phishing, firedBenign: c.benign, firedTotal: total,
    precision: r4(precision), precision95CI: [pct(samples, 0.025), pct(samples, 0.975)],
    effectiveDomains: c.domains.size, bootstrapDegenerate: degenerate,
  };
});

/* ── Step 2: domain-level rows, correlation, ridge logistic regression ─────── */
const predictors = firedRules.filter((id) => (firing.get(id)!.domains.size) >= MIN_DOMAINS_FOR_FIT);
const excludedForFewDomains = firedRules.filter((id) => (firing.get(id)!.domains.size) < MIN_DOMAINS_FOR_FIT)
  .map((id) => ({ rule: id, effectiveDomains: firing.get(id)!.domains.size }));

// one row per domain: label (majority; ties -> phishing) + indicator per predictor
interface DomRow { y: number; x: number[]; }
let overlapDomains = 0;
const domRows: DomRow[] = keys.map((key) => {
  const snaps = snapsByKey.get(key)!;
  const p = snaps.filter((s) => s.label === 'phishing').length;
  const bn = snaps.length - p;
  if (p > 0 && bn > 0) overlapDomains += 1;
  const y = p >= bn ? 1 : 0; // ties -> phishing
  const everFired = new Set<string>();
  for (const s of snaps) for (const id of s.fired) everFired.add(id);
  return { y, x: predictors.map((id) => (everFired.has(id) ? 1 : 0)) };
});
const domPhishing = domRows.filter((r) => r.y === 1).length;

// pairwise phi correlation between predictor indicators (over all domains)
function corr(colA: number, colB: number): number {
  let n = 0; let sa = 0; let sb = 0; let saa = 0; let sbb = 0; let sab = 0;
  for (const r of domRows) { const a = r.x[colA]!; const b = r.x[colB]!; n += 1; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; }
  const cov = sab - (sa * sb) / n; const va = saa - (sa * sa) / n; const vb = sbb - (sb * sb) / n;
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}
const correlation = predictors.map((_, i) => predictors.map((__, j) => Number(corr(i, j).toFixed(3))));
// co-fire counts (domains where BOTH fired)
const coFire = predictors.map((_, i) => predictors.map((__, j) => domRows.filter((r) => r.x[i] === 1 && r.x[j] === 1).length));

/* ridge logistic regression (penalized IRLS / Newton). Intercept unpenalised. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length; const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c += 1) {
    let piv = c; for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const d = M[c]![c]!; if (Math.abs(d) < 1e-12) continue;
    for (let j = c; j <= n; j += 1) M[c]![j]! /= d;
    for (let r = 0; r < n; r += 1) if (r !== c) { const f = M[r]![c]!; for (let j = c; j <= n; j += 1) M[r]![j]! -= f * M[c]![j]!; }
  }
  return M.map((row) => row[n]!);
}
interface Fit { beta: number[]; converged: boolean; iterations: number; maxDelta: number; }
function fitRidge(data: readonly DomRow[]): Fit {
  const k = predictors.length; const dim = k + 1; // + intercept
  const beta = new Array<number>(dim).fill(0);
  let converged = false; let it = 1; let maxDelta = Infinity;
  for (; it <= 50; it += 1) {
    const H: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
    const g = new Array<number>(dim).fill(0);
    for (const row of data) {
      const xv = [1, ...row.x];
      let eta = 0; for (let a = 0; a < dim; a += 1) eta += beta[a]! * xv[a]!;
      const p = 1 / (1 + Math.exp(-eta)); const w = Math.max(p * (1 - p), 1e-9);
      for (let a = 0; a < dim; a += 1) {
        g[a]! += (row.y - p) * xv[a]!;
        for (let bb = 0; bb < dim; bb += 1) H[a]![bb]! += w * xv[a]! * xv[bb]!;
      }
    }
    for (let a = 1; a < dim; a += 1) { g[a]! -= LAMBDA * beta[a]!; H[a]![a]! += LAMBDA; } // penalise non-intercept
    const step = solve(H, g);
    let md = 0; for (let a = 0; a < dim; a += 1) { beta[a]! += step[a]!; md = Math.max(md, Math.abs(step[a]!)); }
    maxDelta = md;
    if (md < 1e-8) { converged = true; break; }
  }
  return { beta, converged, iterations: it, maxDelta };
}
const fit = fitRidge(domRows);

// per-predictor domain-level purity (separation diagnostic)
const purity = predictors.map((id, i) => {
  const firedDom = domRows.filter((r) => r.x[i] === 1);
  const ph = firedDom.filter((r) => r.y === 1).length;
  return { rule: id, domainsFired: firedDom.length, domainPhishing: ph, domainBenign: firedDom.length - ph, domainPurity: firedDom.length ? Number((ph / firedDom.length).toFixed(4)) : null };
});

// coefficient bootstrap CIs (resample domains with replacement, refit)
const rngB = mulberry32(0xC0FFEE);
const coefSamples: number[][] = Array.from({ length: predictors.length + 1 }, () => []);
let bootNonConverged = 0;
for (let b = 0; b < BOOT; b += 1) {
  const sample: DomRow[] = new Array<DomRow>(domRows.length);
  for (let r = 0; r < domRows.length; r += 1) sample[r] = domRows[(rngB() * domRows.length) | 0]!;
  const f = fitRidge(sample);
  if (!f.converged) bootNonConverged += 1;
  for (let a = 0; a < f.beta.length; a += 1) coefSamples[a]!.push(f.beta[a]!);
}
const coefficients = predictors.map((id, i) => {
  const bi = i + 1; // beta[0] is intercept
  const beta = fit.beta[bi]!;
  return {
    rule: id, coefLogOdds: Number(beta.toFixed(4)),
    coef95CI: [pct(coefSamples[bi]!, 0.025), pct(coefSamples[bi]!, 0.975)],
    boundaryUnstable: Math.abs(beta) >= SEP_FLAG, separationPurity: purity[i]!.domainPurity,
  };
});
const intercept = { coefLogOdds: Number(fit.beta[0]!.toFixed(4)), coef95CI: [pct(coefSamples[0]!, 0.025), pct(coefSamples[0]!, 0.975)] };

// rescaled relative-ranking comparison (normalise each to sum-to-1 over the fitted rules)
// fitted importance uses |coef| (magnitude of association); shipped uses baseWeight.
const absCoefSum = predictors.reduce((s, _id, i) => s + Math.abs(fit.beta[i + 1]!), 0);
const weightSum = predictors.reduce((s, id) => s + (baseWeightOf.get(id) ?? 0), 0);
const rankCompare = predictors.map((id, i) => ({
  rule: id,
  fittedShare: absCoefSum > 0 ? Number((Math.abs(fit.beta[i + 1]!) / absCoefSum).toFixed(4)) : null,
  shippedShare: weightSum > 0 ? Number(((baseWeightOf.get(id) ?? 0) / weightSum).toFixed(4)) : null,
  shippedBaseWeight: baseWeightOf.get(id) ?? null,
}));
const byFitted = [...rankCompare].filter((r) => r.fittedShare !== null).sort((a, b) => (b.fittedShare! - a.fittedShare!)).map((r) => r.rule);
const byShipped = [...rankCompare].sort((a, b) => (b.shippedShare! - a.shippedShare!)).map((r) => r.rule);

/* ── emit ──────────────────────────────────────────────────────────────────── */
const out = {
  store: STORE,
  step0: {
    scoredSnapshots: rows.length, phishing, benign, distinctSplitKeys: allKeys.size,
    firingCounts: firedRules.map((id) => ({ rule: id, phishing: firing.get(id)!.phishing, benign: firing.get(id)!.benign, effectiveDomains: firing.get(id)!.domains.size })),
  },
  step1_precision: step1,
  step2: {
    lambda: LAMBDA, minDomainsForFit: MIN_DOMAINS_FOR_FIT, bootstrapIterations: BOOT,
    predictorsFitted: predictors, excludedForFewDomains,
    domainRows: domRows.length, domainPhishing: domPhishing, domainBenign: domRows.length - domPhishing, overlapDomains,
    correlationMatrix: { order: predictors, matrix: correlation, coFireCounts: coFire },
    fit: { converged: fit.converged, iterations: fit.iterations, maxDelta: Number(fit.maxDelta.toExponential(2)), bootNonConverged },
    separationPurity: purity,
    intercept, coefficients,
    relativeRanking: { note: 'fittedShare = |coef|/sum|coef|; shippedShare = baseWeight/sum(baseWeight). Different model families — relative agreement only, NOT a weight to ship.', rows: rankCompare, orderByFitted: byFitted, orderByShipped: byShipped },
  },
};
console.log('SSX_RULEWEIGHT_JSON_BEGIN');
console.log(JSON.stringify(out, null, 1));
console.log('SSX_RULEWEIGHT_JSON_END');
