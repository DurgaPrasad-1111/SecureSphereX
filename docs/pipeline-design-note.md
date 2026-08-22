# Pipeline design note (B0.3)

One page. For Varun and Durga to build against without a follow-up question.
Sourced from `spec/SecureSphereX-RuleEngine-Spec-v0_8.md`, sections 2.6
(lines 164–195), 4 (lines 263–302), and 5.1–5.6 (lines 306–348).

## The eight pipeline stages (§4.1, lines 265–276)

**The order below is architecturally frozen (§4.1, line 278: "Implementations
SHALL NOT reorder these stages").** This is not a suggested sequence — an
implementation that reorders it is non-conformant by definition, not merely
unconventional.

| # | Stage | Takes in | Gives out |
|---|---|---|---|
| 1 | Module Evaluation | Security Evidence, scoped to one module's evidence category | One Security Evaluation per module. Modules run independently, may run in parallel; no module reads another's output (§4.2). |
| 2 | Predicate Matching | The complete set of Security Evaluations from Stage 1 | Matched/unmatched predicates. **Refinements (§5) apply here and only here** — a predicate has no meaning without them (§4.2, line 284). |
| 3 | Correlation Finding Generation | Matched predicates from Stage 2 | One Correlation Finding per matched predicate, referencing the Evaluations that satisfied it, carrying its base weight from the rule set. |
| 4 | Contextual Suppression | Candidate findings from Stage 3 | Each finding tested against suppressions (§6); a suppression records a reduction factor, it does not delete the finding. |
| 5 | Effective Weight Calculation | Findings + their suppression reductions | Effective weight per finding (base weight minus the max applicable reduction). Suppressed findings keep effective weight zero and stay recorded. |
| 6 | Aggregation | The complete finding set | One score, via a pure function (§9). Subsumption (§10) is applied here. |
| 7 | Threshold Evaluation | The score from Stage 6 | Low / Medium / High tier. |
| 8 | Current Security State Update | The tiered result | A new Analysis Pass Result, appended to Analysis History, replacing Current Security State subject to monotonic escalation (§11.3). |

Determinism (§4.3, lines 298–302): given identical Security Evaluations and
an identical rule-set version, stages 2–7 produce an identical score and
tier — no dependency on wall-clock time or any iteration/evaluation order.
Where a Phase II Advisory Finding is present, this holds *conditionally*:
deterministic given the (persisted) Advisory Finding, no stronger claim.

## The ten evaluation modules (§2.6 register, lines 170–181)

Every module conforms to the same contract (§2.6, line 168): it consumes
**only its own evidence category**, produces **exactly one Security
Evaluation per pass**, and does so deterministically. The literal interface
signature comes from `packages/contracts/evaluation.contract.v1.ts` directly
(DEC-11: the "ECE Internal Module Specifications" document this section
previously pointed to does not exist anywhere in the 46-file corpus —
DEFECT-5, resolved — and DEC-11 named `evaluation.contract.v1.ts` as the
actual source of the signature; modules 1–7 detail is supplied by typed
findings rather than prose, a recorded narrowing).

Concretely: `Evaluability<F>` (`evaluation.contract.v1.ts:60-62`) is the
evaluated/unevaluable wrapper —
`{ status: 'evaluated'; findings: F } | { status: 'unevaluable'; reason: UnevaluableReason }`.
`SecurityEvaluation<M>` (`evaluation.contract.v1.ts:263-284`) is the full
per-module envelope, whose `result` field is
`Evaluability<FindingsByModule[M]>` — that's what "one Security Evaluation
per pass" resolves to concretely for a given module `M`.

| # | Module | Evidence category | Rules served |
|---|---|---|---|
| 1 | URL Evaluation | `url` | CRED-06 |
| 2 | SSL Evaluation | `transport` | **— none** |
| 3 | DNS Evaluation | `dns` | **— none** |
| 4 | Redirect Evaluation | `redirect` | CRED-04, PM-01 |
| 5 | Login Form Evaluation | `loginInterface` | CRED-01…07, CRED-A1 |
| 6 | JavaScript Evaluation | `scriptRuntime` | CRED-05, CRED-A1 |
| 7 | Homograph Evaluation | `domainRepresentation` | CRED-03 |
| 8 | Authentication Context Evaluation (ACEM) | `loginInterface` (fingerprint) | CRED-02 |
| 9 | Download Context Evaluation | `downloadContext` | DL-01, DL-02 |
| 10 | Permission Context Evaluation | `permissionContext` | PM-01 |

**SSL and DNS serve no rules** — this is why DEC-5 stubs them; nothing
downstream currently reads their output.

Modules 9 and 10 exist specifically because DL-01, DL-02, and PM-01 named
required evaluations that no module produced (GAP-4, §2.6 lines 183–189).
Correlation cannot consume `downloadContext`/`permissionContext` directly —
prohibited by Domain Model §8.4.3 and by §4.2 placing rule predicates at
Stage 2 over evaluations, not over raw evidence.

## Where refinements R-01–R-04 are applied (§5.1, lines 308–315)

**Stage 2, predicate matching — and only Stage 2.** Line 315: "Refinements
SHALL NEVER be applied after Stage 2." A refinement defines what a rule's
term *means*; a suppression (Stage 4) instead judges an already-matched
finding as contextually benign. These are not interchangeable, and the spec
treats conflating them as a distinct error class.

| Refinement | Defines | Used by |
|---|---|---|
| R-01 — Same-Site Determination (§5.2) | Equal registrable domain (eTLD+1, PSL) ⇒ same-site, regardless of subdomain | CRED-01, CRED-02, CRED-04, CRED-05, CRED-07, CRED-A1, DL-01 |
| R-02 — Executable Delivery Determination (§5.3) | Membership in the executable/archive type set (versioned rule-set artifact) | DL-01 |
| R-03 — Sensitive Permission Determination (§5.4) | Membership in the sensitive-permission set: input capture, location, persistent notification, clipboard read (versioned rule-set artifact) | PM-01 |
| R-04 — Credential Field Determination (§5.5) | Password input, or one-time-password/PIN semantics ⇒ credential field; a form containing one ⇒ credential form | All CRED-family rules |

Where a predicate's required evidence is simply absent, that's ordinary
non-matching (§5.6, line 346) — no finding, not a suppression, not a
refinement outcome.

## What a module is forbidden from doing (§2.6 line 168, §2.6 lines 191/193)

A module SHALL NOT:

- **Run a membership test.** R-02's executable set and R-03's
  sensitive-permission set are Stage 2 concerns — Download Context
  Evaluation and Permission Context Evaluation explicitly report raw
  observed context (declared filename/extension/type, requested permission,
  requesting origin, gesture-preceded-or-not) and apply no membership test
  themselves (§2.6, lines 191, 193).
- **Correlate with another module's output.** Modules run independently; no
  module reads another's output (§4.2, Stage 1).
- **Touch the network.**
- **Access the store**, except the ACEM (module 8), which is the one module
  named as reading `loginInterface` fingerprint data against Authentication
  Context.
- Assign confidence, apply thresholds, classify the Target Resource, or
  produce a Security Decision (§2.6, line 168) — those are later-stage
  concerns (Stages 5–8), not module concerns.
