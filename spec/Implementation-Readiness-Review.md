# SecureSphere X — Implementation Readiness Review

**Baseline:** Specification v0.8 · contracts D0.1–D0.5, D0.8–D0.10 · Implementation Ownership Plan
**Verification method:** the frozen contracts were compiled under the exact strict settings CI gate G-1 will enforce, and representative rule predicates were authored against D0.3. Findings below are compiler output, not inspection.

---

## 1. Go / No-Go Decision

**Two hard blockers were found by compilation. Both are now fixed and verified.** Neither blocked Varun's scaffold or Durga's capture chain, so day-1 work was never at risk.

### HB-1 — D0.3 could not express three of the eleven rules *(FIXED)*

`FindingPath` was `${ModuleId}.${string}`, and the `exists` quantifier had no way to reference the item it bound. A comment claimed `$` binds the item; the type system provided no such construct.

Consequence: **CRED-01, CRED-05, and CRED-07 were inexpressible.** All three quantify over a collection and compare a bound item's field against a module finding. Durga could not author the rule set; Jayanth could not implement the predicate evaluator.

Fix — `ItemPath` (`'$' | '$.field'`) and `ValuePath = FindingPath | ItemPath`, accepted in operand positions; static check **V-13** confines `ItemPath` to an `exists.where` subtree. Rule-set format → **v1.1.0**.

Verified by authoring CRED-01 (object collection), CRED-05 (scalar collection, bare `$`), CRED-07 (disjunction inside quantifier), CRED-04 (parameterised comparison) and DL-01 (cross-pass operator). All compile.

*No rule semantics changed.* Predicates, weights, tiers, parents unchanged; `rules-v0.1` unchanged. The format gained the expressiveness the rules already required.

### HB-2 — Contracts failed strict typecheck *(FIXED)*

`evaluation.contract.v1.ts` imported `Observation` and `NotCollectedReason` unused. Under `noUnusedLocals` — which G-1 enforces — this is an error. **CI would have been red on the first commit.**

Full contract set now compiles clean: **0 errors** under `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `verbatimModuleSyntax`.

### Recommended before first commit — not blocking

| # | Item | Why now | Owner |
|---|---|---|---|
| R-1 | Decide corpus storage: Git-LFS vs external object store | Affects repo initialisation; migrating after commits is painful and rewrites history | Varun + Durga |
| R-2 | Fingerprint similarity design note | §13.2 makes feature weighting empirical by design, but Varun cannot implement the ACEM without choosing a function. One page, before A1.5 | Varun |
| R-3 | ECE module document addenda for modules 8, 9, 10 | The register is incomplete as a document; code is unaffected | Jayanth |

### Future work — explicitly not blocking

| # | Item | Blocks |
|---|---|---|
| F-1 | **GAP-3** — three SUPERSEDED pages in the Persistence spec (§12–15 incl. Canonical Identity Model, §30–35, §41–42/ADR-001) | Stage 7 persistence. Nothing sooner. |
| F-2 | Golden corpus construction | CP-4 / G-10 replay gate |
| F-3 | Composite findings, adaptive weighting, JS-xx family | Deferred by §21 |

---

## 2. Implementation Readiness Review

| Area | Status | Note |
|---|---|---|
| Specification v0.8 | **Ready** | Eight amendments, each traceable to a named gap |
| D0.1 Evidence | **Ready** | Compiles; tri-state and capability manifest present |
| D0.2 Evaluation | **Ready** | Fixed under HB-2; ten modules, closed union |
| D0.3 Rule-set | **Ready at v1.1.0** | Fixed under HB-1 |
| D0.4 Pass Result | **Ready** | P-1…P-14 stated testably |
| D0.5 Snapshot v1.1.0 | **Ready** | split-v2 amendment applied |
| D0.8/9/10 Boundary | **Ready** | Feedback path present; B-10/B-11 stated |
| Dependency matrix | **Ready** | Encoded in `.dependency-cruiser.cjs` |
| CI gates G-1…G-7 | **Ready** | G-2/G-3/G-6 executed against deliberate violations |
| Ownership plan | **Ready** | Signed off with the Durga-load trigger recorded |
| Rule-set file | **Absent — expected** | C0.5; unblocked by the HB-1 fix |

Nothing essential is missing beyond R-1 and R-2.

---

## 3. Immediate Coding Tasks

### Varun — Role A

| # | Task | Depends on | Deliverable | Exit criteria |
|---|---|---|---|---|
| **1** | Monorepo scaffold; `packages/contracts` populated with the six frozen contract files | — | Buildable repo | `npx tsc --noEmit` returns 0 errors under strict + `noUnusedLocals` |
| **2** | Fixtures: clean login · off-origin post · no credential form · SSO flow | 1 | `fixtures/*.json` | Parse, typecheck, round-trip identically |
| **3** | CI gates G-1, G-4, G-7 + the deliberate-violation job | 1 | `.github/workflows/ci.yml` | Green; violation job proves gates fire |
| **4** | Capability spike, ten pages | — *(parallel)* | `ProducerCapabilityManifest` | Committed reflecting **observed** results |

Tasks 1–2 are **timeboxed to two days**. Minimal scaffold; refinement is later work.

### Jayanth — Role B

| # | Task | Depends on | Deliverable | Exit criteria |
|---|---|---|---|---|
| **1** | Approve contract fixes HB-1 and HB-2 as Architecture Owner | — | Sign-off recorded | D0.3 tagged v1.1.0 |
| **2** | Integrate architectural gates G-2, G-3, G-6 | Varun 1 | `tools/ci/architectural-gates.mjs` | Green; violation job proves they fire |
| **3** | Pipeline core design note | — | Internal note | Stage boundaries agreed with A and C |
| **4** | Predicate evaluator: the twelve operators | Varun 1, HB-1 | `packages/engine/src/predicate/` | Evaluates the five probe predicates correctly |
| **5** | Adjudicate spike findings | Varun 4 | Capability classifications | Recorded in D0.1 manifest |

### Durga Prasad — Role C

| # | Task | Depends on | Deliverable | Exit criteria |
|---|---|---|---|---|
| **1** | `load_feed_urls()` for PhishTank + OpenPhish | — | Feed client | Returns url, feed id, verified flag, report date, **target brand** |
| **2** | Capture on 30-minute poll | 1 | Running pipeline | ≥48h positives accumulated |
| **3** | Tranco negatives, top 10k | — | Benign corpus | Captured |
| **4** | `--report` outcome distribution | 2 | Distribution report | Success-rate gap by label reported |
| **5** | Draft `rules-v0.1.0.json` | Varun 1, HB-1 | Rule-set file | Eleven rules, three suppressions, three refinement sets, eleven parameters; submitted to Jayanth |
| **6** | Split migration dry-run | 2 | Migration audit | S-2a passes; reassignment stats reviewed |

---

## 4. Parallel Execution Plan

### Fully independent — start now, no dependencies

- **Durga 1–4** — the entire capture chain. Depends on nothing in the repository.
- **Varun 4** — capability spike. Needs only a temporary unpacked extension.
- **Jayanth 1, 3** — sign-off and design note.

### Single hard blocker

**Varun task 1 (scaffold).** Gates Jayanth's engine work, Durga's rule-set authoring, and all module implementation. Everything else in the graph is parallel.

### Blocked, briefly

- Jayanth 2, 4 ← Varun 1
- Durga 5 ← Varun 1
- All ten modules ← Varun 1

### Must never block another developer

| Never blocks | Because |
|---|---|
| Capture pipeline | No repository dependency whatsoever |
| Module implementation | Fixtures, not corpus; modules are independent by construction |
| Metrics harness | Blocked only at CP-2, not during development |
| UI / D0.9 | Deferred to Stage 8; nothing depends on it |
| Architecture adjudication | **Proceed-with-documented-assumption** rule — nobody waits on Jayanth |

### Checkpoints

| # | Trigger | Integrator | Gate |
|---|---|---|---|
| CP-0 | End of Stage 0 | Jayanth | All exit criteria met |
| CP-1 | Engine + ten modules | Jayanth | G-9 property tests green |
| CP-2 | First metrics | Jayanth + Durga | Test split untouched by tuning |
| CP-3 | Extension ↔ Engine | Jayanth + Varun | I-7, I-8, B-10, B-11 verified |
| CP-4 | Replay gate | Jayanth | G-10 green |

---

## 5. First Week Plan

Assumes roughly four productive hours per weekday and a lighter weekend, alongside normal academic commitments.

| Day | Varun | Jayanth | Durga Prasad |
|---|---|---|---|
| **1** | Scaffold: workspace layout, `packages/contracts` populated, tsconfig strict | Approve HB-1/HB-2; tag D0.3 v1.1.0; start pipeline design note | Feed client — PhishTank first |
| **2** | Scaffold complete; **repo importable**; fixtures started | Finish design note; walk it with A and C | Feed client done; **capture running** |
| **3** | Fixtures committed; CI G-1, G-4, G-7 | Integrate G-2/G-3/G-6; violation job | Tranco pull; capture continues |
| **4** | **Capability spike** — ten pages | Predicate evaluator: `is`, `not`, `and`, `or`, `eq`, comparisons | Draft rule set: CRED family |
| **5** | Manifest committed; spike findings written up | Predicate evaluator: `sameSite`, `inSet`, `exists` binding | Draft rule set: DL, PM, suppressions, parameters |
| **6** *(light)* | Extension skeleton scaffolding | Review Durga's rule-set draft | First `--report`: outcome distribution by label |
| **7** *(light)* | — | **CP-0 review** | Migration dry-run; S-2a audit |

**End-of-week state:** repo live and CI green · contracts tagged · capability manifest committed · ≥96h of positives · rule set drafted and under review · predicate evaluator functional.

**Two dates that matter.** Day 2 — the repo must be importable, or Jayanth and Durga stall. Day 2 — capture must be running, because expired positives are unrecoverable.

---

## 6. Repository Readiness

**Ready to be treated as the production implementation repository, subject to R-1.**

Before the first commit:
1. **Decide R-1** — corpus storage. Committing snapshots to Git without LFS is effectively irreversible without history rewriting.
2. Add `.gitignore` covering `node_modules/`, `dist/`, `corpus/` (if external), `.tldextract_cache/`.
3. Enable branch protection on `main` requiring CI green.
4. Tag `contracts@v1.0.0` — with D0.3 at v1.1.0 and D0.5 at v1.1.0 — immediately after the first green build.

Nothing else is outstanding. The contracts compile, the gates execute, the dependency rules are encoded.

---

## 7. Risk Review

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **RK-1** | **Producer conformance divergence.** Extension and harness emit different evidence for the same page; every offline metric becomes untransferable. Surfaces at CP-3, after modules are written. | **High** | Run the D0.1 conformance suite from the first day evidence collection exists, not at CP-3. Invariants I-7 and I-8 are the check. Pull CP-3 earlier if practical. |
| **RK-2** | **Capture yield below expectation.** Cloaking suppresses positives; the corpus is too small for a meaningful test split after domain keying. | **High** | Day-6 outcome distribution is the early indicator. If the positive success rate is very low, add a residential-egress path or lengthen the capture window before Stage 5. |
| **RK-3** | **Scaffold slips past day 3.** Two of three members stall. | Medium | Jayanth takes it over — the one case where TL intervention costs less than the team waiting (BN-1). |
| **RK-4** | **Fingerprint similarity underspecified.** Varun invents a function; τ_sim proves untunable against it. | Medium | R-2 design note before A1.5, reviewed by Jayanth. |
| **RK-5** | **MV3 service-worker termination.** Discovered late, forcing rework of state handling across all extension code. | Medium | A1.1's exit criterion is explicitly survival of mid-session termination. Test it first, not last. |
| **RK-6** | **Effective sample size.** Domain keying reduces independent units sharply; confidence intervals may be too wide to distinguish weight settings. | Medium | Report intervals from the first metrics run. If too wide, the answer is more domains, not narrower intervals. |
| **RK-7** | **Durga overload** post-CP-1 — capture, modules, and metrics competing. | Medium | Recorded trigger: move the rule-set validator (G-8) to Varun. It is purely spec-driven and transfers without context; the metrics harness does not. |
| **RK-8** | **Review latency on Jayanth.** | Low | Mandatory review confined to the frozen-invariant list; proceed-with-documented-assumption rule; batched review windows. |

---

## 8. Final Decision

# GO — Begin implementation immediately.

Both hard blockers were found by compilation during this review, fixed, and verified: D0.3 is at **v1.1.0** with `ItemPath` binding, and the contract set compiles clean under the exact strict settings G-1 enforces.

Two items require attention but block nobody's day-1 work:

- **R-1 (corpus storage)** — decide before the first commit, because it is painful to reverse.
- **R-2 (fingerprint similarity note)** — needed before A1.5, not before day 1.

Varun begins the scaffold now. Durga begins the feed client now. Jayanth's only gating action is sign-off on HB-1 and HB-2 as Architecture Owner.
