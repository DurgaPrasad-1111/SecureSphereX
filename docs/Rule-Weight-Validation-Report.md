# Rule-Weight Validation Report — SecureSphere X

**Status:** Analysis and reporting only. **Read-only.** No rule, weight, threshold,
or `empiricalConfidence` value was changed by this work.

**What this is:** statistical evidence about the *relative* importance of the rules
that actually fire on the shipped corpus — per-rule precision with domain-level
confidence intervals, and a data-driven (ridge logistic) check of relative
importance against the hand-picked `baseWeight`s.

**What this is NOT:** §18.2 validation. No held-out test set, no pre-registered
acceptable false-positive rate, and it can only fit the two rules with enough
distinct firing domains. See §Conclusion. Every rule remains **Unvalidated**.

Reproduce: `SSX_CORPUS_STORE=corpus node --experimental-strip-types tools/analysis/rule-weight-validation.ts`
(prints the JSON these numbers are transcribed from; scores the corpus once and
caches to `tools/analysis/.rule-scores.jsonl`). Run of record: **2026-09-25**.

---

## Step 0 — ground truth, re-confirmed (not reused blind)

Re-scored the whole corpus through the real pipeline this run (2026-09-25):

| Quantity | This run (2026-09-25) | Sept-6 calibration report | Change |
|---|---:|---:|---|
| Snapshots scored (0 errors) | **34,631** | 34,631 | none |
| Phishing / benign | **25,360 / 9,271** | 25,360 / 9,271 | none |
| Distinct splitKeys (scored) | **7,601** | 7,601 | none |

**Firing counts per rule (snapshot level, phishing / benign, + distinct domains):**

| Rule | phishing | benign | effective-n (distinct domains) |
|---|---:|---:|---:|
| CRED-01 | 233 | 4 | 23 |
| CRED-04 | 48 | 11 | 13 |
| CRED-06 | 333 | 0 | 29 |
| CRED-07 | 142 | 9 | 14 |

**No change since the last calibration report / DEC-28 supersession.** The corpus,
the ruleset (`rules-v0.2.0`), and the firing set are all identical. The four firing
rules are still **CRED-01, CRED-04, CRED-06, CRED-07**; the other seven never fire
(CRED-02 store-blocked under S-8; CRED-03/05/A1, DL-01/02, PM-01 unreached — as in
the calibration report). The headline to keep in view: those 48–333 firings collapse
to just **13–29 independent registrable domains** each.

---

## Step 1 — per-rule precision with domain-level bootstrap CI

Precision = fired-on-phishing / fired-total (snapshot level). 95% CI from a
**domain-level bootstrap** (resample `splitKey`, 2,000 iterations) — the same
methodology as the calibration report, because snapshot-level resampling would let
kit duplication falsely narrow the interval.

| Rule | fired (phish/total) | Precision | 95% CI (domain bootstrap) | effective-n domains |
|---|---:|---:|---|---:|
| **CRED-01** | 233 / 237 | **0.983** | **[0.929, 1.000]** | 23 |
| **CRED-04** | 48 / 59 | **0.814** | **[0.222, 0.954]** | 13 |
| **CRED-06** | 333 / 333 | **1.000** | **[1.000, 1.000]** | 29 |
| **CRED-07** | 142 / 151 | **0.940** | **[0.571, 0.987]** | 14 |

(0 degenerate bootstrap iterations for any rule.)

Reading these honestly:
- **The CIs are wide, and that is the point.** CRED-04's precision could be anywhere
  from **22%** to **95%**; CRED-07's from **57%** to **99%**. The snapshot counts
  (48, 142) look reassuring, but with only **13–14 independent domains** the
  domain-level interval is nearly uninformative — a single kit landing in or out of
  a resample swings the number. A snapshot-level interval would have hidden this.
- **CRED-01** is the most stable of the four (23 domains): precision **0.983**, CI
  lower bound **0.929**.
- **CRED-06 = 1.000, CI [1.000, 1.000]** is a *separation artifact*, not certainty.
  CRED-06 never fired on a benign snapshot, and it fired on **0 benign domains**, so
  every domain resample can only draw phishing-CRED-06 domains → the interval
  collapses to a point. It bounds the *observed* benign-firing rate at 0 (a
  rule-of-three upper bound over 5,740 benign domains is ≈ **0.05%**), but it does
  **not** prove the true false-positive rate is zero. CRED-06 = "Cleartext credential
  collection" (http login pages), and this corpus's benign side is overwhelmingly
  https — so its perfect separation is partly a corpus property, exactly the
  "residue of what's measurable" trap DEC-28 flagged.

---

## Step 2 — data-driven relative-importance check (ridge logistic regression)

**Fit threshold (stated + justified):** a rule is included as a predictor only if it
fired on **≥ 20 distinct domains** (`MIN_DOMAINS_FOR_FIT = 20`). Rationale: the fit
is on one row per domain, so a coefficient is estimated from the number of *domains*
carrying the predictor, not snapshots; below ~20 domains a single kit dominates and
the estimate is not stable. This **excludes CRED-04 (13 domains) and CRED-07 (14)**
and fits only **CRED-01 (23) and CRED-06 (29)**. Even these two are thin — read the
magnitudes as indicative, not precise.

**Design:** one row per registrable domain (7,601 rows: **1,861 phishing, 5,740
benign**; label = majority of the domain's snapshots, ties→phishing; **14** domains
had both labels). Feature = "did this domain ever fire rule X." L2 (ridge) logistic
regression, `λ = 2.0`, penalty on coefficients only (not the intercept). λ is a mild
ridge chosen to keep a perfectly-separating rule's coefficient finite; separated-rule
magnitudes are λ-dependent and flagged below.

### Risk 1 — domain-level non-independence: handled

Fitted on **one row per domain** (dedup by `splitKey`, aggregate "ever fired"
indicator), not one row per snapshot, so a heavily-duplicated kit contributes a
single row rather than dozens. This is the same reason the Step-1 CIs are domain-level.

### Risk 2 — quasi-complete separation: present in CRED-06, flagged

Per-predictor domain purity (share of firing domains that are phishing):

| Rule | domains fired | phishing | benign | domain purity |
|---|---:|---:|---:|---:|
| CRED-01 | 23 | 20 | 3 | 0.870 |
| CRED-06 | 29 | 29 | 0 | **1.000 (perfect separation)** |

**CRED-06 perfectly separates at the domain level (0 benign domains).** With ridge
(λ=2) its coefficient stays finite (2.55, below the |6| boundary flag, so
`boundaryUnstable=false`), and the fit **converged cleanly** (5 iterations,
maxΔ ≈ 1.4e-10; 0 of 2,000 bootstrap refits failed to converge). But the *magnitude*
is regularization-dependent — with a smaller λ it would grow without bound — so
CRED-06's coefficient should be read as "strongly positive, magnitude not precise,"
not as a stable point value.

### Risk 3 — multicollinearity: low

Pairwise indicator correlation across the 7,601 domain rows:

| | CRED-01 | CRED-06 |
|---|---:|---:|
| **CRED-01** | 1.000 | 0.152 |
| **CRED-06** | 0.152 | 1.000 |

Only **4 domains** fire both CRED-01 and CRED-06. Correlation **0.152** is low, so
the two coefficients are individually interpretable (no collinearity inflation).

### Fitted coefficients (log-odds) with domain-level bootstrap CIs

Intercept **−1.144** (CI [−1.202, −1.091]) → a domain firing neither predictor has
≈ **24%** modeled phishing probability, matching the 24.5% base rate (1,861/7,601).

| Rule | coefficient (log-odds) | 95% CI (domain bootstrap, 2,000×) | separation |
|---|---:|---|---|
| **CRED-01** | **1.808** | **[1.199, 2.289]** | purity 0.87 |
| **CRED-06** | **2.546** | **[2.166, 2.824]** | purity 1.00 (regularization-dependent) |

Both coefficients are positive and their CIs exclude 0 → both are real positive
predictors of a domain being phishing, on this corpus.

### Relative-ranking comparison — different scales, agreement only

Logistic coefficients are **log-odds**; `baseWeight` is a **point value in an
additive threshold model** — different model families, not the same unit. Normalizing
each to a share (fitted: |coef| / Σ|coef|; shipped: baseWeight / Σ baseWeight), over
the two fittable rules only:

| Rule | shipped baseWeight | shipped share | fitted share |
|---|---:|---:|---:|
| CRED-01 | 45 | 0.529 | 0.415 |
| CRED-06 | 40 | 0.471 | 0.585 |

- **Ordering:** shipped ranks **CRED-01 > CRED-06**; the data ranks **CRED-06 >
  CRED-01**. So the hand-picked and data-driven relative orderings **mildly
  disagree** for this pair.
- **But the disagreement is weak evidence, not a signal to reweight.** The gap is
  small (0.53/0.47 vs 0.58/0.42), and CRED-06's fitted share is *inflated by its
  perfect separation* (its magnitude is λ-dependent). Loosen the ridge and CRED-06
  climbs further; tighten it and the two converge. So "CRED-06 looks more important
  than its weight suggests" is exactly what a corpus whose benign side is all-https
  would produce for an http-detection rule — the DEC-28 caution against reading
  CRED-06's dominance as real applies directly.
- This comparison covers **2 of 11 rules**. It says nothing about the relative
  importance of the other nine, including the three highest-weighted primaries
  (CRED-02/03/05) that never fire on this corpus.

---

## Conclusion — statistical evidence, NOT §18.2 validation

Per RuleEngine-Spec §18.2, `Unvalidated` means "weight is a design-time hypothesis;
no benchmark evidence exists," and `Validated` requires a **held-out test-set**
measurement meeting a **false-positive budget**. This analysis is neither:

1. It fits and evaluates on the **whole corpus at once** — no train/validation/test
   partition, no held-out evaluation.
2. It declares **no acceptable false-positive rate** and changes no weight.
3. It can fit only **2 of 11 rules** (CRED-01, CRED-06); two more fire but on too few
   domains to fit (CRED-04, CRED-07), and seven never fire at all. The relative-
   importance finding is therefore a statement about **two rules on this corpus**,
   heavily qualified by CRED-06's separation.

What it does establish, honestly: on the available corpus, CRED-01 and CRED-06 are
both real positive predictors of phishing at the domain level; per-rule precision is
high for CRED-01/06 but its confidence interval is **wide-to-uninformative for
CRED-04 and CRED-07** once kit duplication is accounted for domain-side; and the
data-driven relative ordering of the two fittable rules **mildly disagrees** with the
shipped weights, on weak (separation-confounded) evidence.

**Therefore every rule's `empiricalConfidence` remains `Unvalidated`.** This report
must not be read as "calibration is done" or as "here are corrected weights to ship."
Moving any rule off `Unvalidated` still requires the §13.3 split discipline
(train/validation/test on the registrable-domain key), a stated false-positive
budget, and enough firings per rule to estimate — none of which this performs.

---

### Appendix — provenance

- Script: `tools/analysis/rule-weight-validation.ts` (checked in, reproducible, eslint-clean).
- Pipeline: `apps/harness/extract/extract.ts` + `packages/engine/pass.ts` (same path
  `confusion.ts` / `threshold-sensitivity.ts` use); the AuthStore is consulted via a
  throwing `AuthStoreReader` (S-8 enforced by crash, not assumption).
- Ridge logistic regression is a self-contained penalized-IRLS implementation (no
  numpy/sklearn available in this environment); bootstraps use a seeded RNG
  (mulberry32) so the CIs are reproducible. λ=2.0, 2,000 bootstrap iterations.
- Rule set: `rulesets/rules-v0.1.0.json` (`ruleSetVersion: rules-v0.2.0`), unchanged.
