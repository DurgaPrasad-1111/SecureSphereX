# Design Note — Unit of Independence for Benchmark Corpus Splits

**Status:** For architectural review. No specification change proposed until reviewed.
**Affects:** D0.5 Snapshot Format §3 (`SplitAssignment`), Specification v0.7 §13.3
**Prepared for:** decision on whether to amend the frozen derivation

---

## 1. The question

D0.5 §3 derives the train/validation/test split from a stable hash of `snapshotId`, which is itself `hash(url | capture_date | attempt)`. Execution testing confirmed the distribution is correct and deterministic, and also confirmed that **the same URL captured on two dates receives two different splits**.

The question is not whether that is a defect — it is whether `snapshotId` is the right *unit of independence*, and if not, what is.

**Why this matters.** A held-out test set measures generalization only if its members are independent of the tuning data. Where a test item is a near-duplicate of a training item, the measured false-positive rate and recall describe memorization rather than detection, and §13.3's entire split discipline becomes ceremonial.

---

## 2. Duplication mechanisms actually present in a phishing corpus

Leakage is not one phenomenon. Five distinct mechanisms produce related items, and they are not equally addressed by any single splitting key.

| # | Mechanism | Frequency in practice |
|---|---|---|
| **M1** | Same URL recaptured across polling cycles or feed re-reports | Very high — a URL alive six hours yields ~12 snapshots at 30-minute polling |
| **M2** | Same domain, different paths (`/login`, `/verify`, `/secure`) | High |
| **M3** | **Same phishing kit deployed across many domains** — often byte-identical pages | **Very high; the dominant mode** |
| **M4** | Same brand impersonated by different kits | Moderate |
| **M5** | Benign: same site captured multiple times, or multiple pages of one site | Moderate |

M3 deserves emphasis. Phishing is overwhelmingly kit-driven: one kit is mass-deployed across hundreds of throwaway domains within a campaign. Two snapshots from different registrable domains are frequently *the same page*.

---

## 3. Candidate units of independence

| Unit | M1 | M2 | M3 | M4 | M5 | Assignable at capture? |
|---|---|---|---|---|---|---|
| **A. Snapshot** (current) | ✗ | ✗ | ✗ | ✗ | ✗ | Yes |
| **B. Full URL** | ✓ | ✗ | ✗ | ✗ | partial | Yes |
| **C. Registrable domain** | ✓ | ✓ | ✗ | ✗ | ✓ | Yes |
| **D. Content cluster** (DOM/structural similarity) | ✓ | ✓ | ✓ | partial | ✓ | **No** |
| **E. Temporal holdout** | partial | partial | partial | partial | partial | Yes |
| **F. Impersonated brand** | ✓ | ✓ | partial | ✓ | n/a | Yes, where feed supplies it |

### A — Snapshot *(current)*
Fails every mechanism including M1, the most frequent. Under 30-minute polling essentially every live URL straddles splits. **Not defensible.**

### B — Full URL
Fixes M1 cheaply. Leaves M2 and M3 entirely. A modest improvement that does not address the dominant mode.

### C — Registrable domain
Fixes M1, M2, M5. Cheap, deterministic, assignable at capture, and preserves D0.5 S-2 immutability. Its limitation is decisive: **it does not address M3 at all**, and M3 is the largest source of near-duplication in phishing corpora.

### D — Content cluster
Directly targets the actual leakage mechanism: cluster snapshots by DOM or structural similarity, then assign whole clusters to splits.

Two hard problems:
- **Cannot be assigned at capture time.** Clustering requires the corpus to exist. This conflicts with D0.5 S-2's immutability-at-capture guarantee, which is the property that makes re-splitting *impossible* rather than merely discouraged. Trading that away reintroduces exactly the failure mode S-2 was written to prevent.
- **The clustering threshold is itself a tunable parameter**, and tuning it against the corpus is a second-order form of the same problem.

### E — Temporal holdout
Train on an earlier period, test on a later one. This is the only option that reflects what the product actually faces: a threat landscape that evolves after deployment.

It does not cleanly prevent M1–M3 — a kit spanning the boundary appears on both sides — but it measures something the random splits cannot, and it is the more honest generalization claim. It is a *complement*, not a replacement.

### F — Impersonated brand
Relevant specifically to CRED-02. The validation protocol seeds the Authentication History Store from benign login pages and tests phishing pages targeting those brands. If τ_sim is tuned against train-split pages targeting the same brands as test-split pages, the tuning is partly brand-specific.

Note the counter-argument: **treating M4 as leakage would be over-correction.** Detecting a novel kit impersonating a familiar brand is precisely the generalization we want to measure, not contamination.

---

## 4. A consideration specific to this system

Leakage consequence scales with model capacity. This is not a learned model — it is **eleven weights, two thresholds, and roughly five auxiliary parameters**, all hand-tunable and human-interpretable. Capacity to memorize kit-specific quirks is low, and the realistic overfitting surface is correspondingly small.

That does not make leakage acceptable, and it does not excuse option A. It does mean the marginal benefit of the most expensive option (D) over a sound cheap one (C) is smaller here than it would be for a neural classifier — and that the cost of surrendering S-2's immutability is comparatively larger.

---

## 5. Recommendation

**Primary: adopt C (registrable domain) as the split key, and report residual leakage rather than engineering it away.**

Rationale:
- Fixes M1, M2, M5 — the mechanisms an assignable-at-capture key *can* fix.
- Preserves D0.5 S-2 immutability, and with it the property that a re-split cannot occur even by accident.
- Requires only a change to §3's derivation and an `assignmentFunctionVersion` increment — the contract already anticipates this.

**Complement 1: report M3 rather than splitting on it.** After extraction, compute `domContentHash` and structural-fingerprint clusters, and publish a **cross-split duplication rate**: the proportion of test-split snapshots having a near-duplicate in train. This is a reported metric, not a splitting input, so S-2 survives. It also makes the residual leakage visible to an examiner rather than hidden — which is the stronger academic position.

**Complement 2: add a temporal holdout as a secondary evaluation.** Reserve the most recent capture window, excluded from all tuning, and report metrics on it separately. This measures generalization to *future* phishing, which is the claim the product actually makes.

**Complement 3: report CRED-02 brand overlap.** Publish the proportion of test-split phishing snapshots whose `impersonatedBrand` also appears in the train split. Report it; do not split on it, for the over-correction reason in §3F.

---

## 6. Cost if adopted

**Statistical power falls.** Splitting on domain reduces effective independent units from *snapshots* to *domains*. A corpus of 5,000 phishing snapshots across 800 domains has an effective n of 800 for splitting purposes, so a 20% test split holds ~160 independent units, not ~1,000. Confidence intervals widen accordingly, and **they must be reported** — a false-positive rate quoted without an interval on this corpus size would be misleading.

**Split proportions become less exact.** Domains carry unequal snapshot counts, so a 60/20/20 domain split will not yield 60/20/20 snapshots. Both distributions should be reported.

**Benign side is largely unaffected.** Tranco is a domain list, so domain-keyed splitting is natural there.

---

## 7. Decision required

1. Adopt C as the split key, amending D0.5 §3 derivation from `snapshotId` to registrable domain, with `assignmentFunctionVersion` incremented?
2. Adopt complements 1–3 as **reported metrics** in §13.3, not as splitting inputs?
3. Confirm that snapshots already captured under the current derivation are **re-assigned once** under the new function before any tuning begins — permissible only because no tuning has yet occurred, and impermissible thereafter.

Item 3 is time-sensitive. Re-assignment is clean today and becomes a methodological breach the moment the first weight is tuned.
