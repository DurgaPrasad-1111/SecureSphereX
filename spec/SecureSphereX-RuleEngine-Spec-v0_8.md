# SecureSphere X — Rule Engine Specification

**Specification Version:** 0.8
**Rule Set Version:** `rules-v0.1` — **unchanged**
**Status:** FROZEN — Implementation Contract
**Document type:** Software Architecture Specification

> **Version note.** Specification v0.2 and v0.3 are **addenda** to v0.1. v0.2 added operational, governance, and verification specification where v0.1 was silent. v0.3 specified the Authentication History Store (§20). v0.4 names the Authentication Context Evaluation Module (§20.11) as the store's evaluation source and clarifies Analysis Session aggregate ownership (§2.5). v0.5 defines fingerprint algorithm version mismatch handling (§20.11). v0.6 names the Download Context and Permission Context Evaluation Modules and consolidates the module register (§2.6). v0.7 clarifies DL-01 evaluation scope (§7.2). v0.8 fixes the benchmark unit of independence and the residual-leakage reporting requirement (§13.3). No predicate, weight, threshold, suppression, or pipeline stage has been altered across any addendum, so the **rule set version does not increment** — every Analysis Session evaluated under v0.1 remains semantically identical under v0.8. This separation of document version from rule-set version is the versioning model of §12 operating as designed.

---

## 0. Document Control

### 0.1 Authority and Scope

This specification is the sole authoritative reference for the SecureSphere X Rule Engine. It supersedes all prior review discussion, correspondence, and clarification material concerning correlation rules, suppression, scoring, aggregation, and analysis-pass structure.

It defines **how deterministic security reasoning is performed** within the Security Intelligence Layer. It does not redefine the Domain Model, the persistence architecture, or the layered architecture; where it touches those, it refines them within the boundaries they already establish.

### 0.2 Relationship to Existing Documents

| Document | Relationship |
|---|---|
| Project Vision | Unchanged. This specification realizes it. |
| Software Architecture Design (LPSIA) | Refined. Tiered intervention added within the existing four-layer model. |
| Domain Model | Conformed to. No amendment required. This specification adds no domain concept except Advisory Finding (§1.4, Phase II). |
| ECE Internal Module Specifications | **Extended at v0.4 and v0.6.** The seven existing modules retain their responsibilities and prohibitions without alteration. Three modules are added — Authentication Context (§20.11), Download Context (§2.6), and Permission Context (§2.6) — each conforming to the same module contract. The ECE document REQUIRES three corresponding addendum entries to remain the complete module register. |
| Persistence Architecture Specification | Conformed to. Rule Set Versioning reuses the versioning pattern ratified in §16/§40/ADR-006. |
| Phased Implementation Proposal | Conformed to. §1.4 and §9.5 define Phase I and Phase II behaviour explicitly. |

### 0.3 Conformance Language

**SHALL / MUST** — mandatory. **SHALL NOT / MUST NOT** — prohibited. **SHOULD** — recommended; deviation requires documented justification. **MAY** — permitted.

### 0.4 What This Document Does Not Contain

No API contracts, JSON schemas, DTOs, folder structures, database schemas, or code. No empirically determined values presented as architectural constants — see §13.

---

## 1. Design Philosophy

### 1.1 Why Deterministic Correlation Rules

A security decision presented to a user is only defensible if it can be explained, reproduced, and audited. SecureSphere X therefore derives every security decision from named rules over observable facts.

Three properties follow, and each is a requirement rather than an aspiration:

- **Explainability.** Every score decomposes into the specific findings that produced it. A user can be told *why*, and a developer can be told *which rule*.
- **Reproducibility.** Identical evidence under an identical rule-set version SHALL produce an identical decision. This is what makes regression testing possible at all.
- **Auditability.** Every decision is reconstructable from the persisted Analysis Session together with its recorded rule-set version.

A probabilistic model can be accurate. It cannot, on its own, be any of these three.

### 1.2 Why Security Evaluations Remain Independent

Each Internal Evaluation Module interprets only the Security Evidence assigned to its own analytical domain, and SHALL NOT consult the output of any other module. This is not modularity for its own sake:

- A module can be developed, tested, and reasoned about in isolation.
- A new module can be added without modifying any existing module.
- A defect in one module cannot silently propagate into another module's conclusions.
- Cross-domain reasoning is confined to one place, where it can be governed.

Independence is what makes the correlation stage meaningful. If modules could see one another, correlation would already have happened, informally and untraceably.

### 1.3 Why Correlation Findings Are Emergent Knowledge

A Correlation Finding represents knowledge that **exists in no single evaluation**.

That a page contains a password field is not a security finding — most login pages do. That a form posts to another registrable domain is not a security finding — federated systems do it. That both are true of the same page is a security finding, and it belongs to neither module.

This is why the scoring model is not a weighted sum over indicators. An additive indicator score assigns `password field: +20` identically whether the form posts to its own origin or to an attacker's — and that difference *is* the signal. Correlation exists to express exactly what summation cannot.

### 1.4 Why AI Is Excluded from Deterministic Evaluation

Artificial Intelligence SHALL NOT participate in Security Evidence collection, Security Evaluation, Correlation Finding generation, suppression, or aggregation. Those stages are deterministic and SHALL remain so.

AI participates at one point only: **advisory escalation of Medium-risk outcomes**.

**Advisory Finding.** AI output is represented by a domain object named Advisory Finding, which sits parallel to Security Evaluation and is consumed by correlation in a subsequent pass. It is explicitly marked non-deterministic. The following constraints SHALL hold:

- An Advisory Finding SHALL NEVER be the sole basis for a Block decision.
- An Advisory Finding SHALL always be attributed as AI-generated wherever surfaced to a user.
- The invoking input and the returned output SHALL be persisted with the Analysis Session, so that the session remains reconstructable even though the model is not reproducible.
- An Advisory Finding SHALL enter only a second or subsequent pass. The first pass is always fully deterministic.

**Phase behaviour.** AI escalation is a Phase II capability. In Phase I, a Medium outcome SHALL resolve to Warn with an evidence-based explanation. Phase I is therefore complete and shippable without any AI component, and Phase II's contribution is directly measurable as the proportion of Warns that AI escalation converts into a confident Allow or Block.

### 1.5 Layered Security: No Single Indicator Produces High

**Invariant.** No single primary Correlation Finding SHALL carry a base weight sufficient to reach the High threshold on its own.

A High-risk classification blocks a user. That intervention SHALL require corroboration from more than one independent analytical domain. This is the layered-security philosophy expressed as an enforceable numeric property rather than a stated intention, and it is verifiable by inspection of the rule table: the highest primary weight (50) is below the High threshold (60).

*Calibration note.* A primary finding combined with its aggravator (§9.3) can reach High — CRED-02 (50) + CRED-A1 (10) = 60 exactly. An aggravator is not independent, so this does not violate the invariant as stated. It is nonetheless a boundary condition flagged for empirical review during threshold calibration (§13.2).

---

## 2. Final Domain Mapping

### 2.1 Object Model

| Object | Produced by | Consumed by | Mutability |
|---|---|---|---|
| Security Evidence | Evidence Collection (extension / backend) | Internal Evaluation Modules | Immutable on creation |
| Security Evaluation | One Internal Evaluation Module | Correlation stage | Immutable on creation |
| Advisory Finding *(Phase II)* | AI Advisory Intelligence Engine | Correlation stage, pass ≥ 2 | Immutable on creation |
| Correlation Finding | Correlation stage | Aggregation stage | Immutable on creation |
| Analysis Pass Result | Aggregation + Threshold stages | Current Security State | Immutable on creation |
| Current Security State | Aggregation stage | Presentation, enforcement | **Replaceable** |
| Analysis History | Session | Domain Entity, reporting | **Append-only** |
| Analysis Session | Analysis orchestration | Persistence, reporting | Immutable once finalized |

### 2.2 Immutability Guarantees

- **Security Evidence, Security Evaluation, Advisory Finding, Correlation Finding, Analysis Pass Result** — SHALL NOT be modified after creation. A subsequent pass SHALL produce new objects; it SHALL NOT alter existing ones.
- **Current Security State** — SHALL be replaced wholesale by each recomputation. It SHALL NOT be edited in place, and prior values SHALL NOT be retroactively amended. This is the same mutability contract ratified in the Persistence Architecture: replaceable going forward, never edited backward.
- **Analysis History** — append-only. Entries SHALL NOT be edited or deleted.
- **Analysis Session** — immutable once finalized. Its evidence, evaluations, findings, and final assessment SHALL NOT be altered after completion.

### 2.3 Traceability Chain

```
Security Evidence
      │  referenced by
      ▼
Security Evaluation ────────────┐
      │  referenced by          │ (Advisory Finding, pass ≥ 2)
      ▼                         ▼
Correlation Finding ◄───────────┘
      │  aggregated into
      ▼
Analysis Pass Result
      │  latest determines
      ▼
Current Security State
```

Every Correlation Finding SHALL reference the Security Evaluations from which it was derived. It SHALL NOT reference another Correlation Finding (§10.1).

### 2.4 Scoring Objects Are Not Domain Knowledge

Effective weight, aggregate score, and threshold tier are **properties of a rule-set evaluation**, not intrinsic properties of a Correlation Finding. A finding does not know its own weight; the aggregation function assigns one under a stated rule-set version.

This is what allows a historical Analysis Session to be rescored under a later rule set without violating immutability — the findings are unchanged; only the function applied to them differs.

---

### 2.5 Analysis Session Aggregate Ownership

The Persistence Architecture Specification (§19, §22, §26) fixed the Analysis Session aggregate composition before the multi-pass model of §3.4 existed. Two objects introduced by this specification therefore had no stated owner.

**Clarification.** The Analysis Session aggregate owns, in addition to the elements already enumerated in the Persistence Architecture Specification:

- **Analysis Pass Result** — every pass result produced within the Session.
- **Advisory Finding** *(Phase II)* — every advisory input consumed within the Session.

Both are immutable on creation (§2.2) and are finalized with the Session.

*Scope.* This is an ownership clarification only. No aggregate boundary moves, no repository ownership changes, and no dependency direction is affected. It is incorporated under the addendum provision of Persistence Architecture Specification §43.

---

### 2.6 Internal Evaluation Module Register

*(added at specification v0.6)*

The complete module set. Every module conforms to the same contract and the same prohibitions: it consumes only its own evidence category, produces exactly one Security Evaluation per pass, and SHALL NOT correlate, assign confidence, apply thresholds, classify the Target Resource, or produce a Security Decision.

| # | Module | Evidence category | Defined in | Rules served |
|---|---|---|---|---|
| 1 | URL Evaluation | `url` | ECE Module Specs | CRED-06 |
| 2 | SSL Evaluation | `transport` | ECE Module Specs | — |
| 3 | DNS Evaluation | `dns` | ECE Module Specs | — |
| 4 | Redirect Evaluation | `redirect` | ECE Module Specs | CRED-04, PM-01 |
| 5 | Login Form Evaluation | `loginInterface` | ECE Module Specs | CRED-01…07, CRED-A1 |
| 6 | JavaScript Evaluation | `scriptRuntime` | ECE Module Specs | CRED-05, CRED-A1 |
| 7 | Homograph Evaluation | `domainRepresentation` | ECE Module Specs | CRED-03 |
| 8 | Authentication Context Evaluation (ACEM) | `loginInterface` (fingerprint) | §20.11, v0.4 | CRED-02 |
| 9 | **Download Context Evaluation** | `downloadContext` | **§2.6, v0.6** | DL-01, DL-02 |
| 10 | **Permission Context Evaluation** | `permissionContext` | **§2.6, v0.6** | PM-01 |

**Modules 9 and 10 — resolution of GAP-4.**

DL-01, DL-02, and PM-01 (§7.1) declared required evaluations from Download and Permission sources that no module produced. The rules presupposed evaluation outputs that were never named.

*Why the alternative was unavailable.* Permitting correlation to consume `downloadContext` and `permissionContext` evidence directly is prohibited by Domain Model §8.4.3 — a Correlation Finding shall never derive knowledge directly from Security Evidence — and by §4.2, which places rule predicates at Stage 2 over evaluations. It would additionally place those rules outside replay, since evidence is persisted but inline interpretation is not.

*Scope.* Naming only. DL-01, DL-02, and PM-01 retain their predicates, weights, tiers, types, and parent relationships exactly as frozen at `rules-v0.1`. The rule set does not increment.

**Download Context Evaluation Module.** Reports the observed delivery context of a download: effective type classification, declared filename and extension, declared content type, compound-extension presence, and the registrable domains of the download URL and its referring page. It applies no membership test against the executable set — R-02 is a predicate refinement applied at Stage 2 (§5.3), not a module responsibility.

**Permission Context Evaluation Module.** Reports the observed context of a permission request: the requested permission, the requesting origin's registrable domain, whether a user gesture preceded it, and the page age at request time. It applies no membership test against the sensitive-permission set — R-03 is applied at Stage 2 (§5.4).

*Cross-document dependency.* The ECE Internal Module Specifications document REQUIRES addendum entries for modules 8, 9, and 10 to remain the complete module register.

---

## 3. Analysis Session Lifecycle

### 3.1 Session Identity

> **One Analysis Session = one Target Resource = one navigation.**

A Session SHALL be created on navigation commit and SHALL be associated with exactly one Target Resource. A new navigation SHALL create a new Session. Multiple analysis passes — including multiple Tier 2 gates on the same page — SHALL belong to the same Session.

A Session SHALL NOT span multiple navigations. A browsing session is not an Analysis Session.

### 3.2 Tier Definitions

| Tier | Trigger | Scope | Network | Budget | May intervene |
|---|---|---|---|---|---|
| **0** | Navigation commit | URL, homograph | None (local only) | < 10 ms | No |
| **1** | DOM content ready | Login form structure, JS listeners, local fingerprint match | None (local only) | < 50 ms | No |
| **2** | Action gate | Full correlation; backend lookup permitted; AI escalation permitted (Phase II) | Permitted | User is stopped; latency budget relaxed | **Yes** |

**Tier 2 gates.** Credential submission, download initiation, sensitive permission request.

**Intervention rule.** Tier 0 and Tier 1 SHALL NOT interrupt the user. They MAY set a passive indicator and SHALL arm the Tier 2 gates. Only a Tier 2 gate SHALL produce a modal warning or a block.

This is the mechanism that buys the false-positive headroom the design depends on: a passive indicator costs the user nothing when wrong, and an interruption occurs only at a moment where the user already expects friction.

### 3.3 Lifecycle

```
Navigation commit
        ↓
Analysis Session created  (Target Resource bound; rule-set version recorded)
        ↓
Pass 1 — Tier 0          → Analysis Pass Result → Current Security State
        ↓
Pass 2 — Tier 1          → Analysis Pass Result → Current Security State
        ↓
[Gate armed; user acts]
        ↓
Pass 3 — Tier 2          → Analysis Pass Result → Current Security State
        ↓                              ↓
        │                    [Medium ∧ Phase II]
        │                              ↓
        │                    AI escalation invoked
        │                              ↓
Pass 4 — Tier 2 (re-run, Advisory Finding included)
        ↓
[Further gates → further passes]
        ↓
Session finalized (immutable)
```

### 3.4 Passes

Each pass SHALL execute the complete evaluation pipeline (§4) forward, from module evaluation through Current Security State update. A pass SHALL NOT modify the objects produced by an earlier pass, and SHALL NOT derive knowledge from a later stage.

**AI escalation is a forward pass, not a feedback loop.** When AI is invoked, the pipeline runs forward again with the Advisory Finding included among its inputs, producing new evaluations, new findings, and a new Pass Result. Nothing is mutated and no stage consumes its own successor. This preserves the Domain Model's progressive-evolution and immutability invariants intact.

One escalation mechanism therefore serves both tiering and AI, rather than two.

### 3.5 Session Closure

A Session SHALL be finalized on navigation away, tab closure, or inactivity timeout. On finalization the Session becomes immutable and SHALL be written to Analysis History.

---

## 4. Rule Evaluation Pipeline

### 4.1 Frozen Stage Order

```
1. MODULE EVALUATION
2. PREDICATE MATCHING        (predicate refinements applied here)
3. CORRELATION FINDING GENERATION
4. CONTEXTUAL SUPPRESSION
5. EFFECTIVE WEIGHT CALCULATION
6. AGGREGATION               (subsumption applied here)
7. THRESHOLD EVALUATION
8. CURRENT SECURITY STATE UPDATE
```

This order is **architecturally frozen**. Implementations SHALL NOT reorder these stages.

### 4.2 Stage Responsibilities

**Stage 1 — Module Evaluation.** Each Internal Evaluation Module deterministically interprets its assigned Security Evidence and emits one Security Evaluation. Modules run independently and MAY run in parallel. No module reads another's output.

**Stage 2 — Predicate Matching.** Each rule's predicate is evaluated against the complete set of Security Evaluations. **Predicate refinements (§5) are applied here and only here** — they define what the rule's terms mean, and a predicate has no meaning without them.

**Stage 3 — Correlation Finding Generation.** Every matched predicate produces one Correlation Finding, referencing the Security Evaluations that satisfied it, and carrying its base weight from the rule set.

**Stage 4 — Contextual Suppression.** Suppressions (§6) are tested against each candidate finding. A suppression records a reduction factor against a finding. It does not delete the finding.

**Stage 5 — Effective Weight Calculation.** For each finding, the effective weight is computed from its base weight and the maximum applicable reduction. Suppressed findings retain an effective weight of zero and remain recorded.

**Stage 6 — Aggregation.** A pure function (§9) over the complete finding set produces one score. Subsumption (§10) is applied here.

**Stage 7 — Threshold Evaluation.** The score is mapped to Low, Medium, or High.

**Stage 8 — Current Security State Update.** The result is written as a new Analysis Pass Result, appended to Analysis History, and used to replace Current Security State subject to monotonic escalation (§11.3).

### 4.3 Determinism Guarantee

Given an identical set of Security Evaluations and an identical rule-set version, stages 2 through 7 SHALL produce an identical score and tier. No stage SHALL depend on wall-clock time, evaluation order, iteration order, or any source of nondeterminism.

Where a Phase II Advisory Finding is present, determinism holds **conditionally**: the pipeline is deterministic *given* the Advisory Finding, which is itself persisted. The claim made is precisely this and no stronger.

---

## 5. Predicate Refinements

### 5.1 Nature of a Refinement

A predicate refinement **defines the meaning of a term used inside a rule**. It is not a suppression, and the distinction is load-bearing:

- A refinement is evaluated **during** predicate matching (Stage 2). Without it, the predicate has no meaning at all.
- A suppression is evaluated **after** a finding exists (Stage 4). The rule genuinely matched; context indicates this instance is benign.

Refinements SHALL NEVER be applied after Stage 2.

### 5.2 R-01 — Same-Site Determination

Two URLs are **same-site** when their registrable domains (eTLD+1, resolved via the Public Suffix List) are equal. Differing subdomains of an equal registrable domain are same-site.

`login.example.com` and `api.example.com` → same-site.
`example.com` and `example.co.uk` → not same-site.

Used by: CRED-01, CRED-02, CRED-04, CRED-05, CRED-07, CRED-A1, DL-01.

### 5.3 R-02 — Executable Delivery Determination

A download is **executable delivery** when its effective type falls within the executable/archive set: native executables and installers, script and shortcut formats, and archive containers commonly used to wrap them. The exact membership list is a versioned rule-set artifact.

Used by: DL-01.

### 5.4 R-03 — Sensitive Permission Determination

A permission request is **sensitive** when it grants access to input capture, location, persistent notification, or clipboard read. The exact membership list is a versioned rule-set artifact.

Used by: PM-01.

### 5.5 R-04 — Credential Field Determination

A field is a **credential field** when it is a password input, or an input whose observable semantics indicate one-time-password or PIN entry. A **credential form** is a form containing at least one credential field.

Used by: all CRED-family rules.

### 5.6 Non-Matching Is Not Suppression

Where the evidence required by a predicate is absent, the predicate simply does not match and no finding is generated. This is ordinary rule matching and SHALL NOT be modelled as suppression.

Consequently, a page with no credential field, no download, and no permission request generates no findings from CRED-01 through CRED-07, DL-01, DL-02, or PM-01, and scores zero. The large majority of navigations exit here.

---

## 6. Contextual Suppression Rules

### 6.1 Suppression Semantics — Frozen

- **Monotonic.** A suppression SHALL only reduce a weight. It SHALL NEVER increase a weight and SHALL NEVER create a finding.
- **Maximum, not product.** Where multiple suppressions apply to one finding, the **maximum** reduction factor SHALL be taken. Reductions SHALL NOT be multiplied or otherwise compounded.
- **Order-independent.** Because maximum is commutative and associative, the order in which suppressions are considered cannot affect the outcome. Multiplication would make ordering significant and would silently invalidate the determinism guarantee of §4.3.
- **Non-destructive.** A suppressed finding SHALL remain recorded in the Analysis Session together with the suppression that applied and its guard evaluation. Suppressed findings are not discarded.
- **Guarded.** Every suppression SHALL declare guard conditions under which it does not apply. A suppression without guards is an exploitable bypass.

Effective weight is computed as:

```
effective_weight(f) = base_weight(f) × (1 − max_reduction(f))
max_reduction(f)    = max{ reduction(s) : s applicable to f, guards satisfied }
                    = 0 where no suppression applies
```

### 6.2 S-01 — Prior Authentication

| Field | Definition |
|---|---|
| **Purpose** | Users legitimately re-authenticate to familiar sites constantly. Treating routine re-authentication as anomalous would make the product unusable. |
| **Guard conditions** | The AuthContext Evaluation (§20.11) reports `origin_present = true` with lifecycle state `ESTABLISHED`, **and** reports fingerprint drift for that origin within tolerance. The guard SHALL be evaluated against the recorded AuthContext Evaluation, never by querying the store directly. |
| **Applies to** | CRED-02 → nullify. CRED-01, CRED-04 → halve. |
| **Maximum reduction** | 1.0 (CRED-02); 0.5 (CRED-01, CRED-04). |
| **Does not apply to** | CRED-03, CRED-05, CRED-06, CRED-07, DL, PM families. A familiar origin does not excuse cleartext transmission or script-mediated exfiltration. |

### 6.3 S-02 — Federated Identity Provider

| Field | Definition |
|---|---|
| **Purpose** | Federated authentication involves credential submission in the context of a third-party identity provider. Registry-listed providers are exempted from off-origin post penalties. |
| **Guard conditions** | `eTLD+1(form.action)` matches a registry entry by **exact string equality** — never by substring, suffix, or similarity. **And** CRED-03 has not fired against the action domain. **And** the registry version is recorded in the Analysis Session. |
| **Applies to** | CRED-01 → nullify. |
| **Maximum reduction** | 1.0. |
| **Critical guard rationale** | Without the CRED-03 guard, an attacker registering a confusable lookalike of a registry entry would obtain automatic exemption from the strongest credential rule. The guard closes this directly. |

**Registry note.** No authoritative machine-readable IdP registry exists, so a curated list is unavoidable. It is small in practice — the major providers cover the overwhelming majority of real federated authentication. The registry is a versioned rule-set artifact (§12).

**Structural note.** Correct OAuth/OIDC flows navigate the user to the provider's own origin, where credentials are entered on that origin — they do not post a password cross-origin from the relying party. CRED-01 therefore should not fire on correctly implemented federated login at all. S-02 exists to absorb the imperfect real-world remainder, not to excuse the pattern generally.

### 6.4 A-01 — User-Trusted Origin

| Field | Definition |
|---|---|
| **Purpose** | Permits a user to proceed past a warning on an origin they judge legitimate, without permanently disarming protection. |
| **Guard conditions** | An explicit, recorded user trust action, scoped to a single origin, within its validity period. |
| **Applies to** | CRED-01, CRED-04, CRED-07, PM-01, DL-01 → halve. |
| **Maximum reduction** | 0.5. Never nullifies. |
| **Does not apply to** | CRED-02, CRED-03, CRED-05, CRED-06. A single mis-click SHALL NOT disable impersonation detection or excuse cleartext credential transmission. |
| **Expiry** | Trust SHALL expire. The validity period is an empirical parameter (§13.2). |

---

## 7. Correlation Findings

### 7.1 Rule Table — Frozen Set

| ID | Name | Type | Weight | Tier | Required Evaluations |
|---|---|---|---|---|---|
| CRED-01 | Off-origin credential post | Primary | 45 | 2 | LoginForm |
| CRED-02 | Unfamiliar impersonation | Primary | 50 | 2 | LoginForm + AuthContext |
| CRED-03 | Deceptive identity with credential collection | Primary | 45 | 1 → 2 | Homograph + LoginForm |
| CRED-04 | Laundered arrival | Primary | 30 | 1 | Redirect + LoginForm |
| CRED-05 | Script-mediated credential exfiltration | Primary | 45 | 2 | JavaScript |
| CRED-06 | Cleartext credential collection | Primary | 40 | 2 | LoginForm |
| CRED-07 | Concealed credential collection | Primary | 20 | 2 | LoginForm |
| CRED-A1 | Injected credential interface | **Aggravator** | +10 | 1 → 2 | JavaScript + LoginForm |
| DL-01 | Suspicious executable delivery | Primary | 35 | 2 | Download + any active finding |
| DL-02 | Deceptive file typing | **Aggravator** | +20 | 2 | Download |
| PM-01 | Unsolicited sensitive permission | Primary | 25 | 2 | Permission + Redirect |

Eleven rules. No rule has been added beyond those agreed in review.

**Family convention.** A rule's family prefix denotes the **asset it protects**, not the evidence source it consumes. CRED-05 draws its evidence from the JavaScript module but protects credentials, and is therefore a CRED rule.

**Tier notation.** `1 → 2` denotes a rule that may be evaluated at Tier 1 to arm a gate, but whose contribution to an intervening decision occurs at Tier 2.

### 7.2 Rule Detail

---

**CRED-01 — Off-origin credential post**

- **Predicate:** credential form present ∧ ¬same-site(form action, page URL) *[R-01, R-04]*
- **Weight:** 45 · **Tier:** 2 · **Type:** Primary
- **Explanation:** Credentials are destined for a registrable domain other than the one the user believes they are visiting. This is the canonical structural signature of credential harvesting.
- **Expected false-positive risks:** Federated authentication not covered by the S-02 registry; embedded payment and identity iframes; multi-brand corporate estates operating a shared authentication domain across regional TLDs.
- **Known limitations:** Cannot observe submission destinations rewritten by script at submit time — that case belongs to CRED-05. A page may declare a benign action attribute and override it dynamically.

---

**CRED-02 — Unfamiliar impersonation**

- **Predicate:** credential form present ∧ AuthContext Evaluation reports `origin_present = false` ∧ AuthContext Evaluation reports a best-match established fingerprint at origin `d` with similarity ≥ τ_sim ∧ ¬same-site(`d`, page) *[R-01, R-04]*
- **Evaluation source:** The Authentication History Store is read exclusively by the Authentication Context Evaluation Module (§20.11), never by the correlation stage. CRED-02 correlates two Security Evaluations — LoginForm and AuthContext — exactly as every other rule correlates evaluations.
- **Weight:** 50 · **Tier:** 2 · **Type:** Primary
- **Explanation:** The page structurally and visually resembles a login page the user has genuinely authenticated to, on a domain where they never have. This is the platform's strongest zero-hour signal and its principal differentiator: it derives from the individual user's own history, is computed locally, requires no blocklist, and survives valid certificates, reputable hosting, and plausible domain names.
- **Expected false-positive risks:** White-label and shared-template platforms where many legitimate tenants render near-identical login pages; a user's first visit to a legitimate regional or sibling property of a site they already use.
- **Known limitations:** Cold start — no protection until the user has authenticated at least once. τ_sim is empirical (§13.2). A stale fingerprint following a legitimate site redesign causes a **false negative**, not a false positive, because a redesigned legitimate site is reported present by the AuthContext Evaluation and the predicate does not match. This is mitigated by refreshing the stored fingerprint on every successful authentication and retaining the two to three most recent per origin.
- **Fingerprint composition:** Feature classes SHALL be chosen for stability under redesign and difficulty of variation under impersonation — input field composition and ordering, credential field presence and type, page title tokens, favicon hash, perceptual hash of the dominant above-the-fold image, dominant colour palette. Raw DOM structure SHALL NOT be used; it is too brittle. Similarity SHALL be scored and thresholded, never required to match exactly.
- **Privacy constraint:** The authentication history store SHALL remain local to the device and SHALL NEVER be transmitted.

---

**CRED-03 — Deceptive identity with credential collection**

- **Predicate:** (confusable characters ∨ mixed-script domain ∨ IDN/Punycode representation) ∧ credential form present *[R-04]*
- **Weight:** 45 · **Tier:** 1 → 2 · **Type:** Primary
- **Explanation:** Visual domain deception is only weakly meaningful alone, and strongly meaningful when the deceptive domain is collecting credentials.
- **Expected false-positive risks:** Legitimate internationalized domains in non-Latin scripts. This risk is material in non-English markets and SHALL be measured on a regionally representative negative set, not solely on a Latin-script one.
- **Known limitations:** Requires a confusables/skeleton mapping. Single-script non-Latin domains are legitimate and common; the rule SHOULD weight mixed-script representation more heavily than non-ASCII representation alone.

---

**CRED-04 — Laundered arrival**

- **Predicate:** redirect hops ≥ 2 ∧ ¬same-site(final URL, initial URL) ∧ credential form present *[R-01, R-04]*
- **Weight:** 30 · **Tier:** 1 · **Type:** Primary
- **Explanation:** Credential collection reached through a multi-hop cross-site redirect chain is characteristic of link-laundering through compromised or disposable intermediaries.
- **Expected false-positive risks:** Advertising networks, link shorteners, marketing campaign tracking, and legitimate SSO chains — all of which routinely produce multi-hop cross-site redirects.
- **Known limitations:** Hop counting reflects only what the extension observes; server-side redirect chains may be collapsed before the extension sees them, understating the true count.

---

**CRED-05 — Script-mediated credential exfiltration**

- **Predicate:** JavaScript listener registered on a credential field ∧ client-side transmission observed ∧ ¬same-site(transmission endpoint, page) *[R-01, R-04]*
- **Weight:** 45 · **Tier:** 2 · **Type:** Primary
- **Explanation:** Credentials leaving the page by script rather than by form submission, to an off-site endpoint. This captures the exfiltration path that CRED-01 structurally cannot see.
- **Expected false-positive risks:** Analytics instrumentation attached to form fields; password strength meters; single-page applications authenticating against an API on a different registrable domain.
- **Known limitations:** Reliable observation requires instrumentation established before page scripts execute. Dynamically constructed or obfuscated endpoints may evade endpoint attribution.

---

**CRED-06 — Cleartext credential collection**

- **Predicate:** credential form present ∧ page scheme is HTTP *[R-04]*
- **Weight:** 40 · **Tier:** 2 · **Type:** Primary
- **Explanation:** Credentials collected over an unencrypted transport are exposed regardless of the site's intent.
- **Expected false-positive risks:** Local development environments, legacy intranet applications, captive portals.
- **Known limitations:** Increasingly rare on the public web, and browsers already surface their own warning. Retained because it is unambiguous and cheap; its empirical contribution may prove small.

---

**CRED-07 — Concealed credential collection**

- **Predicate:** (hidden credential field ∨ credential field with autocomplete disabled) ∧ ¬same-site(form action, page URL) *[R-01, R-04]*
- **Weight:** 20 · **Tier:** 2 · **Type:** Primary
- **Explanation:** Concealment of credential collection, combined with off-site submission.
- **Expected false-positive risks:** Password manager integration fields; financial institutions that disable autocomplete as a matter of policy.
- **Known limitations:** Weak in isolation, which is why it carries the lowest primary weight and requires the off-site conjunct to fire at all.

---

**CRED-A1 — Injected credential interface** *(Aggravator)*

- **Predicate:** credential form introduced after initial page load by a dynamically loaded script ∧ ¬same-site(injecting script origin, page) *[R-01, R-04]*
- **Weight:** +10 · **Tier:** 1 → 2 · **Type:** Aggravator
- **Parent requirement:** Contributes only when CRED-01 or CRED-02 is present and unsuppressed.
- **Explanation:** Client-side injection of a credential interface from an off-site script is meaningful as corroboration and meaningless alone.
- **Expected false-positive risks:** Essentially the entire modern single-page-application web. Component frameworks routinely inject login forms post-load from bundled or CDN-hosted scripts. This is precisely why the rule carries no standalone weight.
- **Known limitations:** Attribution of the injecting script's origin is not always reliable where bundlers rewrite or inline sources.

---

**DL-01 — Suspicious executable delivery**

- **Predicate:** executable delivery *[R-02]* ∧ ¬same-site(download URL, referring page) ∧ at least one active unsuppressed finding on the referring Analysis Session *[R-01]*
- **Weight:** 35 · **Tier:** 2 · **Type:** Primary
- **Explanation:** Executable content delivered cross-site from a page already carrying security findings.
- **Expected false-positive risks:** Legitimate CDN- and release-host-delivered installers, which are cross-site by normal practice. The requirement for a pre-existing finding on the referring session is what makes this rule tolerable at all.
- **Evaluation scope** *(clarified at specification v0.7):* "Active unsuppressed finding on the referring Analysis Session" means a finding committed in an **earlier pass of the current Analysis Session**. A download initiated from a page is a Tier 2 gate within that page's own Session (§3.2), so the referring Session is the current one. The predicate reads committed prior-pass state only; it SHALL NOT read the in-flight finding set of the current pass.

  *Rationale.* Reading in-flight findings would create intra-pass ordering dependency, making aggregation impure (§9.1) and evaluation order-sensitive — both prohibited by §4.3. Prior-pass findings are committed and immutable (§2.2), so the predicate remains deterministic and replayable.

  *Consequence.* A download initiated before any Tier 0/1 finding exists cannot match DL-01. This is intended behaviour: DL-01 exists to flag executable delivery from pages already carrying findings.

  *Scope.* Interpretation only. DL-01's predicate, weight, tier, and parent are unchanged; the rule set does not increment.
- **Known limitations:** Requires referring session context; a download initiated by direct navigation has no referring page and cannot match. No file content inspection is performed or claimed — this is delivery-context analysis only.

---

**DL-02 — Deceptive file typing** *(Aggravator)*

- **Predicate:** declared extension inconsistent with implied content type ∨ double-extension pattern
- **Weight:** +20 · **Tier:** 2 · **Type:** Aggravator
- **Parent requirement:** Contributes only when DL-01 is present and unsuppressed.
- **Explanation:** Type deception corroborates suspicious delivery. Alone it is frequently a server misconfiguration.
- **Expected false-positive risks:** Servers emitting generic octet-stream content types; legitimate archives with compound extensions.
- **Known limitations:** Declared content types are frequently generic, limiting how often the inconsistency test can conclude anything.

---

**PM-01 — Unsolicited sensitive permission**

- **Predicate:** sensitive permission requested *[R-03]* ∧ no preceding user gesture ∧ (arrived via cross-site redirect ∨ page age below threshold) *[R-01]*
- **Weight:** 25 · **Tier:** 2 · **Type:** Primary
- **Explanation:** A sensitive capability requested without user initiation, on a page reached indirectly or only just loaded.
- **Expected false-positive risks:** Conferencing and mapping applications that request capabilities immediately on load as a matter of design.
- **Known limitations:** User gesture attribution is imprecise across frames and asynchronous handlers. The page-age threshold is empirical (§13.2).

---

## 8. Rule Families

### 8.1 Families Are Naming Only

Rule families are an **organizational prefix**. They are not an evaluation boundary.

- **CRED-xx** — credential protection
- **DL-xx** — download delivery
- **PM-xx** — permission requests
- **JS-xx** — JavaScript behaviour *(reserved; no rules in v0.1)*

The following SHALL hold:

- All rules participate in **one unified evaluation pass**.
- Families SHALL NEVER be evaluated independently of one another.
- Cross-family correlation is fully supported and SHALL NOT be inhibited by family membership. DL-01 already depends on an active finding from any family.
- Adding a family SHALL NOT require any change to the evaluation pipeline.

**Rationale.** If families were evaluated in isolation, the engine would lose precisely the cross-domain conjunctions that justify having a correlation engine rather than a scoring table.

### 8.2 Privacy Is a Separate, Non-Scoring Surface

Privacy observations — tracker presence, fingerprinting behaviour, third-party cookie activity — SHALL be surfaced as an **independent informational output** and SHALL NOT contribute to the security score.

**Rationale.** Privacy-invasive tracking is not compromise, and treating it as such is a category error with a concrete cost: trackers are near-universal across legitimate sites, so privacy rules would fire constantly on benign traffic and raise the baseline score everywhere. That would consume the threshold headroom the intervention model depends on.

Two independent outputs are produced from one evidence set. They are never blended into one number.

---

## 9. Aggregation Engine

### 9.1 Aggregation Is a Pure Function

Aggregation SHALL be a pure function over the **complete finding set** at the conclusion of a pass, recomputed in full on every pass.

Aggregation SHALL NOT be implemented as an incremental accumulator that findings add into as they are generated. An accumulator cannot express subsumption, cannot be replayed, and produces order-dependent results.

### 9.2 Scoring Function

```
score(F, R) =
      Σ  effective_weight(f)
         for f ∈ F where f is Primary
                    ∧ f ∉ subsumed(F, R)

    + Σ  aggravator_weight(a)
         for a ∈ F where a is Aggravator
                    ∧ parent(a) ∈ F
                    ∧ parent(a) ∉ subsumed(F, R)
                    ∧ effective_weight(parent(a)) > 0
```

where `F` is the complete finding set and `R` is the rule-set version.

### 9.3 Aggravators

An **aggravator** is a finding that carries no standalone weight and contributes only when its declared parent finding is present, unsubsumed, and unsuppressed.

An aggravator SHALL NOT contribute where its parent has been fully suppressed. A suppression that neutralizes a parent SHALL neutralize its aggravators by consequence — otherwise suppression would be non-monotonic in effect.

### 9.4 Thresholds

| Tier | Score range | Phase I outcome | Phase II outcome |
|---|---|---|---|
| **Low** | < 30 | Allow; passive indicator | Allow; passive indicator |
| **Medium** | 30 – 59 | **Warn** with evidence-based explanation | AI advisory escalation → re-evaluated pass |
| **High** | ≥ 60 | **Block** | **Block** |

Threshold values are empirical (§13.2). The **structure** — three tiers, Medium as the escalation band, High as the only blocking tier — is frozen.

### 9.5 Recorded Outputs

Every Analysis Pass Result SHALL record: the complete finding set including suppressed findings; each finding's base weight, applied suppressions, and effective weight; the subsumption set applied; the aggregate score; the resulting tier; and the rule-set version.

This record is what makes a decision explainable to a user, reproducible by a developer, and auditable by an examiner.

---

## 10. Subsumption Model

### 10.1 Composite Findings Reference Evaluations, Not Findings

A composite Correlation Finding SHALL reference the **union of the Security Evaluations** referenced by its constituents. It SHALL NOT reference the constituent Correlation Findings themselves.

**Rationale.** The Domain Model permits a Correlation Finding to reference Security Evaluations and prohibits it from deriving directly from Security Evidence. It provides no mechanism for finding-to-finding derivation, and introducing one would create a graph requiring cycle prevention. Referencing the union preserves complete traceability while remaining within the ratified model — no amendment is required.

### 10.2 Provenance

The emergence of a composite SHALL be recorded in the finding's **Correlation Context** — an element already defined in the Correlation Finding Contract. Correlation Context carries the pass in which the composite emerged and the constituent conjunction that produced it.

### 10.3 Subsumption Is a Property of the Rule Set

The rule set declares subsumption relationships of the form `COMPOSITE subsumes {A, B}`.

During aggregation, subsumed findings are excluded from the sum and the composite is counted alone. This prevents double counting: were a composite simply added alongside its constituents, the same underlying facts would be counted twice and the threshold model would collapse.

**Findings themselves remain immutable.** Subsumption is applied by the aggregation function, not recorded on the finding. A finding does not know it has been subsumed; the scorer does. Subsumed findings remain fully present and traceable in the Analysis Session.

### 10.4 Subsumption Table — v0.1

| Composite | Subsumes |
|---|---|
| *(empty)* | — |

**The table is intentionally empty.** No composite rules are defined in v0.1 (§21).

**The aggregation engine SHALL nonetheless implement subsumption from the outset.** With an empty table the mechanism is inert, and adding composites later becomes a rule-set data change rather than an engine modification. This is a small design cost now in place of a structural refactor later.

---

## 11. Current Security State

### 11.1 Recomputation

Current Security State SHALL be recomputed after every pass and replaced wholesale. It SHALL NOT be incrementally adjusted, and prior values SHALL NOT be retroactively edited.

It holds the latest score, the latest tier, the rule-set version under which they were computed, and a reference to the Analysis Pass Result that produced them.

### 11.2 Analysis History

Every Analysis Pass Result SHALL be appended to Analysis History. Entries SHALL NOT be edited or deleted. Analysis History is the immutable record; Current Security State is the current belief.

### 11.3 Monotonic Escalation

Within one Analysis Session, the tier SHALL NOT be lowered below any tier that has already produced a user-facing intervention.

**Rationale.** A page that warns at pass 3 and reports Low at pass 4 leaves the user having been warned about a site the product now calls safe. Beyond being confusing, it is deliberately engineerable: an attacker who can trigger a benign-looking later pass could otherwise retract a warning already shown.

A later pass MAY raise the tier freely. Escalation is unconstrained; de-escalation past an intervention is prohibited.

### 11.4 Intervention Lock

Once a Tier 2 gate has produced a warning or a block within a Session, that intervention SHALL be recorded as final for the Session. Subsequent passes MAY escalate it. They SHALL NOT withdraw it.

A new navigation creates a new Session and is unaffected by a prior Session's lock.

---

## 12. Rule Versioning

### 12.1 Rules Are Data, Not Code

The rule set — predicates, weights, thresholds, suppression definitions, refinement membership lists, the IdP registry, and the subsumption table — SHALL be expressed as a **versioned data artifact**, external to the engine. Weights SHALL NOT be hard-coded.

### 12.2 Released Versions Are Immutable

A released rule-set version SHALL NOT be edited. Any behavioural change REQUIRES a new version. Prior versions SHALL remain available for reference.

This reuses, unchanged, the versioning pattern already ratified for Normalization Policy in the Persistence Architecture Specification (§16, §40, ADR-006). No new governance mechanism is introduced.

### 12.3 Version Recorded in Every Session

Every Analysis Session SHALL record the rule-set version under which it was evaluated.

### 12.4 Historical Replay

Because findings are immutable and scoring is a pure function of the finding set and the rule-set version, any historical Analysis Session SHALL be reconstructable and re-scorable:

- **Reconstruction** — replaying a Session under its recorded version SHALL reproduce its original decision exactly.
- **Re-scoring** — replaying a Session under a later version yields that version's decision, enabling regression measurement of rule changes against historical data without re-crawling.

The determinism claim is therefore precise: **deterministic given rule-set version N**, rather than deterministic in the abstract.

---

## 13. Implementation Constraints

### 13.1 Architecturally Frozen

The following SHALL NOT be altered without a version increment and the governance process of §22:

- The evaluation pipeline stage order (§4.1)
- The domain mapping and immutability guarantees (§2)
- The Analysis Session lifecycle and the identity rule *one Session = one Target Resource = one navigation* (§3)
- The tier model and the rule that only Tier 2 may intervene (§3.2)
- Suppression semantics: monotonic, maximum-not-product, guarded, non-destructive (§6.1)
- Aggregation as a pure function over the complete finding set (§9.1)
- The subsumption model (§10)
- Monotonic escalation and the intervention lock (§11.3–11.4)
- Rule-set versioning and immutability of released versions (§12)
- The invariant that no single primary finding reaches High (§1.5)
- The exclusion of AI from deterministic stages (§1.4)
- Privacy as a non-scoring surface (§8.2)

Added at specification v0.2:

- Retention of Retired rules in the rule set (§14.2)
- The failure-semantics governing principle: degraded capability recorded, never silent (§15.1)
- Fail-closed handling of rule-set unavailability and partial load (§15.3)
- Atomicity of a pass (§15.4)
- The prohibition on network I/O at Tier 0 and Tier 1 (§16.1)
- Bounded storage growth (§16.4)
- The deterministic replay release gate (§17.2)
- Analysis Session state invariants (§19.3)

Added at specification v0.3:

- The Authentication History Store never-transmit invariant and sync exclusion (§20.2)
- The store data inventory and day-granularity constraint (§20.1, §20.3)
- Provisional expiry and non-expiry of established entries (§20.4)
- Poisoning guards G-01 through G-05, and their exclusion from the evaluation pipeline (§20.6)
- Origin as trust anchor; fingerprint delta produces no warning (§20.7)
- Private-browsing read-never-write (§20.8)
- User visibility and deletion of store contents (§20.9)

Added at specification v0.4:

- Analysis Session ownership of Analysis Pass Result and Advisory Finding (§2.5)
- The Authentication History Store is read only by the Authentication Context Evaluation Module (§20.11)
- The ACEM is read-only with respect to the store; store writes occur outside the evaluation pipeline (§20.11)

Added at specification v0.5:

- Cross-version fingerprint comparison is prohibited; version mismatch yields `unevaluable`, never absence of match (§20.11)

Added at specification v0.6:

- The Internal Evaluation Module Register is closed at ten modules; a rule SHALL NOT reference an evaluation source absent from it (§2.6)
- Modules report observed facts; predicate refinements R-01 through R-04 are applied at Stage 2, never inside a module (§2.6, §5.1)

Added at specification v0.7:

- A rule predicate SHALL NOT read the in-flight finding set of the current pass; cross-pass predicates read committed prior-pass state only (§7.2, DL-01)

Added at specification v0.8:

- Benchmark splits are keyed on registrable domain, assigned at capture, immutable thereafter (§13.3)
- Residual cross-split duplication is reported, never resolved by re-splitting (§13.3)

### 13.2 Empirically Tunable

The following are **starting hypotheses**, not architectural constants. They SHALL be determined by measurement and SHALL NOT be the subject of further architectural debate:

- All rule weights
- Threshold values (30 / 60)
- Fingerprint similarity threshold τ_sim and drift tolerance
- Fingerprint feature weighting
- Download type membership (R-02) and sensitive permission membership (R-03)
- PM-01 page-age threshold
- CRED-04 redirect hop threshold
- A-01 trust validity period
- Establishment thresholds N (authentication count) and M (distinct days) for `PROVISIONAL` → `ESTABLISHED` (§20.4)
- Provisional entry expiry window (§20.4)
- Fingerprint collision threshold for guard G-03 (§20.6)
- Establishment rate bound for guard G-05 (§20.6)
- Successful-authentication inference thresholds (§20.5)
- Whether CRED-06, CRED-07, and CRED-A1 justify retention at all

### 13.3 Validation Requirements

Empirical parameters SHALL be determined against benchmark datasets under the following protocol:

- **Negative set** — a large sample of high-traffic legitimate sites, including regionally diverse and non-Latin-script sites, so that CRED-03's internationalization risk is actually measured rather than assumed.
- **Positive set** — phishing URLs captured live. Phishing infrastructure is short-lived; archived sets systematically misrepresent live behaviour.
- **Split discipline** — data SHALL be partitioned into training, validation, and held-out test sets. Weights and thresholds SHALL be tuned on training and validation only. **Reported metrics SHALL come from a test set never used during tuning.** Tuning and reporting on the same data is the most common methodological failure in work of this kind and invalidates every number produced.
- **Unit of independence** *(amended at specification v0.8)* — splits SHALL be keyed on the **registrable domain** (eTLD+1), so that every capture of a site falls permanently in one split. Assignment occurs at capture time and is immutable thereafter (D0.5 S-2). Keying on a per-capture identifier is PROHIBITED: it places repeat captures of one URL in different splits.
- **Residual leakage is reported, not re-split.** Domain keying does not address the dominant duplication mode — one phishing kit mass-deployed across many registrable domains. Eliminating that would require clustering the corpus before assigning splits, surrendering the capture-time immutability that makes a re-split impossible rather than merely discouraged. The residual SHALL therefore be measured and published. Every reported result SHALL be accompanied by:
  - **Cross-split kit duplication rate** — the proportion of test-split snapshots having a near-duplicate (content hash or structural fingerprint) in the training split.
  - **Temporal holdout metrics** — performance on the most recent capture window, excluded from all tuning, reported separately. This measures generalization to future phishing, which is the claim the platform actually makes.
  - **CRED-02 brand overlap** — the proportion of test-split phishing snapshots whose impersonated brand also appears in training. Reported, never split upon: a novel kit impersonating a familiar brand is the generalization being measured, not contamination.
- **Statistical power** — domain keying reduces effective independent units from snapshots to domains. Confidence intervals SHALL be reported alongside every rate; a false-positive rate quoted without one on a corpus of this size is misleading. Snapshot-level and domain-level split proportions SHALL both be reported, since domains carry unequal snapshot counts.
- **Metrics** — precision, recall, false-positive rate, F1, and the full confusion matrix. **Accuracy SHALL NOT be reported**: on a corpus that is overwhelmingly benign, a classifier that approves everything scores near-perfect accuracy while providing no protection.
- **False-positive budget** — a maximum acceptable false-positive rate on the negative set SHALL be fixed **before** tuning begins and treated as a hard constraint, not an outcome. An uninstalled extension prevents nothing.
- **Baseline comparison** — detection SHALL be reported as **marginal catch** against existing browser protection: the share of the positive set missed by the incumbent baseline and caught by SecureSphere X. This, not absolute detection rate, is the platform's measurable contribution.
- **Outcome metric** — the operational success measure is **compromising actions prevented at Tier 2 gates**, not classification accuracy over a URL list.

### 13.4 Platform Constraints

- **Service worker lifecycle.** The background service worker terminates when idle. All state required across passes SHALL be persisted to extension storage. No handler may assume warm state or in-memory continuity between passes.
- **Evidence availability.** Certificate chain detail, DNS records, and reputation data are not directly available to a browser extension. Where required, they SHALL be obtained through backend services at Tier 2 only, never at Tier 0 or Tier 1.
- **Transmission minimization.** Because Tier 0 and Tier 1 are local-only and Tier 2 fires rarely, backend transmission is bounded to a small fraction of navigations. This bound is a **design property of the tier model** and SHALL be preserved: introducing backend lookup into Tier 0 or Tier 1 would silently void it.

---

## 14. Rule Lifecycle and Governance

### 14.1 Semantic Versioning Policy

Rule-set versions take the form `rules-vMAJOR.MINOR.PATCH`.

| Component | Increments when | Requires |
|---|---|---|
| **MAJOR** | Any item enumerated in §13.1 changes | Specification version increment and architecture review |
| **MINOR** | A rule is added, retired, or its predicate altered; a suppression or refinement is added or altered | Regression validation (§17.3) |
| **PATCH** | Weights, thresholds, or §13.2 empirical parameters are recalibrated | Regression validation (§17.3) |

A PATCH change SHALL NOT alter which rules exist or what their predicates mean. If a calibration cannot be expressed as a weight or threshold change, it is not a PATCH.

### 14.2 Rule Lifecycle States

| State | Meaning | Evaluated? | Retained in rule set? |
|---|---|---|---|
| **Proposed** | Defined but not released | No | No |
| **Active** | Released and evaluated | Yes | Yes |
| **Deprecated** | Scheduled for removal; still evaluated; findings marked deprecated | Yes | Yes |
| **Retired** | No longer evaluated | No | **Yes** |

**Invariant.** A Retired rule SHALL remain present in the rule set definition.

*Rationale.* Historical replay (§12.4) requires that a Session evaluated under a version in which a rule was Active can be reconstructed. Deleting the definition would make historical Sessions unreplayable and silently break the audit chain.

*Verification.* Replay of the golden corpus (§17.2) under the current version SHALL resolve every rule identifier referenced by any historical Session.

### 14.3 Ownership

Each rule SHALL carry a named owner (§18.1). For a team of this size, ownership means **the person responsible for that rule's empirical validation and false-positive budget**, not an approval gate. Approval workflow beyond the versioning policy above is deliberately not specified; a formal approval board would be process without function at this team size.

---

## 15. Failure Semantics

### 15.1 Governing Principle

> **Invariant.** Degraded capability SHALL be recorded, never silent. The engine SHALL NOT substitute a default, an assumption, or a neutral value for evidence it could not obtain.

*Rationale.* Every failure in this engine degrades **protection**, and protection failures are invisible by nature — a rule that cannot evaluate produces no finding, which is indistinguishable at the output from a rule that evaluated and found nothing. Without explicit recording, a total failure of the fingerprint store would present as a clean bill of health for every phishing page the user visits.

*Verification.* Fault-injection tests (§17.4) SHALL confirm that each failure mode below produces the specified marker in the Analysis Pass Result.

### 15.2 Capability Markers

Every Analysis Pass Result SHALL record a **capability set**: which rules were evaluable, which were not, and why. A rule that could not be evaluated SHALL be recorded as `unevaluable(reason)` — never as `no finding`.

Where any rule in the CRED family is unevaluable, the pass SHALL be marked **degraded**, and the user-facing indicator SHALL NOT present an unqualified safe state.

### 15.3 Failure Modes and Policies

| Dependency | Failure | Policy | Direction |
|---|---|---|---|
| **Rule set** | Cannot load, or fails integrity check | Fall back to last known-good version and record the fallback. If no known-good version exists, the engine SHALL NOT evaluate; Tier 2 gates SHALL warn on the basis of unavailable protection. | **Fail-closed** |
| **Rule set** | Loads partially | SHALL NOT be used. A partial rule set produces confidently wrong scores, which is worse than none. | **Fail-closed** |
| **Fingerprint store** | Unavailable or corrupt | AuthContext Evaluation recorded `unevaluable(store_unavailable)`; CRED-02 and S-01 consequently unevaluable; pass marked degraded. Store rebuilt empty and treated as cold start. User SHALL be notified that impersonation protection is rebuilding, because the loss is not otherwise observable to them. | Fail-open on score, **fail-loud on record** |
| **Fingerprint store** | At capacity | LRU eviction per §16.4. Eviction is normal operation, not failure, and is not marked degraded. | Normal |
| **IdP registry** | Unavailable | Registry is bundled with the rule set; its unavailability is rule-set unavailability and follows that policy. It SHALL NOT be fetched at evaluation time. | **Fail-closed** |
| **Backend evidence service** | Unreachable at Tier 2 | Rules requiring backend evidence recorded `unevaluable(backend_unreachable)`; pass marked degraded; local rules evaluate normally and the pass completes. | Fail-open on score, **fail-loud on record** |
| **AI advisory service** *(Phase II)* | Unreachable or times out | Medium resolves to Phase I behaviour: Warn with evidence-based explanation. The deterministic pipeline SHALL NOT block awaiting advisory input. | **Graceful degradation** |
| **AI advisory service** | Returns malformed output | Discarded; treated as unreachable. An Advisory Finding SHALL NOT be constructed from unparseable output. | **Graceful degradation** |
| **Local session storage** | Corrupt | Current Session abandoned and recreated; prior Analysis History entries that fail integrity check are quarantined, not deleted. | Fail-safe |
| **Service worker** | Terminated mid-pass | Pass is not partially committed. On restart the pass SHALL be re-executed from persisted evidence, or abandoned and recorded as incomplete. | **Atomic pass** |

### 15.4 Atomicity of a Pass

**Invariant.** An Analysis Pass Result SHALL be committed atomically or not at all. A partially aggregated score SHALL NEVER be written to Current Security State.

*Rationale.* The service worker terminates without warning (§13.4). A pass interrupted between aggregation and threshold evaluation would otherwise leave Current Security State holding a score computed from an incomplete finding set.

*Verification.* Termination-injection tests SHALL confirm that Current Security State after an interrupted pass equals its value before that pass.

### 15.5 What Failure SHALL NOT Do

- Failure SHALL NOT downgrade a tier already reached (§11.3 applies unconditionally).
- Failure SHALL NOT withdraw an intervention already presented (§11.4 applies unconditionally).
- Failure SHALL NOT cause a finding to be created. Suppression monotonicity (§6.1) extends to failure handling: no failure path may increase risk either.

---

## 16. Non-Functional Requirements

All values in this section are **budgets**, not measurements. They are constraints that implementation SHALL satisfy and that §17 SHALL verify. Where a budget proves unachievable, the correct response is a specification amendment, not a silent overrun.

### 16.1 Latency Budgets

| Stage | Budget | Measured at |
|---|---|---|
| Tier 0 pass, end to end | ≤ 10 ms | Navigation commit to Current Security State update |
| Tier 1 pass, end to end | ≤ 50 ms | DOM ready to Current Security State update |
| Tier 2 pass, local evidence only | ≤ 200 ms | Gate trigger to decision |
| Tier 2 pass, including backend evidence | ≤ 1000 ms at p95 | Gate trigger to decision |
| AI advisory escalation *(Phase II)* | ≤ 3000 ms hard timeout | Invocation to response or abandonment |

**Invariant.** Tier 0 and Tier 1 SHALL NOT perform network I/O.

*Rationale.* These budgets are unachievable with a network round trip, and the transmission-minimization property of §13.4 depends on them.

*Verification.* Instrumented timing over the benchmark corpus, reported at p50 and p95.

### 16.2 Computational Complexity

| Operation | Required complexity |
|---|---|
| Predicate matching | O(R) in the number of rules |
| Suppression lookup | O(1) per finding, indexed |
| Aggregation | O(F) in the finding set size |
| Subsumption resolution | O(F) with a precomputed subsumption index |
| Fingerprint similarity search | O(log N) or better in stored origins; linear scan is PROHIBITED |

R and F are bounded by the rule set and are small constants at v0.1 (11 rules). The fingerprint search is the only operation whose input grows with use, and is therefore the only one where complexity is a genuine constraint rather than a formality.

### 16.3 Memory

Peak working-set memory during a Tier 2 pass SHALL remain within the extension service worker's operating envelope. No pass SHALL hold the complete fingerprint store in memory; similarity search SHALL operate over an index.

### 16.4 Storage Bounds

| Store | Bound | Eviction |
|---|---|---|
| Fingerprint store — origins | Bounded maximum; empirical (§13.2) | LRU by last successful authentication |
| Fingerprint store — per origin | 2–3 most recent | Oldest first |
| Analysis Sessions — retention | Bounded retention window; empirical | Oldest first, after Analysis History summarization |
| Analysis Pass Results per Session | Bounded maximum per Session | Session finalized on exceeding the bound; recorded as truncated |

**Invariant.** Storage growth SHALL be bounded. No store SHALL grow without limit as a function of browsing volume.

*Rationale.* An extension that consumes unbounded local storage will be uninstalled, and an uninstalled extension prevents nothing.

*Verification.* Sustained-browsing soak test reporting storage occupancy over time.

### 16.5 Scalability

The engine is per-client and single-user; there is no multi-tenant scaling dimension. Backend scalability concerns arise only from Tier 2 evidence requests, whose volume is bounded by gate frequency rather than navigation frequency — the design property recorded in §13.4.

---

## 17. Validation and Testing Architecture

### 17.1 Purpose

The specification claims determinism (§4.3), replayability (§12.4), suppression monotonicity (§6.1), and order-independence (§6.1). A claim that is not verified is an assumption. This section defines how each is verified and makes verification a **release gate** rather than an implementation note.

### 17.2 Deterministic Replay Gate

**Requirement.** No rule-set version SHALL be released until it has been replayed against the golden corpus.

**Golden corpus.** A frozen, version-controlled set of historical Analysis Sessions with their recorded evidence, findings, rule-set versions, and decisions.

Two replays are required:

1. **Reconstruction replay** — each Session replayed under its own recorded rule-set version SHALL reproduce its original decision exactly. Any divergence indicates a determinism defect and SHALL block release.
2. **Regression replay** — each Session replayed under the candidate version. Divergences are expected and SHALL be enumerated, reviewed, and justified. Unexplained divergence SHALL block release.

### 17.3 Regression Criteria

A candidate rule-set version SHALL NOT be released where, relative to the current release:

- False-positive rate on the held-out negative set increases beyond the fixed budget (§13.3);
- Recall on the held-out positive set decreases without documented justification;
- Any Session in the golden corpus changes from a High decision to Low, or Low to High, without an accompanying rule-change entry explaining it.

### 17.4 Test Classes

| Class | Verifies | Notes |
|---|---|---|
| **Predicate tests** | Each rule matches and fails to match correctly | Per rule; includes refinement application |
| **Suppression guard tests** | Each guard fires and, critically, **fails to fire** where it must not | The S-02 CRED-03 guard (§6.3) is a **security test**, not a functional one: without it, a confusable lookalike of a registry entry obtains automatic exemption |
| **Property tests** | Suppression monotonicity; order-independence of maximum reduction; aggravator neutralization on parent suppression | Randomized over generated finding sets |
| **Atomicity tests** | §15.4, via termination injection | |
| **Fault-injection tests** | Each failure mode in §15.3 produces its specified marker | |
| **Benchmark evaluation** | §13.3 protocol | Reported from held-out test set only |
| **Latency instrumentation** | §16.1 budgets | p50 and p95 |
| **Soak test** | §16.4 storage bounds | |

### 17.5 Verification of the Layered-Security Invariant

**Requirement.** A static check SHALL confirm, for every released rule set, that no primary rule's base weight reaches the High threshold (§1.5).

*Rationale.* This invariant is the numeric expression of the layered-security philosophy and is trivially violable by a PATCH-level weight change. It SHALL be machine-checked at release rather than trusted to review.

---

## 18. Rule Metadata

### 18.1 Required Metadata

Every rule in the rule set SHALL carry:

| Field | Purpose |
|---|---|
| **Identifier** | Stable across versions; SHALL NOT be reused after retirement |
| **Name** | Human-readable |
| **Owner** | Responsible for empirical validation and false-positive budget (§14.3) |
| **Introduced in** | Rule-set version |
| **Last modified in** | Rule-set version |
| **Lifecycle state** | Proposed / Active / Deprecated / Retired (§14.2) |
| **Rationale** | Why the rule exists; what it detects that no other rule does |
| **Empirical confidence** | Unvalidated / Provisional / Validated (§18.2) |
| **Known false-positive risks** | As enumerated in §7.2 |
| **CWE mapping** | Where applicable |
| **CAPEC mapping** | Where applicable |

### 18.2 Empirical Confidence Levels

| Level | Meaning |
|---|---|
| **Unvalidated** | Weight is a design-time hypothesis; no benchmark evidence exists |
| **Provisional** | Measured on the training and validation sets only |
| **Validated** | Measured on the held-out test set, meeting the false-positive budget |

**At v0.1, every rule is Unvalidated.** This SHALL be recorded honestly in the rule set rather than presented otherwise.

### 18.3 Threat Taxonomy Mapping

CWE and CAPEC mappings SHALL be recorded where a rule corresponds to a recognized weakness or attack pattern. This positions the rule base as a governed knowledge repository rather than a collection of predicates, and it materially strengthens external review.

**MITRE ATT&CK mapping is NOT adopted.** ATT&CK describes adversary tactics and techniques largely at post-compromise granularity; the credential-phishing entry point compresses to a single technique that would map identically to nine of eleven rules, conveying no information. Recording a mapping that does not discriminate would be governance theatre. CAPEC operates at the attack-pattern granularity these rules actually occupy and is the correct taxonomy here.

---

## 19. Analysis Session State Machine

### 19.1 States

| State | Meaning |
|---|---|
| `CREATED` | Session created; Target Resource bound; rule-set version recorded |
| `EVALUATING` | A pass is executing |
| `IDLE` | Pass complete; Current Security State current; awaiting a gate or navigation |
| `GATED` | A Tier 2 gate has triggered; user action pending decision |
| `ESCALATING` | AI advisory invoked *(Phase II only)* |
| `INTERVENED` | A warning or block has been presented to the user |
| `FINALIZED` | Session immutable and written to Analysis History |
| `ABANDONED` | Session terminated without finalization (e.g. storage failure) |

### 19.2 Transitions

| From | To | Trigger |
|---|---|---|
| `CREATED` | `EVALUATING` | Tier 0 pass begins |
| `EVALUATING` | `IDLE` | Pass committed |
| `EVALUATING` | `ABANDONED` | Unrecoverable failure (§15.3) |
| `IDLE` | `EVALUATING` | Tier 1 pass begins |
| `IDLE` | `GATED` | Tier 2 gate triggers |
| `IDLE` | `FINALIZED` | Navigation away, tab close, or timeout |
| `GATED` | `EVALUATING` | Tier 2 pass begins |
| `EVALUATING` | `ESCALATING` | Medium outcome, Phase II, advisory available |
| `ESCALATING` | `EVALUATING` | Advisory returned, or timeout (§15.3) |
| `EVALUATING` | `INTERVENED` | Warn or Block presented |
| `INTERVENED` | `EVALUATING` | Subsequent gate triggers a further pass |
| `INTERVENED` | `FINALIZED` | Navigation away, tab close, or timeout |

### 19.3 State Invariants

- **No return to `CREATED`.** A Session SHALL NEVER re-enter its initial state.
- **`FINALIZED` and `ABANDONED` are terminal.** No transition leaves either.
- **`INTERVENED` is absorbing with respect to de-escalation.** A Session that has entered `INTERVENED` SHALL NOT reach `IDLE` in a state representing a lower tier than the one that produced the intervention (§11.3, §11.4).
- **`ESCALATING` is reachable only from `EVALUATING`, and only in Phase II.** In Phase I the state is unreachable and SHALL be rejected as invalid.
- **A pass executes only in `EVALUATING`.** No finding SHALL be generated, and no Current Security State update performed, in any other state.

*Verification.* A state-transition test SHALL assert that every transition not enumerated in §19.2 is rejected.

---

## 20. Authentication History Store

### 20.1 Purpose and Scope

The Authentication History Store is the local backing store for CRED-02 (§7.2). It records **authentication events**, not navigation.

**Invariant.** The store SHALL record only origins at which the user has successfully authenticated, together with the fingerprints of the login interfaces observed there. It SHALL NOT record general browsing activity.

*Rationale.* CRED-02 requires authentication history, not browsing history. A record of pages the user merely visited would add no detection capability while creating a behavioural profile the platform has committed not to hold. The minimal store is therefore the correct engineering choice independently of its privacy properties.

*Consequence.* SecureSphere X's strongest detection signal requires **no transmission of any kind**. Where backend evidence lookups create a privacy cost (§13.4), CRED-02 creates none.

*Verification.* A store audit test SHALL confirm that no entry exists for any origin at which no authentication event was recorded.

### 20.2 Never-Transmit Invariant

**Invariant.** The Authentication History Store SHALL NEVER be transmitted off-device, in whole or in part, in any form, including hashed, aggregated, or derived form. No store content SHALL be included in any backend request, telemetry, diagnostic payload, crash report, or synchronization mechanism.

**Sync exclusion.** The Software Architecture Design lists cross-device synchronization of user preferences as a future enhancement. The Authentication History Store is **explicitly and permanently excluded** from any such mechanism. A synchronization feature SHALL enumerate what it transmits; it SHALL NOT transmit "user data" as an undifferentiated category.

*Rationale.* Privacy guarantees rarely fail by decision. They fail when a later feature transmits a category of data whose exclusion was assumed but never written down. Recording the exclusion as an invariant now is the only reliable protection against that.

*Verification.* A transmission audit test SHALL assert that no code path reachable from a network request constructor can read the store. This test SHALL be part of the release gate (§17).

### 20.3 Data Inventory

| Stored | NOT stored |
|---|---|
| Origin (scheme, host, port) | Full URL, path, query string, or fragment |
| Login-interface fingerprint feature vector | Raw DOM, page content, or screenshots |
| First-seen and last-seen date, **day granularity** | Precise timestamps |
| Successful-authentication count | Usernames, email addresses, or any credential material |
| Lifecycle state (§20.4) | Cookies, tokens, or session identifiers |
| Fingerprint revision history (2–3 most recent) | Any navigation not resulting in authentication |

**Invariant.** Temporal data SHALL be stored at day granularity.

*Rationale.* Precise timestamps across a set of origins reconstruct a behavioural timeline. Dates do not, and CRED-02 requires nothing finer.

### 20.4 Entry Lifecycle

| State | Meaning | Eligible for S-01 suppression | Evaluated by CRED-02 |
|---|---|---|---|
| `PROVISIONAL` | Fewer than N successful authentications, or spanning fewer than M distinct days | **No** | Yes — origin is not yet trusted |
| `ESTABLISHED` | N successful authentications across M distinct days | Yes | No — origin is trusted |
| `EVICTED` | Removed under storage pressure or by user action | — | — |

**Transitions:**

| From | To | Trigger |
|---|---|---|
| *(none)* | `PROVISIONAL` | First successful authentication, subject to §20.6 guards |
| `PROVISIONAL` | `ESTABLISHED` | N authentications across M distinct days |
| `PROVISIONAL` | `EVICTED` | Inactivity beyond the provisional expiry window |
| `ESTABLISHED` | `PROVISIONAL` | Demotion under G-04 (§20.6) |
| `ESTABLISHED` | `EVICTED` | LRU eviction under storage pressure (§16.4); user deletion |
| any | `EVICTED` | User deletion (§20.9) |

**Invariant — provisional entries expire; established entries do not expire on inactivity.**

*Rationale.* A provisional entry is an incomplete judgment. Retaining it indefinitely leaves a once-visited malicious origin waiting for an attacker to complete its establishment; expiry bounds that window at no protective cost, since a user who did not return had no relationship with the site.

Established entries serve a second purpose beyond suppression: the stored fingerprint detects **clones of sites the user has used**, whether or not they have used them recently. Expiring on inactivity would discard protection precisely for seasonal, high-value services — tax portals, enrolment systems, annual renewals — which are among the most heavily targeted. Established entries are therefore bounded only by LRU pressure (§16.4).

*Consequence.* An LRU-evicted origin re-encountered later begins again as `PROVISIONAL`.

### 20.5 Learning Policy

Successful authentication is not directly observable and SHALL be inferred from the conjunction of: credential submission, subsequent navigation, absence of a credential interface on the resulting page, and establishment of session-scoped storage or cookie state.

**Requirement.** The inference SHALL be calibrated restrictively and loosened only on measured evidence.

*Rationale.* The two error directions are not symmetric. An over-permissive inference writes wrong entries into the store and degrades CRED-02 for the lifetime of those entries. An over-restrictive inference leaves the store sparse and delays protection. A store that learns slowly is materially safer than one that learns wrongly.

### 20.6 Poisoning Protections

**Threat.** A user phished before the store has learned the corresponding legitimate origin may authenticate at the malicious origin, writing it into the store. Once `ESTABLISHED`, S-01 (§6.2) would nullify CRED-02 at that origin permanently, converting a single successful attack into a standing exemption from the platform's strongest rule.

**This is a first-order concern, not defense-in-depth.** CRED-02 is cold by construction at first use, and a phishing page that posts same-origin over valid TLS from a plausible, non-confusable domain reached by direct navigation evades CRED-01, CRED-03, CRED-04, CRED-05, and CRED-06 simultaneously. On that class of page CRED-02 is not a backstop; it is the only rule remaining.

The following guards SHALL apply at write time.

**G-01 — No learning from a flagged session.**
An origin SHALL NOT be recorded where any CRED-family finding was active and unsuppressed on the Analysis Session in which the authentication occurred.

**G-02 — No learning from an overridden intervention.**
An origin SHALL NOT be recorded where the user proceeded past a Warn or Block within that Session.

*Rationale.* User override is the strongest available negative signal about an origin. Learning from it inverts the meaning of the intervention.

**G-03 — Fingerprint collision check at write.**
Before creating a new entry, the candidate fingerprint SHALL be compared against `ESTABLISHED` entries at other origins. A match above the collision threshold SHALL prevent the write and SHALL be recorded as a high-confidence impersonation observation.

*Rationale.* A new origin presenting the login interface of an established one is precisely the CRED-02 condition. The store defends itself using the rule it exists to support, at the cost of one indexed lookup already required by §16.2.

**G-04 — Asymmetric learning and unlearning.**
Establishment SHALL be slow; revocation SHALL be immediate. An `ESTABLISHED` entry that subsequently produces a high-confidence CRED finding SHALL be demoted to `PROVISIONAL` or evicted.

*Rationale.* Trust that takes days to earn and moments to lose fails in the safe direction.

**G-05 — Establishment rate bound.**
The rate at which origins reach `ESTABLISHED` SHALL be bounded. Anomalous establishment bursts SHALL be recorded for review.

**Invariant.** Guards G-01 through G-05 apply to store writes only. They SHALL NOT create, suppress, or reweight any Correlation Finding — the store is not part of the evaluation pipeline (§4.1), and its guards SHALL NOT become an undocumented scoring path.

### 20.7 Fingerprint Refresh Policy

**Invariant.** The **origin** is the trust anchor. The **fingerprint** is not.

Trust is keyed on origin membership. A legitimate site that completely redesigns its login interface therefore remains trusted without qualification: S-01 continues to apply, and CRED-02 continues not to evaluate against it. A redesign carries **no false-positive risk**.

What degrades is the fingerprint's usefulness for detecting clones of the site's *current* appearance. Accordingly:

- The fingerprint SHALL be refreshed on every successful authentication at an `ESTABLISHED` origin.
- The 2–3 most recent revisions SHALL be retained, so that clones of both prior and current designs are detected during a transition period.

**Requirement.** A large fingerprint delta at an established origin SHALL NOT produce a user-facing warning. It SHALL be recorded only.

*Rationale.* Sites redesign routinely. Warning on delta would fire continuously on legitimate traffic.

**Stated limitation.** A large fingerprint delta at an established origin is **indistinguishable, using only local evidence, from compromise of the legitimate site**. SecureSphere X cannot separate these cases and does not claim to. The delta is logged for offline analysis; no action is taken. This limitation is recorded explicitly rather than left to be discovered.

### 20.8 Private Browsing

**Invariant.** In private or incognito browsing contexts the store SHALL be **read but never written**.

*Rationale.* Reading preserves CRED-02 protection in private contexts, where phishing risk is not lower. Writing would persist private-context activity to durable storage, defeating the purpose of the mode.

### 20.9 User Transparency and Control

**Requirement.** The extension SHALL present the complete contents of the Authentication History Store to the user — every origin, its lifecycle state, and its dates — and SHALL provide per-entry deletion and bulk clearing.

**Origins are stored in plaintext, not hashed.** CRED-02 requires only equality tests and would function over hashed origins, but a hashed store cannot support the explanation *"this page resembles the login interface of a site you have used"* with the site named. That explanation is the mechanism by which the warning persuades, at the one moment persuasion matters.

*Rationale.* Against an adversary with local device access, hashing provides marginal protection while removing the user's ability to inspect what is held about them. Transparency and deletion are the stronger privacy posture: the user gains knowledge and control rather than the data gaining slight obscurity.

### 20.10 Failure Behaviour

Store failure modes are specified in §15.3. Restated for completeness: unavailability or corruption renders the AuthContext Evaluation `unevaluable(store_unavailable)`, and CRED-02 and S-01 unevaluable in consequence, marks the pass **degraded**, and SHALL be surfaced to the user, because the loss of impersonation protection is not otherwise observable to them. The store is rebuilt empty and treated as cold start.

---

### 20.11 Authentication Context Evaluation Module

**Purpose.** The Authentication Context Evaluation Module (ACEM) is the sole architectural path between the Authentication History Store and the evaluation pipeline. It is an **Internal Evaluation Module** and conforms to the same contract and the same prohibitions as the seven modules defined in the ECE module specifications.

**Invariant.** The Authentication History Store SHALL be read only by the ACEM. No correlation rule, suppression, or aggregation stage SHALL query the store directly.

*Rationale.* Determinism (§4.3) and replay (§12.4, §17.2) require that every input to correlation be a recorded object. A store queried live during correlation is a hidden, mutable input: replaying that Session later would query a store whose contents have since changed, and CRED-02 — the platform's most important rule — would not be reproducible. Routing the store through an evaluation makes its contribution an ordinary recorded input, and the replay gate then verifies CRED-02 as it verifies every other rule.

*Consequence.* This also discharges the §20.6 requirement that store guards not become an undocumented scoring path. The store's contribution to a decision is now visible in exactly one place: a persisted Security Evaluation.

**Position in the pipeline.** Stage 1 (Module Evaluation), alongside the other Internal Evaluation Modules. It reads no other module's output and is read by none.

**Evaluation output.** Conforming to the standard five-element Evaluation Result structure, the ACEM reports:

| Element | Content |
|---|---|
| Origin presence | Whether the current origin is present in the store |
| Lifecycle state | `PROVISIONAL`, `ESTABLISHED`, or absent (§20.4) |
| Fingerprint drift | For a present origin, similarity between the current page and the stored fingerprint revisions |
| Best cross-origin match | For an absent origin, the highest-similarity `ESTABLISHED` entry at a different origin, with its origin and similarity score |
| Store availability | Available, unavailable, or rebuilding — feeding the capability set of §15.2 |

**Prohibitions.** Consistent with every other Internal Evaluation Module, the ACEM SHALL NOT correlate its findings with other evaluations, SHALL NOT assign a confidence level, SHALL NOT determine whether a website is phishing, legitimate, or malicious, and SHALL NOT produce a Security Decision. It reports the observed authentication context and nothing further.

**Write path is separate.** The ACEM is read-only with respect to the store. Store writes, and the guards of §20.6 that govern them, occur outside the evaluation pipeline and SHALL NOT be performed by the ACEM.

*Rationale.* An evaluation module that mutated its own evidence source would make a pass non-idempotent and would break replay: re-executing the pass would produce different results from the first execution.

**Fingerprint algorithm versioning.** *(added at specification v0.5)*

Stored fingerprints carry the algorithm version under which they were produced (§20.3, D0.1). Feature composition, normalization, and hash functions differ between versions, so a similarity score computed across versions is numerically valid and semantically meaningless.

**Invariant.** The ACEM SHALL compare a page fingerprint only against stored revisions produced under the same algorithm version. Where an entry holds no revision at the current version, the ACEM SHALL report `unevaluable(fingerprint_version_mismatch)`. It SHALL NOT report absence of a match.

*Rationale.* Reporting "no similar fingerprint found" on a version mismatch would convert an algorithm upgrade into a silent, fleet-wide suppression of CRED-02 — the exact failure mode §15.1 exists to prevent. Migration is not an available alternative: perceptual hashes and token sets are lossy, and a stored fingerprint cannot be recomputed into a later version without the original page.

*Consequence.* Recovery is automatic and requires no migration path. §20.7 refreshes the fingerprint on every successful authentication at an established origin, so entries re-acquire a current-version revision as users re-authenticate. Because §20.7 makes the **origin** the trust anchor and the fingerprint an artifact, a version mismatch degrades clone detection only: the origin remains `ESTABLISHED`, S-01 continues to apply, and no origin regresses to warning.

*Transitional note.* Since §20.7 retains 2–3 revisions per origin, an entry may hold mixed-version revisions during a transition. Only current-version revisions are eligible for comparison.

*Verification.* A test SHALL confirm that a version-mismatched entry produces `unevaluable(fingerprint_version_mismatch)` and not an absent-match evaluation.

---

## 21. Future Work — Not Part of v0.1

Explicitly deferred. These SHALL NOT be implemented under `rules-v0.1`:

- **Composite findings.** No cross-family conjunction is yet known to occur often enough to justify one. Candidates SHALL be identified from measured co-occurrence in the evaluation data, not by design.
- **AI-assisted rule generation.**
- **Adaptive weighting.** Weights are tuned offline against benchmark data and released as a new rule-set version. Runtime adaptation would void reproducibility and historical replay.
- **Reputation learning.**
- **Additional correlation families**, including the reserved JS-xx family.

---

## 22. Architecture Freeze Statement

> This specification represents the frozen Rule Engine Architecture (v0.1) for SecureSphere X. From this point onward, architectural modifications require explicit version increments. Future work should focus on implementation, empirical validation, dataset evaluation, performance measurement, and iterative tuning rather than architectural redesign.

**Scope of the freeze.** The freeze binds the items enumerated in §13.1. It does **not** bind the parameters enumerated in §13.2, which are expected to change repeatedly as measurement proceeds and whose adjustment requires only a rule-set version increment, not architectural review.

**Amendment.** A change to any item in §13.1 constitutes an architecture-level change, requires a specification version increment, and is subject to the governance process defined in the Persistence Architecture Specification §43.

---

## Appendix A — Inconsistencies Resolved During Consolidation

Four contradictions were identified while consolidating and are resolved as follows. Each is recorded here because a freeze document should make its own edits visible.

**A.1 — Position of predicate refinements in the pipeline.**
The consolidation brief listed predicate refinements as a pipeline stage occurring *after* Correlation Finding generation, while also stating that refinements are evaluated during rule matching and never afterward. These cannot both hold. **Resolved** in favour of the latter: refinements are applied within Stage 2 (§4.2, §5.1), because a predicate has no meaning until its terms are defined.

**A.2 — Misclassification of two suppression rules.**
Two rules previously listed as suppressions were not suppressions. The same-site subdomain rule defines what "cross-origin" *means* and is now predicate refinement R-01. The rule that findings cannot fire absent their required evidence is ordinary non-matching, not suppression, and is now recorded as §5.6. **Resolved** by reclassification; two genuine suppressions (S-01, S-02) and one allowlist mechanism (A-01) remain.

**A.3 — Two rules carried standalone weight they cannot support.**
The injected-login-form rule and the filename/MIME-mismatch rule would fire across a large share of legitimate traffic if evaluated standalone. **Resolved** by reclassifying both as aggravators (CRED-A1, DL-02) requiring a parent finding, and by defining the aggravator mechanism in §9.3.

**A.4 — Threshold boundary at the layered-security invariant.**
CRED-02 (50) combined with its aggravator CRED-A1 (+10) reaches exactly the High threshold (60). An aggravator is not independent, so the §1.5 invariant as stated is not violated, but the boundary is tight. **Resolved** by stating the invariant precisely in terms of *primary* findings and flagging the boundary for empirical review (§1.5, §13.2).

---

## Appendix B — Identifier Crosswalk

Review-stage identifiers map to frozen identifiers as follows. No rule was added or removed.

| Review ID | Frozen ID | Change |
|---|---|---|
| CF-01 | CRED-01 | Family prefix |
| CF-02 | CRED-02 | Family prefix |
| CF-03 | CRED-03 | Family prefix |
| CF-04 | CRED-04 | Family prefix |
| CF-05 | CRED-05 | Family prefix |
| CF-06 | CRED-06 | Family prefix |
| CF-07 | CRED-A1 | Family prefix; **demoted to aggravator** (A.3) |
| CF-08 | PM-01 | Family prefix |
| CF-09 | DL-01 | Family prefix |
| CF-10 | DL-02 | Family prefix; **demoted to aggravator** (A.3) |
| CF-11 | CRED-07 | Family prefix; renumbered to keep primaries contiguous |
| S-01 | S-01 | Unchanged |
| S-02 | S-02 | Unchanged; CRED-03 guard added |
| S-03 | R-01 | **Reclassified** as predicate refinement (A.2) |
| S-04 | §5.6 | **Reclassified** as non-matching (A.2) |
| — | A-01 | User-trusted origin allowlist, formalized |

---

*End of Specification.*

---

## Appendix C — Disposition of Enterprise Architecture Review

Seven recommendations were received. Disposition:

| # | Recommendation | Disposition | Location |
|---|---|---|---|
| 1 | Rule Governance | **Adopted in part.** Semantic versioning policy and rule lifecycle states adopted. Formal approval workflow **declined** — at this team size an approval board is process without function; the versioning policy already gates what matters. | §14 |
| 2 | Non-Functional Requirements | **Adopted.** Stated as budgets to be verified, not as measurements. | §16 |
| 3 | Failure Semantics | **Adopted in full.** Assessed as the single most valuable recommendation in the review. | §15 |
| 4 | Validation and Testing Architecture | **Adopted.** Deterministic replay elevated from implementation note to release gate. Dataset protocol retained in §13.3 and cross-referenced rather than duplicated. | §17 |
| 5 | Rule Metadata | **Adopted in part.** Provenance, lifecycle, empirical confidence, CWE and CAPEC adopted. **MITRE ATT&CK declined** with rationale. | §18 |
| 6 | Analysis Session State Machine | **Adopted.** | §19 |
| 7 | Declarative rewrite (Requirement → Rationale → Verification) | **Adopted in part.** Verification clauses added to invariants, which is the substantive half of the recommendation. Removal of rationale prose **declined** — see below. | Throughout |

**On recommendation 7.** The review characterizes explanatory prose as a weakness relative to declarative specification. That is correct for a specification whose readers already share the design context. It is incorrect here.

This document's readers are the implementing team and an academic examination panel. For the first, the rationale is what prevents an invariant from being violated during implementation — a developer who knows *why* suppression takes the maximum rather than the product will not "optimize" it into a product. For the second, the rationale is the assessed artifact.

The **Verification** clause was the genuinely missing element, because it converts an invariant from an assertion into something testable. It has been added. The rationale stays.

**On what the review did not raise.** No recommendation concerned detection efficacy, weight validity, or whether the rule set discriminates phishing from legitimate traffic. This is consistent with the review's stated scope, but it should be recorded plainly: every rule in this specification remains **Unvalidated** (§18.2), and no amount of further specification will change that. The next artifact is an implementation and a confusion matrix, not a document.

---

## Appendix D — Persistence Dependency Review (v0.4)

A pre-Stage-0 review confirmed that the conceptual persistence architecture is sufficiently specified for contract freeze. Physical database design remains downstream: Domain Model §7.5.4 establishes that persistence mechanisms conform to contracts rather than constraining them, and Persistence Architecture Specification §46–§47 already authorize ER and PostgreSQL logical design to proceed on the conceptual model alone.

Two gaps were identified and resolved in v0.4. Both were underspecified dependencies, not new functionality.

**GAP-1 — CRED-02 referenced an evaluation source that did not exist.**
§7.2 listed the Authentication History Store among CRED-02's required evaluations, but the store was not an Internal Evaluation Module and produced no Security Evaluation. Had the store been queried live during correlation, CRED-02 would not have been reproducible under replay, defeating §4.3 and rendering the §17.2 release gate ineffective for the platform's most important rule. **Resolved** by naming the Authentication Context Evaluation Module (§20.11) as the store's sole read path, with consequential amendments to CRED-02's predicate (§7.2), the S-01 guard (§6.2), and the store failure modes (§15.3, §20.10). CRED-02's semantics are unchanged; only its evaluation source is now named, so `rules-v0.1` is unaffected.

**GAP-2 — Analysis Pass Result and Advisory Finding had no stated aggregate owner.**
The Analysis Session composition was ratified before the multi-pass model existed. **Resolved** by §2.5 under the addendum provision of Persistence Architecture Specification §43. No boundary, ownership, or dependency direction changes.

**GAP-3 — remains open and blocks Stage 7, not Stage 0.**
Three pages of the Persistence Architecture Specification render as "SUPERSEDED" with no content, covering approximately §12–15 (Repository Interaction Principles, Persistence Boundaries, **Canonical Identity Model, Identity Lifecycle**), §30–35 (Knowledge Lifecycle, Knowledge Update Policy, Current Security State Governance, Analysis History Governance), and §41–42 (Ubiquitous Language tail, ADR-001). The §39 dependency graph and an unlabelled field list also failed to extract.

The Canonical Identity Model is the material one: it defines how a Security Resource's canonical identity is derived, and §16, §25, and §30 all depend on it. The SKR schema cannot be designed without it. Whether this content exists in the source document or the pages are genuinely superseded SHALL be established before Stage 7 (Backend and Persistence). It does not affect Stage 0, which touches no persistence.
