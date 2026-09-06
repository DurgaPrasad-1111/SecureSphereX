# Calibration Sensitivity Report — SecureSphere X

**Status:** Analysis and reporting only. **Read-only.** No threshold, weight, or
`empiricalConfidence` value was changed anywhere by this work.

**What this is:** a characterization of how sensitive the shipped thresholds
(`threshold_medium = 30`, `threshold_high = 60`) are, with domain-level bootstrap
confidence intervals on precision and recall at those values.

**What this is NOT:** validation. It does not meet the §18.2 bar (a measurement on
a held-out test set against a false-positive budget), and it exercises only 4 of
the 11 rules. See §8. Every rule remains **Unvalidated** after this report.

Reproduce: `SSX_CORPUS_STORE=corpus node --experimental-strip-types tools/analysis/threshold-sensitivity.ts`
(prints the JSON these numbers are transcribed from). Run of record: 2026-09-06.

---

## 0. Methodology grounding (per DesignNote-Corpus-Split-Independence.md)

- **Unit of independence = registrable domain**, recorded as each snapshot's
  `split.splitKey`. This is the design note's adopted option C. There is **no
  separately-tracked "kit ID"** in the corpus and none was invented; kit-level
  duplication (M3) is a *reported* residual, never a splitting key.
- **Corpus size (this run):** **34,631** snapshot payloads scored end-to-end
  through the real pipeline (`readSnapshot → extractEvidence → runAnalysisPass`,
  `prior = null`), **0 errors**. Of these, **25,360 phishing** and **9,271 benign**.
  (`corpus/INDEX.jsonl` carries 35,087 records — 19,637 with `fetchOutcome=success`
  — of which 34,631 have a stored payload on disk; the scan runs on the payloads.)
- **Distinct `splitKey` values (effective n) among scored snapshots: 7,601.**
  (INDEX carries 7,766 distinct keys across all 35,087 records.) The design note's
  worked example used "~800 effective units"; the real corpus has grown well past
  that — effective n is **7,601 domains**, not 800.

---

## 1. Why the sweep is cheap (threshold consumption)

Stage 7's `computeRawTier` (`packages/engine/stage7-8.ts`) is exactly:

```
computeRawTier(score, {medium, high}) = score >= high ? 'High'
                                      : score >= medium ? 'Medium' : 'Low'
```

It is a **pure reclassification of an already-computed raw score.** Rule matching
and scoring (the base-weights of the rules that fire) are **independent of the
thresholds** — the thresholds enter only at this final tier cut. Therefore each
snapshot's score is computed **once**, and every threshold in every sweep and
every bootstrap resample is a comparison against those cached scores. No corpus
item is scored more than once; there are no "30 full corpus passes."

"Flagged" throughout = tier **Medium-or-above** = `score ≥ threshold_medium`,
i.e. the system would intervene (§11.2).

---

## 2. Scope — which rules the corpus actually validates (MEASURED, not assumed)

Per DEC-28 / S-10, the corpus cannot exercise the full 11-rule system. **This was
measured from the current code, not assumed from DEC-28.** The rules that actually
fired on ≥1 snapshot (firing counts, benign / phishing):

| Rule | benign | phishing | Notes |
|---|---:|---:|---|
| **CRED-01** | 4 | 233 | fired |
| **CRED-04** | 11 | 48 | fired (still S-10 / DEFECT-19: harness-side firing may not match live) |
| **CRED-06** | 0 | 333 | fired — the only rule that fires on benign zero times |
| **CRED-07** | 9 | 142 | fired |

**Silent on this corpus (0 firings):** CRED-02 (gates on the Authentication History
Store, which S-8 forbids the harness from consulting — a throwing reader guarded
this run), CRED-03, CRED-05, CRED-A1, DL-01, DL-02, PM-01 (DL/PM are S-9,
in-browser-only; CRED-05/A1 non-functional per DEC-14/46; CRED-03 found no
mixed-script-homograph-with-credentials case in the corpus). All 11 rules are
`lifecycleState: Active`; silence is a reachability fact, not a disabled rule.

> **Scope caveat, stated in-report as required:** every precision/recall/F1 number
> below reflects **only these four rules (CRED-01, CRED-04, CRED-06, CRED-07)** —
> not the 11-rule system. It must never be read as whole-engine accuracy.
>
> **Divergence from DEC-28, flagged honestly:** DEC-28 recorded CRED-01 and CRED-07
> as *verified unfirable* on real 2026 phishing, and `confusion.ts`'s header names
> the validatable set as "CRED-01/03/06/07." Neither matches what the current
> code+corpus actually do: CRED-01 (233) and CRED-07 (142) **fire**, CRED-04 (48)
> fires, and CRED-03 does **not**. The measured validatable set today is
> **{CRED-01, CRED-04, CRED-06, CRED-07}**. This is reported as-measured; it is not
> reconciled here, and it does not change any rule's status.

---

## 3. Curve A — sweep `threshold_medium` (10–50), `threshold_high` fixed at 60

Whole corpus (n = 34,631; phishing 25,360, benign 9,271). Consecutive identical
rows are grouped; the regime boundaries are where the score distribution has mass.

| `threshold_medium` | TP | FP | Precision | Recall | F1 |
|---:|---:|---:|---:|---:|---:|
| 10 – 20 | 564 | 22 | 0.9625 | 0.0222 | 0.0435 |
| **22 – 30** | 564 | 15 | **0.9741** | **0.0222** | **0.0435** |
| 32 – 40 | 544 | 4 | 0.9927 | 0.0215 | 0.0420 |
| 42 – 44 | 261 | 4 | 0.9849 | 0.0103 | 0.0204 |
| 46 – 50 | 178 | 2 | 0.9889 | 0.0070 | 0.0139 |

Shipped **`threshold_medium = 30`** → Precision **0.9741**, Recall **0.0222**, F1 **0.0435** (TP 564, FP 15, FN 24 796, TN 9 256).

Reading: precision stays 96–99% throughout; recall is flat at its maximum (0.0222)
for every `medium ≤ 30`, then steps down (a large TP cliff between 30 and 32, and
again between 40 and 42). F1 is at its plateau maximum (0.0435) for all
`medium ∈ [10, 30]` and only declines above 30. The only thing moving `medium`
down from 30 buys is more false positives (FP 15 → 22 at `medium ≤ 20`).

---

## 4. Curve B — sweep `threshold_high` (35–90), `threshold_medium` fixed at 30

**"Flagged" (Medium-or-above) is invariant to `threshold_high`** — because
Medium-or-above means `score ≥ threshold_medium`, which does not involve
`threshold_high` at all. Across the entire high sweep it stays:
**Precision 0.9741, Recall 0.0222, F1 0.0435.** So the honest curve for
`threshold_high` is the one it actually governs: the **Block (High) tier**
(`score ≥ threshold_high`).

| `threshold_high` | Block TP | Block FP | Block Precision | Block Recall | Block F1 |
|---:|---:|---:|---:|---:|---:|
| 35 – 40 | 544 | 4 | 0.9927 | 0.0215 | 0.0420 |
| 45 | 261 | 4 | 0.9849 | 0.0103 | 0.0204 |
| **50 – 65** | 178 | 2 | **0.9889** | **0.0070** | **0.0139** |
| 70 | 50 | 0 | 1.0000 | 0.0020 | 0.0039 |
| 75 – 85 | 22 | 0 | 1.0000 | 0.0009 | 0.0017 |
| 90 | 14 | 0 | 1.0000 | 0.0006 | 0.0011 |

Shipped **`threshold_high = 60`** → Block Precision **0.9889**, Block Recall **0.0070** (178 true blocks, **2 benign false-blocks**).

---

## 5. Where the shipped values (30 / 60) sit in the tradeoff space

- **`threshold_medium = 30`** sits at the **precision-maximizing upper edge of a
  flat maximum-F1 plateau** — thresholds 22–30 are numerically identical (TP 564,
  FP 15, F1 0.0435), and 30 is the highest of them, so it keeps peak recall while
  shedding the false positives that lower thresholds admit. **Defensible and
  near-optimal for this flagged metric on this corpus — not arbitrary, not clearly
  suboptimal** — with the loud caveat that the plateau's F1 is tiny (0.0435)
  because recall is bounded by the corpus denominator (§7), not by the threshold.
- **`threshold_high = 60`** sits **inside a flat block-tier plateau** (high 50–65:
  178 true blocks, **2 benign false-blocks**, precision 0.9889). Defensible, but
  **not false-positive-free**: raising it to 70 removes the last 2 benign High-tier
  blocks and reaches precision 1.0, at the cost of dropping true blocks from 178 to
  50. So 60 is a recall-favoring choice within its plateau, carrying 2 benign
  Block-tier verdicts that a stricter value would eliminate.

---

## 6. Bootstrap confidence intervals (domain-level resampling)

Resampling unit: **`splitKey` (registrable domain), with replacement** — never
individual snapshots (the design note identifies snapshot-level resampling as the
wrong unit and a source of false precision). Each resample draws 7,601 domains with
replacement and reconstructs the sample from all snapshots of the drawn domains.

- **Effective n (distinct domains): 7,601**
- **Iterations: 2,000** (0 degenerate — every resample had at least one flagged item)
- Evaluated at the shipped thresholds (30 / 60), "flagged" = Medium-or-above.

| Metric | Point estimate | Bootstrap median | **95% CI (2.5th – 97.5th pct)** |
|---|---:|---:|---|
| **Precision** | 0.9741 | 0.9746 | **[0.9442, 0.9912]** |
| **Recall** | 0.0222 | 0.0215 | **[0.0124, 0.0344]** |

Precision is robust to which domains land in the sample (~94–99%). Recall is low
**and** wide relative to its own magnitude (1.2%–3.4%): the domain-level interval
does not narrow it, exactly as the design note warns a snapshot-level interval
would falsely do.

---

## 7. The recall figure is denominator-bounded — read it correctly

Recall here (2.2% over the whole corpus) is **not** "the detector misses ~98% of
phishing it can see." All four firing rules gate on `credentialFormPresent`. Of the
34,631 scored snapshots, only **3,914 present an extractable credential interface**
(the reachable population for these rules) and only **586 produce any non-zero
score at all**; the other ~30,700 — failed fetches, no DOM, or pages with no
credential form — are **structurally Low regardless of any threshold**, and land in
the FN column for phishing. So recall is a **floor measured over the full corpus**,
dominated by reachability, not a per-reachable-item detection rate. (Note: the
capture-time `presentsCredentialInterface` field is uniformly `false` across all
34,631 snapshots — a capture-pipeline population gap — so the reachable-population
figure of 3,914 is the engine-extracted `credentialFormPresent`, not that field.)

This is consistent with `confusion.ts` caveats 2–3 (the denominator problem and the
static-extraction recall floor) and is why the number must travel with its scope.

---

## 8. Conclusion — this is characterization, not §18.2 validation

Per RuleEngine-Spec §18.2, `Unvalidated` means "weight is a design-time hypothesis;
no benchmark evidence exists," and `Validated` requires a **held-out test-set**
measurement meeting a **false-positive budget**. This report does neither:

1. It measures on the **whole corpus** at once, with no train/validation/test
   partition and no held-out evaluation — sensitivity + uncertainty, not a
   generalization claim.
2. It exercises **4 of 11 rules** (§2); the other seven are unmeasured here.
3. It reports **no false-positive budget** decision, and changes **no** threshold
   or weight.

Therefore **every rule weight and both thresholds remain `Unvalidated`** by the
specification's own definition, and this report **must not be read as "calibration
is done."** It characterizes how the shipped values behave on today's corpus and
how uncertain those numbers are — a prerequisite for validation, not validation
itself. Moving any rule to `Provisional`/`Validated` still requires the §13.3 split
discipline (train/validation/test on the registrable-domain key), the residual-
leakage metrics (S-11), and a stated FP budget — none of which this performs.

---

### Appendix — provenance

- Script: `tools/analysis/threshold-sensitivity.ts` (checked in, reproducible).
- Pipeline: `apps/harness/extract/extract.ts` + `packages/engine/pass.ts`, the same
  path `apps/harness/metrics/confusion.ts` uses; store consulted via a throwing
  `AuthStoreReader` (S-8 enforced by crash, not assumption).
- Rule set: `rulesets/rules-v0.1.0.json` (`ruleSetVersion: rules-v0.2.0`), unchanged.
- Bootstrap RNG seeded (mulberry32, seed `0x5ec0de`) so the CI is reproducible.
