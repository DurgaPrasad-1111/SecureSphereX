# SecureSphere X — Implementation Ownership Plan (Rebalanced)

**Scope:** project management only. No architectural change, no contract change, no rule change. Specification v0.8 and `rules-v0.1` unchanged.
**Roles:** A — Varun (Client & Storage) · B — Jayanth (Engine, Technical Lead) · C — Durga Prasad (Data & Validation)

---

## 0. The rebalancing principle

Jayanth's constraint is that he carries architecture ownership, coordination, integration, documentation, academic work, and delivery **in addition to** implementation. If he also implements every architecture-critical component, he becomes the bottleneck that parallel development exists to avoid.

The resolution comes from the architecture itself. The ten Internal Evaluation Modules were made independent by design — each consumes one evidence category, correlates with nothing, and is a pure function from evidence to typed findings. That independence was an architectural property; it is now an **organizational** one. Ten independent units distribute without coordination cost.

What cannot distribute is the small set of components where the frozen invariants actually live: pipeline stage ordering, suppression semantics, aggregation purity, subsumption, and replay determinism. Those stay with Jayanth — and they are a much smaller surface than "the engine".

**Jayanth's implementation budget is capped at roughly 50% of his time.** The remainder is coordination, review, integration, and academic deliverables. The allocation below is built to that cap.

---

## 1. Responsibility Matrix

Four distinct responsibilities, deliberately separated:

| Responsibility | Meaning |
|---|---|
| **Architecture Owner** | Authority to interpret the frozen specification and adjudicate apparent contradictions. Jayanth, always, on everything. |
| **Implementer** | Writes the code. |
| **Reviewer** | Mandatory approver before merge. |
| **Integrator** | Runs the checkpoint; verifies cross-role behaviour. |

| Component | Arch. Owner | Implementer | Reviewer | Integrator |
|---|---|---|---|---|
| **Contracts package** (D0.1–D0.5, D0.8–D0.10) | Jayanth | *frozen* | Jayanth | — |
| Repository scaffold | Jayanth | Varun | Durga | Jayanth |
| CI: G-1, G-4, G-7 | Jayanth | Varun | Durga | — |
| CI: G-2, G-3, G-6 *(architectural gates)* | Jayanth | Jayanth | Varun | — |
| CI: G-8 rule-set validator | Jayanth | Durga | Jayanth | — |
| CI: G-9 property tests | Jayanth | Jayanth | Durga | — |
| CI: G-10 replay gate | Jayanth | Durga | Jayanth | Jayanth |
| **Pipeline core** (Stages 1–8) | Jayanth | Jayanth | Durga | Jayanth |
| **Suppression semantics** (§6.1) | Jayanth | Jayanth | Varun | Jayanth |
| **Aggregation** (§9) | Jayanth | Jayanth | Durga | Jayanth |
| **Subsumption mechanism** (§10) | Jayanth | Jayanth | Durga | — |
| Module: `loginForm` | Jayanth | Varun | Durga | — |
| Module: `javascript` | Jayanth | Varun | Durga | — |
| Module: `authContext` (ACEM) | Jayanth | Varun | **Jayanth** | Jayanth |
| Module: `url` | Jayanth | Durga | Varun | — |
| Module: `homograph` | Jayanth | Durga | Varun | — |
| Module: `redirect` | Jayanth | Durga | Varun | — |
| Module: `downloadContext` | Jayanth | Durga | Varun | — |
| Module: `permissionContext` | Jayanth | Durga | Varun | — |
| Module: `ssl`, `dns` *(deferred — see §9)* | Jayanth | Durga | Varun | — |
| Rule-set file `rules-v0.1.0.json` | Jayanth | Durga | **Jayanth** | — |
| Browser extension (MV3) | Jayanth | Varun | Durga | Jayanth |
| Evidence collection | Jayanth | Varun | Durga | Jayanth |
| Auth History Store + D0.8 | Jayanth | Varun | **Jayanth** | Jayanth |
| UI / enforcement (D0.9) | Jayanth | Varun | Durga | Jayanth |
| Capture pipeline | Jayanth | Durga | Varun | — |
| Corpus + split migration | Jayanth | Durga | Jayanth | — |
| Metrics harness | Jayanth | Durga | Jayanth | Jayanth |
| Calibration | Jayanth | Durga | Jayanth | Jayanth |

### 1.1 Module assignment rationale

Modules are split by **evidence provenance**, so each implementer can test against realistic data:

- **Varun** takes the three whose evidence originates in the browser and which touch his own subsystems: `loginForm` (DOM parsing plus fingerprint generation), `javascript` (runtime instrumentation), `authContext` (reads the store he owns via D0.8).
- **Durga** takes the seven testable from corpus snapshots: `url`, `homograph`, `redirect`, `downloadContext`, `permissionContext`, and the two deferred stubs.

Counts are uneven (3 / 7) but effort is not: `loginForm` and `javascript` are the two most complex modules in the set.

### 1.2 Review policy — the mechanism that unblocks Jayanth

**Jayanth is a mandatory reviewer only where a frozen invariant is at stake:**

- Anything in `packages/contracts`
- Aggregation, suppression, subsumption, replay
- The ACEM and the Auth History Store (§20 invariants)
- The rule-set file (V-1…V-12, and the §1.5 layered-security invariant)
- Metrics and calibration (§13.3 split discipline)

**Everything else is peer-reviewed A ↔ C.** Varun reviews Durga's modules; Durga reviews Varun's. Jayanth is not in that loop.

**Escalation rule.** Where an implementer believes the specification is ambiguous, they raise it as an architecture question and **proceed with a documented assumption** rather than blocking. Jayanth adjudicates in the next review window. Blocking on adjudication is what turns one person into a bottleneck.

---

## 2. Stage 0 Allocation

### Varun — critical path

| # | Task | Order | Exit criteria |
|---|---|---|---|
| A0.1 | Monorepo scaffold; populate `packages/contracts` | **1st — blocks Jayanth** | Builds; strict typecheck passes; importable |
| A0.2 | Fixtures: clean login, off-origin post, no credential form, SSO flow | 2nd | Committed; usable without corpus |
| A0.3 | CI gates G-1, G-4, G-7 | 3rd | Green |
| A0.4 | Capability spike, 10 pages | 4th — parallel | Real `ProducerCapabilityManifest` committed |

A0.1 and A0.2 are timeboxed to **two days**. Minimal scaffold; refinement is later work.

### Jayanth

| # | Task | Exit criteria |
|---|---|---|
| B0.1 | Integrate architectural gates G-2, G-3, G-6 | Green; deliberate-violation job proves gates fire |
| B0.2 | Review + approve `rules-v0.1.0.json` | V-1…V-12 pass; §1.5 invariant machine-verified |
| B0.3 | Pipeline core design note (internal) | Stage boundaries and module interfaces agreed with A and C |
| B0.4 | Adjudicate spike findings | Capability classifications recorded in D0.1 manifest |

### Durga Prasad — no blockers, start immediately

| # | Task | Exit criteria |
|---|---|---|
| C0.1 | `load_feed_urls()` for PhishTank + OpenPhish | Returns url, feed id, verified flag, report date, **target brand** |
| C0.2 | Capture running on 30-min poll | ≥48h positives accumulated |
| C0.3 | Tranco negatives | Top 10k captured |
| C0.4 | `--report` outcome distribution | Success-rate gap by label reported |
| C0.5 | Draft `rules-v0.1.0.json` | Conforms to D0.3; submitted to Jayanth |
| C0.6 | Split migration dry-run | Reassignment stats + S-2a audit reviewed |

---

## 3. Stage 1 Allocation

### Varun — Stage 1c: Client

| # | Task | Depends on | Exit criteria |
|---|---|---|---|
| A1.1 | MV3 extension skeleton; service worker with cold-start-safe state | A0.1 | Survives worker termination mid-session |
| A1.2 | Evidence collection → D0.1 | A0.4 | Conformance suite passes vs harness on SHARED fields |
| A1.3 | Auth History Store + D0.8 read/write | A1.1 | Guards G-01…G-05 unit-tested, including negative cases |
| A1.4 | Modules `loginForm`, `javascript` | A0.1 | Pass fixture tests; deterministic |
| A1.5 | Module `authContext` (ACEM) | A1.3 | Version-mismatch → `unevaluable`, never absent-match |

### Jayanth — Stage 1b: Engine core

| # | Task | Depends on | Exit criteria |
|---|---|---|---|
| B1.1 | Pipeline Stages 1–8 in frozen order | A0.1, A0.2 | Runs fixtures end to end |
| B1.2 | Suppression: monotonic, max-not-product, guarded, non-destructive | B1.1 | Property tests green |
| B1.3 | Aggregation as pure function; subsumption-aware, empty table | B1.1 | Recomputes identically from finding set |
| B1.4 | Monotonic escalation + intervention lock | B1.3 | `rawTier` / `effectiveTier` both recorded |
| B1.5 | Property tests G-9 | B1.2, B1.3 | Randomised; order-independence proven |

### Durga Prasad — Stage 1a: Data & modules

| # | Task | Depends on | Exit criteria |
|---|---|---|---|
| C1.1 | Modules `url`, `homograph`, `redirect` | A0.1 | Pass fixture + corpus tests |
| C1.2 | Modules `downloadContext`, `permissionContext` | A0.1 | Pass fixture tests |
| C1.3 | Rule-set static validator G-8 | C0.5 | V-1…V-12 implemented |
| C1.4 | Corpus operations ongoing | C0.2 | Continuous capture; weekly outcome report |
| C1.5 | Metrics harness | B1.1, C1.1 | Confusion matrix + CI intervals on domain count |

---

## 4. Dependency Graph

```
                    A0.1 Scaffold + contracts  ◄── HARD BLOCKER
                    (Varun, 2 days, timeboxed)
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   A0.2 Fixtures         B0.1 Arch gates       C1.1/C1.2 Modules
   (Varun)               (Jayanth)             (Durga)
        │                     │                     │
        ▼                     ▼                     │
   A0.3 CI G-1/4/7       B1.1 Pipeline core         │
   (Varun)               (Jayanth)                  │
        │                     │                     │
        │                     ▼                     │
        │                B1.2 Suppression           │
        │                B1.3 Aggregation           │
        │                     │                     │
        ▼                     │                     │
   A1.1 Extension             │                     │
        │                     │                     │
        ▼                     │                     │
   A1.3 Auth Store            │                     │
        │                     │                     │
        ▼                     │                     │
   A1.5 ACEM ─────────────────┤                     │
   A1.4 Modules ──────────────┤                     │
                              ▼                     ▼
                        ══ CHECKPOINT 1 ══════════════
                        Engine + all 10 modules
                              │
                              ▼
   C0.2 Capture ────────► C1.5 Metrics ──► ══ CHECKPOINT 2 ══
   (started day 1,                          First confusion matrix
    independent)                                  │
                                                  ▼
                                        ══ CHECKPOINT 3 ══
                                        Extension ↔ Engine
```

**Only one hard blocker exists: A0.1.** Everything else is parallel. Durga's capture chain has no dependency on any other work and starts immediately.

---

## 5. Integration Checkpoints

| # | When | Integrator | Verifies | Gate |
|---|---|---|---|---|
| **CP-0** | End of Stage 0 | Jayanth | Scaffold builds; G-1…G-7 green; contracts tagged v1.0.0; manifest committed; ≥48h corpus | All exit criteria met |
| **CP-1** | Engine + 10 modules | Jayanth | Every module conforms to D0.2; pipeline runs end to end on fixtures; exactly one evaluation per module per pass | G-9 property tests green |
| **CP-2** | First metrics | Jayanth + Durga | Corpus evaluation produces confusion matrix; CI intervals on **domain** count; outcome distribution by label | Test split untouched by tuning |
| **CP-3** | Extension ↔ Engine | Jayanth + Varun | D0.1 conformance suite passes; identical findings on SHARED fields; intervention feedback path works | I-7, I-8, B-10, B-11 verified |
| **CP-4** | Replay gate | Jayanth | Golden corpus reconstruction replay reproduces decisions exactly | G-10 green |

**Checkpoint discipline.** Integration happens only at checkpoints. Between them, roles work against contracts, not against each other's code. This is what the dependency matrix and CI gates exist to enforce — a boundary violation fails the build rather than surfacing at integration.

---

## 6. Exit Criteria by Owner

**Varun — Stage 0:** scaffold builds and typechecks strict · fixtures committed · G-1, G-4, G-7 green · capability manifest committed reflecting observed results.
**Varun — Stage 1:** extension survives service-worker termination · evidence conformance suite passes · store guards unit-tested including negatives · `loginForm`, `javascript`, `authContext` deterministic on fixtures.

**Jayanth — Stage 0:** G-2, G-3, G-6 green with violation job proving they fire · rule-set approved and V-6 machine-verified · pipeline design agreed with A and C.
**Jayanth — Stage 1:** pipeline runs frozen stage order end to end · suppression monotonic and order-independent under property test · aggregation pure and recomputable · escalation and intervention lock recorded.

**Durga — Stage 0:** feed client capturing target brand · ≥48h positives · Tranco captured · outcome distribution reported · rule-set drafted · migration dry-run reviewed.
**Durga — Stage 1:** five modules passing fixture and corpus tests · G-8 validator implementing all twelve checks · continuous capture with weekly reporting · metrics harness producing confusion matrix with intervals on domain count.

---

## 7. Workload Assessment

Estimates in person-days. Treat as planning figures, not commitments.

| | Stage 0 | Stage 1 | Implementation total |
|---|---|---|---|
| **Varun** | 4.5 | 12.0 | **16.5** |
| **Jayanth** | 2.5 | 10.0 | **12.5** |
| **Durga Prasad** | 3.5 | 11.0 | **14.5** |

**Jayanth's total load** — implementation 12.5d plus review, coordination, integration, documentation and academic work. At the ~50% implementation cap, his effective calendar commitment is comparable to the others despite the lower implementation figure. That is the intended outcome.

**Compared to the previous allocation**, Jayanth sheds: all ten evaluation modules, rule-set authoring, the static validator, and the replay harness implementation. He retains authority over every one of them through review.

**Balance check.** Spread across implementers is 16.5 / 14.5 / 12.5 — within roughly 25%, with the lowest figure belonging to the person carrying the largest non-implementation load. Reasonable.

---

## 8. Remaining Bottlenecks and Mitigations

**BN-1 — A0.1 scaffold blocks everyone.** *(Highest severity, shortest duration.)*
Mitigate: timebox to two days; minimal scaffold only; contracts are already written, so this is placement not authorship; Durga's entire capture chain proceeds regardless. If A0.1 slips past day three, Jayanth takes it over directly — it is the one case where TL intervention is cheaper than waiting.

**BN-2 — Jayanth as sole architecture authority.** *(Structural; cannot be eliminated.)*
Mitigate: mandatory review restricted to the frozen-invariant list in §1.2; everything else peer-reviewed A ↔ C; the **proceed-with-documented-assumption** rule means nobody blocks on adjudication; batched review windows rather than ad-hoc interrupts.

**BN-3 — Varun is on both the Stage 0 critical path and the largest Phase I surface.**
Mitigate: A0.3 (CI G-1, G-4, G-7) moves to Durga if A0.1 or A0.2 slips. UI work (D0.9) defers to Stage 8 — nothing depends on it before then.

**BN-4 — Corpus availability gates CP-2.**
Mitigate: already running; fixtures unblock all module development independently of corpus; CP-1 does not depend on corpus at all.

**BN-5 — Reviewer concentration on Durga.** He reviews six of Varun's components while carrying the heaviest module count.
Mitigate: Jayanth absorbs review of `loginForm` and `javascript` if Durga's queue exceeds three open reviews.

**BN-6 — Single points of knowledge.** Only Varun understands the store; only Jayanth understands aggregation semantics.
Mitigate: cross-review already places a second person in each area. Additionally, each owner writes a one-page design note before implementing — which doubles as Phase I technical documentation, an academic deliverable Jayanth would otherwise write alone.

---

## 9. Scheduling Decision Requiring Sign-off

**Defer full implementation of the `ssl` and `dns` modules.**

No rule in `rules-v0.1` reads either module's findings. The module register (§2.6) requires both to exist and produce conformant evaluations, but a minimal conformant implementation — correct shape, correct `unevaluable` handling, findings populated from evidence — satisfies every architectural requirement until a rule consumes them.

This removes roughly two person-days from Durga's Stage 1 without touching the register, the contract, or the pipeline.

**Not an architecture change; a scheduling decision. Requires Jayanth's approval as Architecture Owner.**
