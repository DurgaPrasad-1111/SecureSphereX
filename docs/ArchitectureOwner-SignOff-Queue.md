# Architecture Owner Sign-Off Queue

A decision-ready packet for Jayanth (Architecture Owner) to rule in one sitting.
Unlike `ArchitectureOwnerReviewQueue.md` (which only *routes* — it records no
lean), this packet carries, for each open item, a **labeled implementer
recommendation**. Every recommendation is exactly that — a recommendation, not a
decision. Nothing here is signed or resolved by the implementing session; the
checklist at the end is for your signature.

**Compiled 2026-10-07** from `DECISIONS.md`, `docs/ArchitectureOwnerReviewQueue.md`
(generated 2026-10-05), and `docs/CHECKPOINTS.md`. Scope: the 12 CANDIDATE DECs,
DEC-49, and the CP-2 / CP-3 / CP-4 signature state. Each DEC's verbatim source is
its `## DEC-N` heading in `DECISIONS.md`.

**How to use:** read top-to-bottom; for each item either accept the recommendation,
pick another option, or defer. HIGH first, then MEDIUM, then LOW, matching the
review queue's functional-impact ordering.

---

## A. CANDIDATE decisions (12)

### DEC-13 — Cross-environment corpus payload access · **HIGH**
- **What it is:** DEC-1 said payload lives "on disk (and/or an external store)" but no mechanism (endpoint/bucket/mount/credential) was ever specified.
- **Ruling needed:** is cross-environment access to real payload ever required, and if so by what mechanism — or is "payload lives only on the capture machine, `INDEX.jsonl` is the portable record" the permanent shape?
- **Recommendation [not a decision]:** ratify the current reality — **`INDEX.jsonl` is the portable record; payload stays on the capture machine** — as the Phase-I permanent shape, and open a separate, later decision for an external store only if/when a second developer or corpus-dependent CI job actually materializes. Nothing today needs the mechanism; specifying one now would be speculative. (This is also the cleanest reading consistent with DEC-1 and the Part 6c capture, which writes payload locally and commits only `INDEX.jsonl`.)

### DEC-12 — Sanctioned constructors for the five branded ids · MEDIUM
- **What it is:** `AnalysisSessionId`, `TargetResourceId`, `PassResultId`, `FindingId`, `DayStamp` are branded types with no validating constructor (unlike `toOrigin()`); they enter via unchecked `as` casts.
- **Ruling needed:** give the five parse-validated constructors (all, or only those with an enforceable format), or accept `as`-cast with validation deferred to producer tests?
- **Recommendation [not a decision]:** **accept `as`-cast for now, add a constructor only for `DayStamp`** (the one with a checkable format, `YYYY-MM-DD`). The id brands have no cross-boundary external input today; a `DayStamp` guard is cheap and catches the one realistic malformed case. Revisit the rest when a producer first ingests external ids.

### DEC-15 — Stage-1 orchestration envelope (4 open fields) · MEDIUM
- **What it is:** `SecurityEvaluation<M>`'s `moduleVersion`, `indicators`, `consistency`, `summary` have no generation scheme; `assembleSecurityEvaluation` throws rather than fabricate them.
- **Ruling needed:** per-field resolution to complete the envelope (does not unblock Stage 2 by itself).
- **Recommendation [not a decision]:** adopt the DEC's own leans — **`moduleVersion` = (a) shared engine package version; `indicators` = ship `[]` as the documented placeholder; `consistency` = `indeterminate`-always (flagged explicitly as a substantive claim you are signing); `summary` = leave blocked** (no safe default — carry it as the one still-open sub-field). This completes 3 of 4 with minimal commitment and isolates the only field that genuinely needs design.

### DEC-16 — A-01 / user-trusted-origin evidence gap · MEDIUM
- **What it is:** suppression A-01 has zero guards — no evidence category represents a per-origin user-trust action; shipping it with `guards: []` would violate §6.1, so it is simply absent.
- **Ruling needed:** (a) amend the evidence contract to add the category, or (b) confirm user-trust suppression lives outside the rule-set predicate mechanism?
- **Recommendation [not a decision]:** **(b) for Phase I** — confirm A-01 is out of the rule-set mechanism and document it as a known absence; defer the evidence-contract amendment (a frozen-contract change) until a user-trust UX actually exists to feed it. Nothing measured depends on A-01 today.

### DEC-24 — B1.6 property-test coverage extension · MEDIUM
- **What it is:** B1.5's property-test exit criteria are unmet for functions that post-date the plan — `stage7-8.ts` (5 fns) and `consistency.ts` (11 fns) have no generators.
- **Ruling needed:** schedule/scope for extending property coverage (~15 properties + generators for the ten `*Findings` shapes).
- **Recommendation [not a decision]:** **schedule it as a dedicated task after the demo gate**, prioritizing `consistency.ts` (DEC-25 names it as where order-dependence could still hide). Real coverage debt, but nothing is broken; it should not block Part 6c or the demo. Pair it with DEC-25.

### DEC-25 — Output canonicalisation as a class · MEDIUM
- **What it is:** two determinism defects of one class (record-order, IEEE-754 sum) were found and fixed in one function; the systemic question — is order-independence an engine-wide designed-and-checked requirement? — is open.
- **Ruling needed:** engine-wide requirement vs case-by-case.
- **Recommendation [not a decision]:** **adopt it as an engine-wide requirement**, discharged by the DEC-24 property work (sort/accumulate sites get an order-independence property) rather than by prose. Cheapest durable guard against a recurring class; naturally bundles with DEC-24.

### DEC-33 — Tier-3 CDP selector coverage · MEDIUM
- **What it is:** DEC-30's CDP query reaches `classifyField` Tier 1+2 only; Tier-3 (name/id heuristics) is invisible, so listener detection can't fire on name/id-classified fields.
- **Ruling needed:** (a) broaden the CDP query + port Tier-3 regex into `capture.py`, or (b) keep the narrow declared-attribute selector as a Phase-I scope limit?
- **Recommendation [not a decision]:** **(b), as the DEC's own title already leans** — keep declared signals only for Phase I. Option (a) recreates the exact dual-language-heuristic drift DEFECT-34 warned against, for a capability (CRED-05 listener detection) that is not live. Accept and document the gap.

### DEC-34 — Tier-3 CDP scaffolding: iframe reach + loopback findings · MEDIUM
- **What it is:** synthetic validation of the (not-yet-wired) Tier-3 scaffolding; records that genuine OOPIF isolation only appears against real external cross-site content, not loopback rigs.
- **Ruling needed:** Architecture-Owner **acceptance** of that Phase-I scope finding (not a fork).
- **Recommendation [not a decision]:** **accept as recorded.** It is a validation finding with a clear, correct Phase-I consequence; signing it closes the acceptance. Pairs naturally with DEC-33.

### DEC-17 — S-01 guard narrowing (live rule) · LOW
- **What it is:** live suppression S-01 encodes 2 of §6.2's 3 guard conditions (drift-tolerance omitted — no ParameterId exists for it).
- **Ruling needed:** add a drift-tolerance ParameterId, or accept the two-condition narrowing as permanent?
- **Recommendation [not a decision]:** **accept the narrowing as permanent for Phase I**, documented at S-01. Adding a parameter with no threshold source is premature; the ESTABLISHED determination already subsumes drift in practice. Worth your signature precisely because S-01 is live (CRED-02 nullification, CRED-01/04 halving rely on the narrowed form).

### DEC-18 — `blockedBy` has no domain scoping (live rule) · LOW
- **What it is:** §6.3 (S-02) wants a domain-scoped negative guard ("CRED-03 not fired against the action domain"); `blockedBy` is bare `RuleId[]`, implemented as the coarser "did the rule fire at all this pass".
- **Ruling needed:** add domain scoping to `blockedBy`/`CorrelationFinding`, or accept the coarse check?
- **Recommendation [not a decision]:** **accept the coarse check for Phase I.** The one live case is single-domain, so both readings agree today; a richer shape is a frozen-contract change with no current payoff. Revisit if a pass ever has CRED-03 firing on a different domain than S-02 evaluates.

### DEC-19 — CRED-A1 single-parent choice · LOW
- **What it is:** §7.2 names CRED-A1's parent "CRED-01 **or** CRED-02"; the contract's `parent` is singular, and the rule set chose CRED-01 only.
- **Ruling needed:** widen `parent` to multiple (frozen-contract + §9.2 change), or accept single-parent?
- **Recommendation [not a decision]:** **accept single-parent as permanent for Phase I.** CRED-A1 is inert anyway (DEFECT-18 makes its predicate unsatisfiable; DEC-46 accepted it non-functional). Reopen only if DEFECT-18 is resolved and CRED-A1 becomes reachable.

### DEC-20 — `confusableSkeleton` convention enforced only by a comment · LOW
- **What it is:** `homograph.ts`'s present/absent convention for `confusableSkeleton` is not expressed in the frozen contract's name/type/comment; a naive producer emits it unconditionally (which caused real, now-fixed false positives).
- **Ruling needed:** make the convention contract-enforced for future producers, or leave as-is?
- **Recommendation [not a decision]:** **leave as-is for Phase I** (no live rule reads it post-DEC-47, so it is inert), and fold "express the convention in the contract" into the next deliberate contract-amendment batch rather than opening a frozen-contract change for a hygiene-only item now.

---

## B. DEC-49 — Part 6b pre-registered eligibility definition · CANDIDATE
- **What it is:** the frozen ELIGIBLE population for the credential-interface-scoped recall/FP measurement — `fetch.outcome ∈ {success, http_error}` **AND** engine-derived `loginInterface.credentialFormPresent === true` (explicitly not the null `presentsCredentialInterface`, DEFECT-45) — pre-registered 2026-10-05 before any number was computed, with a 564-TP whole-corpus integrity cross-check.
- **Ruling needed:** ratify the pre-registered eligibility definition (and thus `docs/Credential-Interface-Scoped-Measurement.md`'s denominator) as sound, or amend it.
- **Recommendation [not a decision]:** **ratify as written.** The definition was fixed ahead of results (the property that makes it a real pre-registration), the content-bearing-outcome rationale is sound, and the integrity check reproduced the existing 564 TPs exactly. No weight/threshold/rule changed. Signing it closes 6b's methodological record.

---

## C. Checkpoint signature state (CP-2 / CP-3 / CP-4)

### CP-2 — First metrics · recorded **NOT MET** (2026-10-05)
- **State:** recorded NOT MET per your 2026-10-05 ruling; criteria 1–3 credited MET, the gate ("test split untouched by tuning") not met because scoring the full corpus spent the split's blindness. Per CP-0/CP-2 precedent an unmet checkpoint carries **no `Signed by`**.
- **Ruling needed:** none required to stand (precedent: unmet = no signature). Only act if you want to **ratify the NOT-MET record explicitly** or revisit the verdict.
- **Recommendation [not a decision]:** **leave as recorded** — no signature needed; the record is accurate and already reflects your ruling.

### CP-3 — Extension ↔ Engine · **MET**, signed 2026-10-05
- **State:** declared MET and **signed by you** 2026-10-05; Criterion 3 (live-browser visuals) rests on your own relayed manual attestation, provenance explicit.
- **Ruling needed:** none — already signed. Flagged here only for completeness.
- **Recommendation [not a decision]:** **no action** unless you wish to re-attest the live-visual surfaces after the Part D demo-gate check below.

### CP-4 — Replay gate · **DRAFT**, unsigned (drafted 2026-10-07)
- **What it is:** the gate (G-10 green) is MET and CI-enforced; the criterion wording "golden *corpus reconstruction* replay reproduces decisions exactly" has two honest readings — satisfied under the synthetic-golden reading, not fully met under the strict §17.2 real-corpus reading (DEC-1 forbids a committed real-corpus replay; CI has no corpus).
- **Ruling needed:** decide which reading governs, and either **sign CP-4 MET** (synthetic-golden reading) or **record it NOT MET** (strict reading).
- **Recommendation [not a decision]:** **sign MET under the synthetic-golden reading, with the strict-reading scope boundary kept in the record.** G-10 genuinely reproduces a fixed decision set byte-for-byte, deterministically, on every CI run, and offers an on-demand real-snapshot determinism mode; the real-corpus reconstruction is precluded by DEC-1, not by any gap in the gate. The honest scope note already in the CP-4 entry prevents over-reading.

---

## Signature checklist (for one sitting)

| Item | Impact | Recommended ruling (not a decision) | Your ruling |
|---|---|---|---|
| DEC-13 payload access | HIGH | Ratify "INDEX is the portable record; payload stays local" (Phase I) | ☐ |
| DEC-12 brand constructors | MED | `as`-cast ok; add `DayStamp` constructor only | ☐ |
| DEC-15 Stage-1 envelope | MED | `moduleVersion`=shared ver; `indicators`=`[]`; `consistency`=indeterminate; `summary` stays open | ☐ |
| DEC-16 A-01 guards | MED | (b) out of rule-set mechanism, Phase I | ☐ |
| DEC-24 property coverage | MED | Schedule after demo; pair with DEC-25 | ☐ |
| DEC-25 canonicalisation | MED | Engine-wide requirement, discharged via DEC-24 | ☐ |
| DEC-33 Tier-3 selector | MED | (b) declared signals only, Phase I | ☐ |
| DEC-34 Tier-3 scaffolding | MED | Accept the validation finding as recorded | ☐ |
| DEC-17 S-01 narrowing | LOW | Accept two-condition narrowing (live rule) | ☐ |
| DEC-18 `blockedBy` scoping | LOW | Accept coarse check, Phase I | ☐ |
| DEC-19 CRED-A1 parent | LOW | Accept single-parent (CRED-A1 inert) | ☐ |
| DEC-20 skeleton convention | LOW | Leave as-is; fold into next contract batch | ☐ |
| DEC-49 6b eligibility | — | Ratify pre-registration as written | ☐ |
| CP-2 first metrics | — | Leave as recorded NOT MET (no signature) | ☐ |
| CP-3 ext↔engine | — | Already signed MET — no action | ☐ |
| CP-4 replay gate | — | Sign MET (synthetic-golden reading), keep scope note | ☐ |

**Nothing above is decided or signed by the implementing session.** Several
recommendations lean on the DECs' own recorded leans (DEC-15, DEC-33); the rest are
the implementer's judgment, offered for your ruling.
