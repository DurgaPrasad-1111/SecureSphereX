# Fingerprint similarity design note (R-2)

One page. Fixes a **function**, not a threshold — tau_sim and per-feature
weights are empirically tunable by design (§13.2) and are deliberately left
as parameters here, not values. This note does not describe the
Authentication History Store; that is §20 and is already specified.

**Anchor.** Sourced from `spec/SecureSphereX-RuleEngine-Spec-v0_8.md` §7.2,
inside the CRED-02 entry (not §20) — line 453, "Fingerprint composition":

> "Feature classes SHALL be chosen for stability under redesign and
> difficulty of variation under impersonation — input field composition and
> ordering, credential field presence and type, page title tokens, favicon
> hash, perceptual hash of the dominant above-the-fold image, dominant
> colour palette. Raw DOM structure SHALL NOT be used; it is too brittle.
> Similarity SHALL be scored and thresholded, never required to match
> exactly."

Also drawn from §13.2 (lines 787–805), §20.6 G-03 (lines 1189–1192), and
§20.11 (lines 1241–1281).

## 1. Feature vector — all six named classes, v1

All six classes §7.2 names are included in v1. None is excluded: each is
named specifically for stability-under-redesign and difficulty-of-variation
properties, and no principled reason to drop one emerged from the sections
read for this note.

| Feature | Extraction | Normalisation |
|---|---|---|
| Field composition & ordering | `LoginFormObservation.fields[].kind`, in document order | Ordered token sequence over `CredentialFieldKind` |
| Credential field presence & type | Same source, as a set | Multiset of `CredentialFieldKind` counts (order discarded — this is the complement of the row above, which is why both are named as separate classes) |
| Page title tokens | `document.title` | Lowercased, split on non-alphanumeric, stopwords removed, deduplicated → token set |
| Favicon hash | Favicon image bytes | Cryptographic hash (exact-match feature — a favicon is either the same asset or it isn't; no perceptual tolerance) |
| Hero-image perceptual hash | Dominant above-the-fold image | Perceptual hash (pHash), fixed bit length |
| Dominant colour palette | Above-the-fold region | Top-*k* quantized colours (k fixed, a v1 constant — not empirically tunable per §13.2's list, which names weighting and thresholds but not *k*), in a perceptual colour space |

## 2. Comparison function — `fingerprintSimilarity`

Per-feature similarity functions, each producing a score in **[0, 1]**:

| Feature | Per-feature `sim_i` |
|---|---|
| Field composition & ordering | 1 − normalised edit distance between the two token sequences |
| Field presence & type | Jaccard index over the two kind-multisets |
| Title tokens | Jaccard index over the two token sets |
| Favicon hash | 1 if hashes match exactly, else 0 |
| Hero-image pHash | 1 − (Hamming distance ⁄ hash bit length) |
| Dominant colour palette | 1 − (mean nearest-neighbour colour distance ⁄ max distance in the colour space), palette entries matched by nearest neighbour |

**`fingerprintSimilarity(fpA, fpB) = Σᵢ wᵢ · simᵢ(fpA, fpB) / Σᵢ wᵢ`**

A weighted average over the six `simᵢ` above. Because every `simᵢ ∈ [0,1]`
and every `wᵢ ≥ 0`, the result is in `[0,1]` by construction regardless of
the weight values chosen later. **The six weights `wᵢ` are parameters, not
constants** (§13.2, "Fingerprint feature weighting") — this note fixes that
there are six of them and what they multiply, not what values they hold.

## 3. What the score means, and what tau_sim is tuned on

- **1.0** — identical on every measured feature. In practice: the same page
  revisited, or a byte-for-byte clone.
- **0.0** — no similarity on any feature. Unrelated pages.
- **tau_sim** is the threshold in CRED-02's own predicate (§7.2, line 447):
  "AuthContext Evaluation reports a best-match established fingerprint at
  origin `d` with similarity ≥ tau_sim." It is tuned to separate a genuine
  impersonation match from coincidental similarity (e.g., two sites built on
  the same white-label template — named explicitly in §7.2 as an expected
  false-positive risk), under the §13.3 validation protocol: train/validation
  tuning only, a false-positive budget fixed before tuning begins, reported
  against a held-out test split.

**Left unsettled by the sections this note draws from:** §13.2 lists "τ_sim
and drift tolerance" and "fingerprint collision threshold for guard G-03"
(§20.6) as two *separate* tunable parameters, and G-03 (line 1189) performs
its own fingerprint comparison — "the candidate fingerprint SHALL be
compared against `ESTABLISHED` entries at other origins" at write time,
versus CRED-02's read-time comparison at evaluation. Neither §7.2, §13.2,
nor §20.6 states whether G-03 reuses `fingerprintSimilarity` above with a
different threshold, or requires its own comparison function. This note
does not decide that — it is a DEC, not a note, and is flagged here rather
than answered.

## 4. Fingerprint algorithm version field

Per §20.11 (lines 1269–1273), on the frozen list — quoted, not restated
loosely:

> "Stored fingerprints carry the algorithm version under which they were
> produced (§20.3, D0.1)... The ACEM SHALL compare a page fingerprint only
> against stored revisions produced under the same algorithm version. Where
> an entry holds no revision at the current version, the ACEM SHALL report
> `unevaluable(fingerprint_version_mismatch)`. It SHALL NOT report absence of
> a match."

Consequence for this note's function: `fingerprintSimilarity` is only ever
invoked between two fingerprints carrying the **same** algorithm version
field. A version mismatch is not a `sim = 0` case — it never reaches the
comparison function at all; the ACEM short-circuits to
`unevaluable(fingerprint_version_mismatch)` before calling it.
