/**
 * First end-to-end run of the full pipeline against the real corpus, and the
 * first confusion matrix this project has ever produced.
 *
 * Snapshot -> extractEvidence -> runAnalysisPass (Stages 1-8) -> tier, compared
 * against the corpus label. Nothing here is new engine logic: it is the
 * existing `runAnalysisPass` driven by real extracted evidence instead of
 * hand-written fixtures, which is the step CP-1's scope boundary 2 explicitly
 * said had never happened ("No module has ever run against a real captured
 * snapshot or a live browser").
 *
 * ────────────────────────────────────────────────────────────────────────
 * READ THE CAVEATS BEFORE THE NUMBER. They are not boilerplate; several of
 * them bound what the number can mean more tightly than the number itself.
 *
 *  1. FOUR RULES, NOT THE ENGINE (DEC-26). Only CRED-01/03/06/07 are fully
 *     corpus-validatable. CRED-02 is half-blocked by S-8, CRED-04 twice over
 *     by DEFECT-19 and S-10, CRED-05/A1 by DEC-14, DL/PM by S-9. A matrix
 *     here measures four rules, and must never be presented as engine
 *     accuracy.
 *  2. THE DENOMINATOR IS NOT THE CORPUS (DEC-27 §4). All four gate on
 *     `credentialFormPresent`. Snapshots without a credential interface
 *     cannot fire them and are structurally predicted-negative.
 *  3. RECALL IS A FLOOR, NOT A MEASUREMENT (DEFECT-31,
 *     STATIC_EXTRACTION_RECALL_FLOOR). CSS/JS-concealed fields and
 *     out-of-core confusables are invisible to static extraction. Both bias
 *     recall DOWN, concentrated in the more sophisticated attacks.
 *  4. CLASSIFICATION ERROR IS UNQUANTIFIED IN ONE DIRECTION (DEFECT-32).
 *     The over-classification arm was measured and largely closed by the
 *     secret-bearing ruling; the under-classification arm remains unmeasured
 *     and needs hand-labelled ground truth.
 *  5. NOT THE INDEXED CORPUS (DEC-27 §5). `corpus/INDEX.jsonl` has 26,700
 *     entries and zero payloads. This runs on a 617-snapshot store.
 *  6. NO RESIDUAL-LEAKAGE METRICS (S-11). Cross-split duplication, temporal
 *     holdout and CRED-02 brand overlap MUST accompany any published result.
 *     They are not computed here.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Run:
 *   SSX_CORPUS_STORE=/path/to/corpus \
 *     node --experimental-strip-types apps/harness/metrics/confusion.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAnalysisPass } from '../../../packages/engine/pass.ts';
import type { RuleSet } from '../../../packages/contracts/ruleset.format.v1.ts';
import type { AuthStoreReader } from '../../../packages/contracts/boundary.interfaces.v1.ts';
import type { RiskTier } from '../../../packages/contracts/passresult.contract.v1.ts';
import { extractEvidence } from '../extract/extract.ts';
import { readSnapshot, listSnapshots, DEFAULT_STORE } from '../extract/snapshot-store.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ruleSet = JSON.parse(
  readFileSync(join(REPO_ROOT, 'rulesets', 'rules-v0.1.0.json'), 'utf8'),
) as RuleSet;

const STORE = DEFAULT_STORE;
if (STORE === '') {
  console.error('SSX_CORPUS_STORE is not set — nothing to measure.');
  process.exit(1);
}

/**
 * Throws if called, and that is load-bearing rather than lazy.
 *
 * S-8 forbids the capture pipeline from touching the Authentication History
 * Store, and `loginInterface.fingerprint` is `notCollected` for every
 * extracted snapshot, so `authContext` returns `unevaluable` BEFORE any
 * lookup. A throwing reader turns "the store is never consulted" from an
 * assumption into something this run would crash on if it were false.
 */
const forbiddenStore: AuthStoreReader = {
  lookup: async () => {
    throw new Error('S-8 VIOLATION: the store was consulted during corpus evaluation');
  },
};

/**
 * The decision rule. Stated explicitly because it is a CHOICE, not a fact
 * about the engine: a tier of Medium or High means the system would intervene
 * (§11.2), so that is what "predicted phishing" means here. Tier is used
 * rather than raw score so the threshold comes from the rule set (§13.2:
 * medium 30, high 60) rather than being hardcoded in the metric.
 */
function isPositive(tier: RiskTier): boolean {
  return tier === 'Medium' || tier === 'High';
}

interface Row {
  label: 'benign' | 'phishing';
  tier: RiskTier;
  score: number;
  fired: readonly string[];
  hasCredentialInterface: boolean;
  hasDom: boolean;
  unevaluableModules: number;
}

const rows: Row[] = [];
const errors: { path: string; message: string }[] = [];

for (const label of ['benign', 'phishing'] as const) {
  for (const path of listSnapshots(STORE, label)) {
    try {
      const snapshot = readSnapshot(path);
      const evidence = extractEvidence(snapshot);
      const outcome = await runAnalysisPass(evidence, ruleSet, forbiddenStore, null);

      const li = evidence.evidence.loginInterface;
      rows.push({
        label,
        tier: outcome.aggregation.effectiveTier,
        score: outcome.aggregation.score,
        fired: outcome.findings.map((f) => f.ruleId),
        hasCredentialInterface:
          li.credentialFormPresent.state === 'present' && li.credentialFormPresent.value,
        hasDom: snapshot.raw.renderedDom !== null && snapshot.raw.renderedDom !== '',
        unevaluableModules: Object.values(outcome.evaluations)
          .filter((e) => e.result.status === 'unevaluable').length,
      });
    } catch (e) {
      // Recorded, never swallowed: a crash rate is itself a result, and a
      // matrix computed over a silently-shrunken denominator would be wrong
      // in a way nothing downstream could detect.
      errors.push({ path, message: e instanceof Error ? e.message : String(e) });
    }
  }
}

/* ── the matrix ───────────────────────────────────────────────────────── */

const tp = rows.filter((r) => r.label === 'phishing' && isPositive(r.tier)).length;
const fn = rows.filter((r) => r.label === 'phishing' && !isPositive(r.tier)).length;
const fp = rows.filter((r) => r.label === 'benign' && isPositive(r.tier)).length;
const tn = rows.filter((r) => r.label === 'benign' && !isPositive(r.tier)).length;

const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);

console.log('='.repeat(74));
console.log('CONFUSION MATRIX — WHOLE CORPUS  (predicted positive = tier Medium or High)');
console.log('='.repeat(74));
console.log(`  evaluated: ${rows.length}    errors: ${errors.length}`);
console.log('');
console.log('                    predicted PHISHING   predicted BENIGN');
console.log(`  actual PHISHING   TP = ${String(tp).padStart(4)}            FN = ${String(fn).padStart(4)}`);
console.log(`  actual BENIGN     FP = ${String(fp).padStart(4)}            TN = ${String(tn).padStart(4)}`);
console.log('');
console.log(`  Precision ${pct(tp, tp + fp)}   Recall ${pct(tp, tp + fn)}   Specificity ${pct(tn, tn + fp)}`);
console.log(`  Accuracy  ${pct(tp + tn, rows.length)}`);

/* ── the same matrix on the population the rules can actually reach ───── */

const reach = rows.filter((r) => r.hasCredentialInterface);
const rtp = reach.filter((r) => r.label === 'phishing' && isPositive(r.tier)).length;
const rfn = reach.filter((r) => r.label === 'phishing' && !isPositive(r.tier)).length;
const rfp = reach.filter((r) => r.label === 'benign' && isPositive(r.tier)).length;
const rtn = reach.filter((r) => r.label === 'benign' && !isPositive(r.tier)).length;

console.log('');
console.log('='.repeat(74));
console.log('CONFUSION MATRIX — CREDENTIAL-BEARING SUBSET ONLY');
console.log('='.repeat(74));
console.log('  The four validatable rules ALL gate on credentialFormPresent. Snapshots');
console.log('  without a credential interface are structurally predicted-negative and');
console.log('  cannot inform precision or recall. DEC-27 §4 requires CP-2 intervals to');
console.log('  be computed on THIS denominator, not the corpus count.');
console.log('');
console.log(`  population: ${reach.length} of ${rows.length}  (${pct(reach.length, rows.length)})`);
console.log('');
console.log('                    predicted PHISHING   predicted BENIGN');
console.log(`  actual PHISHING   TP = ${String(rtp).padStart(4)}            FN = ${String(rfn).padStart(4)}`);
console.log(`  actual BENIGN     FP = ${String(rfp).padStart(4)}            TN = ${String(rtn).padStart(4)}`);
console.log('');
console.log(`  Precision ${pct(rtp, rtp + rfp)}   Recall ${pct(rtp, rtp + rfn)}   Specificity ${pct(rtn, rtn + rfp)}`);

/* ── supporting breakdowns ────────────────────────────────────────────── */

console.log('');
console.log('-'.repeat(74));
console.log('PER-RULE FIRING COUNTS');
const perRule = new Map<string, { benign: number; phishing: number }>();
for (const r of rows) {
  for (const id of new Set(r.fired)) {
    const e = perRule.get(id) ?? { benign: 0, phishing: 0 };
    e[r.label] += 1;
    perRule.set(id, e);
  }
}
if (perRule.size === 0) console.log('  (no rule fired on any snapshot)');
for (const [id, c] of [...perRule.entries()].sort()) {
  console.log(`  ${id.padEnd(10)} benign ${String(c.benign).padStart(4)}   phishing ${String(c.phishing).padStart(4)}`);
}

console.log('');
console.log('-'.repeat(74));
console.log('TIER DISTRIBUTION');
for (const label of ['benign', 'phishing'] as const) {
  const sub = rows.filter((r) => r.label === label);
  const counts = (['Low', 'Medium', 'High'] as const)
    .map((t) => `${t}=${sub.filter((r) => r.tier === t).length}`).join('  ');
  console.log(`  ${label.padEnd(9)} n=${String(sub.length).padStart(4)}   ${counts}`);
}

console.log('');
console.log('-'.repeat(74));
console.log('WHY SNAPSHOTS ARE PREDICTED NEGATIVE  (the denominator problem, made explicit)');
for (const label of ['benign', 'phishing'] as const) {
  const sub = rows.filter((r) => r.label === label);
  console.log(`  ${label}: ${sub.length} total`);
  console.log(`     no DOM captured            ${sub.filter((r) => !r.hasDom).length}`);
  console.log(`     DOM but no credential form ${sub.filter((r) => r.hasDom && !r.hasCredentialInterface).length}`);
  console.log(`     credential form present    ${sub.filter((r) => r.hasCredentialInterface).length}`);
}

const avgUnevaluable = rows.reduce((s, r) => s + r.unevaluableModules, 0) / (rows.length || 1);
console.log('');
console.log(`  Mean unevaluable modules per pass: ${avgUnevaluable.toFixed(1)} of 10`);
console.log('  (ssl/dns/redirect/scriptRuntime/downloadContext/permissionContext/authContext');
console.log('   are stubbed or contractually out of scope — see DEC-26 as amended.)');

if (errors.length > 0) {
  console.log('');
  console.log('-'.repeat(74));
  console.log(`ERRORS (${errors.length}) — first 5:`);
  for (const e of errors.slice(0, 5)) console.log(`  ${e.path}\n    ${e.message}`);
}
