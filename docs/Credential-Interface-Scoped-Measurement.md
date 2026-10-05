# Credential-Interface-Scoped Recall Measurement — SecureSphere X

**Status:** Analysis and reporting only. **Read-only.** Changes no rule, weight,
threshold, or `empiricalConfidence`. **Cross-references, does not replace,**
`docs/Calibration-Sensitivity-Report.md` (whole-corpus) — this report narrows the
denominator to the population the rules can actually reach.

**Eligibility pre-registered** in `DECISIONS.md` **DEC-49** (CANDIDATE, unsigned)
*before* any result was computed:
> ELIGIBLE ⇔ `fetch.outcome ∈ {success, http_error}` **AND**
> `loginInterface.credentialFormPresent === true` (engine-derived via
> `extractEvidence`, **not** the uniformly-null `presentsCredentialInterface` —
> DEFECT-45).

Reproduce: `SSX_CORPUS_STORE=corpus node --experimental-strip-types tools/analysis/credential-scoped-measurement.ts`.
Run of record: **2026-10-05**, corpus 34,631 (unchanged).

**Numerator integrity check — PASSED.** The whole-corpus true-positive count at the
30 threshold is **564**, exactly matching the Calibration report. The script aborts
if this differs; it did not. Every one of those 564 TP falls inside the eligible
population (eligible-phishing detected@30 = 564), so the scoped measurement and the
whole-corpus figure share the same numerator.

---

## The cascade (whole corpus → content-bearing → eligible → detected)

| Stage | total | phishing | benign | domains |
|---|---:|---:|---:|---:|
| Whole corpus | 34,631 | 25,360 | 9,271 | 7,601 |
| Content-bearing (`success`/`http_error`) | 25,596 | 20,531 | 5,065 | 4,580 |
| **Eligible** (content-bearing ∧ credentialFormPresent) | **3,914** | **3,658** | **256** | **500** |
| Eligible detected ≥ 30 (Medium+) | 579 | 564 | 15 | 60 |
| Eligible detected ≥ 60 (High) | 180 | 178 | 2 | 12 |

Reading the funnel: 26% of the corpus (9,035 snapshots) are capture artifacts
(dns/timeout/nav/tls/redirect/empty) excluded as not content-bearing; of the 25,596
content-bearing, only **3,914 (15.3%)** present an extractable credential interface —
the reachable population for the four firing rules, all of which gate on
`credentialFormPresent`.

---

## Recall and false-positive rate on the ELIGIBLE population (threshold 30)

Domain-level bootstrap CIs (resample `splitKey` over the 500 eligible domains, 2,000
iterations):

| Metric | Point | 95% CI (domain bootstrap) | Count |
|---|---:|---|---|
| **Recall** (eligible phishing flagged) | **0.1542** | **[0.0942, 0.2172]** | 564 / 3,658 |
| **False-positive rate** (eligible benign flagged) | **0.0586** | **[0.0242, 0.1045]** | 15 / 256 |

**Stated plainly, no hedging: scoped recall is still low — about 15%.** Restricting
to exactly the population the rules are built to reach (a real page, with a credential
interface), the engine flags only ~1 in 6.5 eligible phishing pages. That is better
than the whole-corpus 2.2% (which is dominated by unreachable snapshots), but it is
not a high number, and the confidence interval (9.4%–21.7%) is wide because the
eligible set collapses to just **500 distinct domains**.

The eligible-benign false-positive rate is **5.9%** (15 of 256) — but on only 256
eligible benign snapshots / a small domain base, so the CI is wide [2.4%, 10.5%]. The
15 benign flags are the CRED-01/07 cross-domain-form false positives characterized in
DEFECT-46.

---

## Why the other ~85% of eligible phishing is missed — ranked by cause

Of the **3,094** undetected eligible-phishing snapshots:

| Cause | count | share |
|---|---:|---:|
| **No rule fired at all (score = 0)** | **3,094** | **100%** |
| Fired but below the 30 threshold (0 < score < 30) | 0 | 0% |

**This is the single most important finding of the scoped measurement, and it is
unambiguous: every miss scored exactly zero.** Not one undetected eligible-phishing
page fired any rule and fell short on score — so the recall ceiling is **not a
threshold-calibration problem**. Lowering the Medium threshold from 30 would recover
**zero** additional eligible phishing. The ~85% miss rate is a **structural-coverage**
limit: these pages have a credential interface but exhibit none of the four structural
signatures the firing rules detect — an off-origin form action (CRED-01/07),
cleartext/http transport (CRED-06), field concealment + off-site post (CRED-07), or a
multi-hop cross-site redirect to the form (CRED-04). Contemporary kits that post
same-origin (or exfiltrate by script — CRED-05, non-functional) are invisible to this
rule set regardless of threshold.

For contrast, the rules that *did* fire on detected eligible phishing (by snapshot):
CRED-06 ×333, CRED-01 ×233, CRED-07 ×142, CRED-04 ×48.

---

## Conclusion — still not §18.2 validation; nothing changed

This measurement makes the recall number **honest about its denominator** (eligible,
reachable pages) rather than diluted by unreachable snapshots, and it localizes the
recall ceiling to **structural rule coverage, not threshold calibration**. It remains:
scored on the whole (now-observed) corpus with no held-out split, with no
pre-registered false-positive budget, over the 4 rules that fire. It is **not** §18.2
validation, it changes no weight or threshold, and **every rule's `empiricalConfidence`
remains `Unvalidated`.** The honest headline a reader should carry away: *on the pages
it can reach, this rule set catches roughly 15% of phishing, and the gap is coverage
(missing threat patterns), not a mis-set threshold.*

### Appendix — provenance
- Script: `tools/analysis/credential-scoped-measurement.ts` (checked in, reproducible, eslint-clean; seeded bootstrap).
- Pipeline: `apps/harness/extract/extract.ts` + `packages/engine/pass.ts`; S-8 store enforced by a throwing reader.
- Eligibility frozen in DEC-49 before computation; numerator cross-checked against the Calibration report's 564 TP (passed).
- Rule set `rulesets/rules-v0.1.0.json` (`ruleSetVersion: rules-v0.2.0`), unchanged.
