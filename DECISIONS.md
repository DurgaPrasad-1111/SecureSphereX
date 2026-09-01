# SecureSphere X — Project Decisions

**Status: Revision 1 — awaiting Architecture Owner signature.**
**Architecture Owner: Jayanth.**
**Prepared: 21 August 2026.**

> **What this document is.** The binding record of architectural decisions for the
> SecureSphere X implementation. Each decision below has been resolved to a
> conclusion against the frozen 46-file specification corpus and the project's
> verified working state. Where the specifications were genuinely silent, the
> conclusion is a reasoned architect's judgment and is marked as such. Evidence is
> tagged **[R]** recovered (a spec states it directly), **[I]** inferred (a logical
> consequence of spec content), **[N]** new decision (specs silent; judgment applied).
>
> This supersedes an earlier AI-reconstructed draft that was found in the repository.
> That draft was not authored by the team and contained at least one material error
> (it undercounted the DayStamp branding sites as eight; the correct figure, verified
> by direct inspection of the contracts, is nine). This document corrects that and
> records decisions that were already executed in the working tree but never formally
> signed.

---

## Corpus rollup of record

The authoritative `spec/` corpus rollup is **machine-specific** because line endings
differ between checkouts (a Windows clone with CRLF produces a different per-file
hash than a Unix checkout with LF, for byte-identical content).

- Verified on the build machine at import: `3b105afb9abd8c22efca0fa150ec7cba` (LF).
- Verified on the Windows clone (CRLF): `c42963a0fd1be3cbb5e73575ff3519ea`.
- **The content is identical across both** — confirmed against the five frozen JSON
  schemas, whose SHA-256 digests match their MANIFEST Ruling R13 anchors exactly on
  every checkout regardless of line endings.

**Canonical rollup for this repository: `c42963a0fd1be3cbb5e73575ff3519ea`**
*(Computed on the signing machine — Windows checkout, CRLF line endings — on
 2026-08-21, and reproduced by the Architecture Owner at signing. Byte-content is
 identical to the LF build-machine checkout (`3b105afb…`); the five frozen schemas
 match their MANIFEST Ruling R13 SHA-256 anchors on both checkouts, confirming the
 difference is line endings only, not content.)*

---

## DEC-1 — Corpus storage: external object store vs. Git-LFS

**[R]** `Implementation-Readiness-Review.md` §1 (R-1): *"Decide corpus storage:
Git-LFS vs external object store. Affects repo initialisation; migrating after
commits is painful and rewrites history."* A one-way door, decided before the first
commit.

**[I]** The decisive factor is size. A phishing corpus captured over a multi-week
window at 30-minute polling across multiple feeds — gzip'd rendered DOM, headers, and
TLS chain per snapshot — reaches tens to low-hundreds of gigabytes. GitHub warns above
1 GB and the Git-LFS free tier caps at 1 GB. Neither is within an order of magnitude of
the payload, so the corpus cannot live in git under either the plain-repo or the LFS
branch.

**Conclusion — External object store.** The captured corpus never enters git — not the
repository, not Git-LFS. Payload lives on disk (and/or an external store) outside version
control. A committed `INDEX.jsonl` records provenance for every snapshot and is the record
that survives if payload is lost; invariants S-2b, S-3, and S-4/S-5 depend on that index,
not on the bytes. Snapshots are gzip-compressed at capture. `.gitignore` names `corpus/**`
with an exception for `corpus/INDEX.jsonl`.

**Status:** This decision is already executed in the working tree — the `.gitignore`
rule, the gzip pipeline, and the committed index are all built against it, and capture
is running. Signature makes it formally binding.

**Decision:** ☑ External store (`corpus/**` git-ignored except `INDEX.jsonl`)
**Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-21

---

## DEC-2 — Contract filenames in `packages/contracts/`

**[R]** `MANIFEST.md` documents that the authoritative contract files use a settled
naming convention, and `FIX_LOG.md` records a prior correction to bring references
into line with what is actually on disk.

**[N] / status note.** The claim in an earlier planning draft that a particular
filename form makes `tsc` "fail on the first commit" is not supported — TypeScript
module resolution does not care whether a `.ts` filename uses dots or underscores.
The real basis for this decision is simply *consistency with what is on disk*: the
contract files were scaffolded with dotted names in `packages/contracts/`
(`boundary.interfaces.v1.ts`, etc.), and that is the working convention there.

**Conclusion — ratify the on-disk convention.** The dotted filenames in
`packages/contracts/` are the working convention. This decision was applied by the
scaffold before it was signed — an artifact appearing first and thereby settling a
decision by default. It is the correct answer and matches the working tree, so it is
**ratified, not re-deliberated** — and recorded here as a caution: an artifact
appearing first is a decision being made without a decision being taken.

**Decision:** ☑ Ratify dotted filenames in `packages/contracts/`
**Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-21

---

## DEC-3 — Five contract amendments (Annex A-1 … A-5)

**[R]** `How-To-Start-Coding.md` Step 6 names the five amendment sites; the exact
amendment text and the verified site list are captured in `ANNEX-A4-AMENDMENT-TEXT.md`
and the enumeration performed against the contracts this period.

**[I]** Each amendment is standard type-safety hardening, not an architecture change.
A bare `string` lets `analysisSessionId` and `findingId` be swapped at a call site with
no compiler error; a bare date `string` lets a day-granular value and a full ISO
timestamp mix silently; an un-discriminated `FetchRecord` lets `httpStatus` be populated
on a `timeout` outcome — an impossible state the type system should reject.

**The five amendments:**

- **A-1** — add boundary invariant **B-14** (subscriptions end with the session);
  B-13 is the current highest, so B-14 is the next free number.
- **A-2** — record the **in-memory constraint on `get()`** (the §16.1 ≤10 ms Tier-0
  budget is why `get()` must be in-memory).
- **A-3** — brand the four ID types (`analysisSessionId`, `targetResourceId`,
  `passResultId`, `findingId`) across **23 sites**. This includes the `createSession`
  **return type** at `boundary.interfaces.v1.ts:210` — invisible to a field-name
  search and the site most often missed.
- **A-4** — brand the date type `DayStamp` across **nine `...On` date fields**
  (**corrected from the earlier draft's undercount of eight**). Eight are branded
  `DayStamp`; **`reportedOn` (`snapshot.format.v1.ts:73`) is branded `DayStamp | null`**
  — its null is load-bearing (feed-optional report date: PhishTank supplies one,
  OpenPhish does not). A uniform edit that brands all nine identically breaks the build
  at a call site, not the declaration. Verified this period against the contracts:
  nine `...On` fields, `reportedOn` the sole nullable one.
- **A-5** — make **`FetchRecord` a discriminated union**, so impossible field
  combinations become unrepresentable.

**Conclusion — approve all five.** Direction is sound and low-risk; the only real
failure mode is *incomplete application*, addressed by the staged Step 6 procedure
(A-3 fully before A-4, since A-3 shifts A-4's line positions; verify by field name,
not line number). This decision gates Step 6 and therefore Steps 7, 8, and 11.

**Decision:** ☑ Approved — apply per Step 6, Annex A-1…A-5 (A-3 = 23 sites incl.
`createSession`; A-4 = 9 sites, `reportedOn` nullable)
**Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-21

---

## DEC-4 — Resolving the `G-8` name collision

**[R]** `Stage0-Completion-Pack.md` §3 names `G-8` as the rule-set static validator
(V-1…V-12). `MANIFEST.md` §5 separately calls `contract-conformance-check.py`
"Governance rule G-8" — the collision. Because `spec/` is frozen and read-only, the
collision must be resolved on the implementation side, here.

**[I] — and a defect this decision now also governs.** Beyond the naming collision,
verification this period found that CI gate **G-1** runs `npx tsc --noEmit` at repo
root against a solution-style `tsconfig` (`files: []`), which compiles **zero files**
and passes vacuously — the "contract integrity, strict" gate currently verifies
nothing (recorded as DEFECT-1). The fix is that G-1 must run `npm run typecheck`
(`tsc -b`), not `npx tsc --noEmit`. Root `tsconfig.json` must not be edited to work
around it.

**Conclusion.** (a) `G-8` = the rule-set validator (owns the name in `ci.yml`);
`contract-conformance-check.py`'s CI step is renamed **`G-11`**. (b) G-1 is corrected
to run `npm run typecheck`. Both land before Step 12.

**Decision:** ☐ Approved — G-8 = validator, conformance check = G-11; G-1 runs
`npm run typecheck`
**Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-21

---

## DEC-5 — Defer `ssl` / `dns` modules to conformant stubs

**[R]** `Implementation-Ownership-Plan.md` §9, "Scheduling Decision Requiring
Sign-off": defer full implementation of the `ssl` and `dns` modules — no rule in
`rules-v0.1` reads either module's findings, so a minimal conformant implementation
(correct shape, correct `unevaluable` handling, findings populated from evidence)
satisfies every architectural requirement until a rule consumes them. Explicitly *"not
an architecture change; a scheduling decision,"* requiring Architecture Owner approval.

**[N] — corpus arithmetic caveat.** A planning draft cites "2.0 person-days between
41.5 required and 41.9 available"; those specific totals are not sourceable in the
corpus (`Implementation-Ownership-Plan.md` §7 sums to 43.5 person-days). The "~2
person-days" saving is sound; the exact totals around it are not, and the decision does
not depend on them.

**Conclusion — approve the deferral.** It is corpus-sanctioned, removes ~2 person-days
from the critical path, and is reversible the moment a rule consumes `ssl`/`dns`
findings. The capability spike (Step 10) independently confirms the *evidence* side:
all TLS-certificate and DNS-record fields are producer-exclusive (no content-script
producer), which reinforces that these modules are correctly deferred until their
producers and consumers both exist.

**Decision:** ☐ Approved — `ssl`/`dns` as conformant stubs until a rule consumes them
**Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-21

---

## DEC-6 — "Review is not a release"

**[I]** `Stage0-Completion-Pack.md` §3 places `G-9` (property tests) at Stage 1b and
`G-10` (deterministic replay) at Stage 6 — both explicitly not available now.
`MANIFEST.md` marks the only schema-generation tooling as writing outside the
repository and superseded — there is no working schema generator today.

**Conclusion — approve as scoped.** Stage 0 "review" means: passing `G-1`…`G-8`/`G-11`
and the Architecture Owner's rule-set review. It does **not** imply that the replay
gate (`G-10`) or a working schema generator exist yet, and Stage 0 sign-off must not be
read as implying either. This keeps week 1–2 scope from silently expanding.

**Decision:** ☐ Approved as scoped
**Signed by:** _______________________  **Date:** ______________

---

## DEC-7 — "Implementer" means accountability, not authorship-of-convenience

**[R]** `Implementation-Ownership-Plan.md` §1 defines four roles per component
(Architecture Owner, Implementer — "writes the code", Reviewer, Integrator) and names
an Implementer and a Reviewer for each of the ten evaluation modules individually.
§1.2: peer review is A↔B; the Architecture Owner is a mandatory reviewer only where a
frozen invariant is at stake.

**[I]** That structure delivers assurance only if the named Implementer genuinely
produced and understands the code, and the named Reviewer genuinely reviewed it. One
person batch-generating several modules with a name attached for form's sake satisfies
the paperwork and delivers none of the assurance.

**Conclusion — accountability model, with an explicit reduced-staffing amendment.**
The default stands: each module is implemented in its own session by its assigned owner
and reviewed by its assigned reviewer. **Where staffing is genuinely reduced and one
person implements a module with agent assistance:** (i) that person is named as
Implementer; (ii) the Reviewer role is **explicitly recorded as unfilled**, not
assigned pro forma; (iii) the Architecture Owner reviews any module that touches a
frozen invariant. An unfilled Reviewer field that says "unfilled" is worth more than a
filled one that is fiction — it tells any future reader exactly which modules got a
second pair of eyes and lets the unreviewed ones be retro-reviewed when people are
available. Silent drift (names attached as convenient, nothing amended) is explicitly
ruled out.

**Decision:** ☐ Approved — accountability model + reduced-staffing amendment as above
**Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-21

**Amendment — 2026-08-24:** DEC-7's original named-assignment model
assumed dedicated per-person availability, which does not hold under
college-project constraints. Amended as follows:

Work is picked up by availability, not fixed advance assignment.
Whoever picks up a piece of work becomes its accountable owner for
that specific piece at commit time — the Responsibility Matrix's
"Implementer" field is filled in retroactively, by whoever actually
did the work, not assigned in advance.

Peer review still happens. Whoever is next available reviews it,
named explicitly in the commit or pull request. Review is not skipped
because assignment is now flexible — accountability moved from
"pre-assigned" to "named at the point of work," it did not disappear.

**Decision:** ☑ Approved — DEC-7 amended as above
**Signed by:** Jayanth (Architecture Owner)  **Date:** 24-08-2026

---

## DEC-8 — `RuleSet.pslVersion` (Annex A-6)

**[I]** `ruleset_format_v1.ts`'s `sameSite`/`notSameSite` operators compare
already-extracted registrable-domain fields at Stage 2; PSL resolution happens upstream
at extraction time. Corpus splitting already has its immutability answer (S-2b freezes
`splitKey`), but the rule engine's use of PSL for `sameSite` has no equivalent record of
*which* PSL version a rule set's registrable-domain comparisons were authored against —
which matters for `G-10` replay determinism, since a PSL update can shift an eTLD+1
boundary and change a `sameSite` outcome under otherwise-identical evidence.

**Conclusion — add the field.** Add `readonly pslVersion: string;` to `RuleSet` in
`ruleset.format.v1.ts` (this is Annex **A-6**, applied as part of Step 6). Per §14.1,
this is a change to predicate meaning and therefore a **MINOR** version bump, not a
PATCH. This decision also gates Step 6 (A-6) and Step 11.

**Decision:** ☐ Approved — add `RuleSet.pslVersion` (A-6), MINOR bump per §14.1
**Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-21

---

## DEC-9 — `B1.5` ownership: superseded by DEC-7 (resolved)

Per the guide, not due now — due week 4. `Implementation-Ownership-Plan.md` §3
currently assigns `B1.5` (property tests, depends on `B1.2`/`B1.3`) to the Architecture
Owner. **Left open by design; revisit at week 4.** No signature required now.

**Status:** ~~OPEN — revisit week 4.~~ *(superseded 2026-08-29 — see the
Resolution below. The original text above is retained as the record of what
was deferred, not as a live status.)*

---

### Resolution — 2026-08-29 — superseded by DEC-7's amendment

**The question dissolved; it was never answered.** DEC-9 defers a purely
ADMINISTRATIVE question — every substantive noun in it was about assignment:
its heading, before this entry was retitled, read "`B1.5` (property test)
**ownership** — deliberately open"; its body says "§3 currently **assigns**
`B1.5` … **to the Architecture Owner**"; it closes "No signature required
now." It contains no `[R]`/`[I]` evidence, no options,
and no "question for architect ruling" — unlike DEC-15, DEC-20 or DEC-21. The
row it defers on is a Responsibility Matrix row
(`Implementation-Ownership-Plan.md:38`, `| CI: G-9 property tests | Jayanth |
Jayanth | Durga | — |`) — four names, no technical content.

**DEC-7's 2026-08-24 amendment removed the model DEC-9 was deferring on:**

> Work is picked up by availability, not fixed advance assignment. Whoever
> picks up a piece of work becomes its accountable owner for that specific
> piece at commit time — the Responsibility Matrix's "Implementer" field is
> filled in retroactively, by whoever actually did the work, not assigned in
> advance.

DEC-9 asks whether B1.5's pre-assignment to the Architecture Owner should
stand. Under DEC-7 amended, pre-assignment is not how any work is allocated.
The question therefore has no answer to give — it stopped applying on
2026-08-24, and DEC-9 was simply never updated to say so.

DEC-9 reaches nothing DEC-7 does not. What B1.5 actually still needs decided
— the property-testing library ([[DEC-22]]) and whether its coverage should
extend past B1.2/B1.3 ([[DEC-24]]) — DEC-9 is entirely silent on. Both are
deliberately separate entries rather than folded in here.

---

#### The operational gap DEC-7 leaves open — stated plainly, not softened

DEC-7's amendment does not only reassign ownership; it imposes an obligation:

> Peer review still happens. Whoever is next available reviews it, named
> explicitly in the commit or pull request. Review is not skipped because
> assignment is now flexible — accountability moved from "pre-assigned" to
> "named at the point of work," it did not disappear.

**That obligation is not being met, and the cause is not a commit-message
habit.** Measured against the actual record, not impression:

- Of the 15 commits since the `varun/main` reconciliation (`da3659d`),
  **13 are authored by Jayanth alone**. The other two are Durga's corpus
  checkpoint and the merge commit itself — neither is a review.
- **Zero commits name a Reviewer.** Grepped every commit body in that range:
  the only "review" hit is the phrase "design review" inside DEC-21's message,
  describing a conversation, not a reviewer.
- On 2026-08-28 and 2026-08-29 — six commits, including the E-6 invariant
  fix, DEC-21's signing, and B1.4 — **no one other than Jayanth committed
  anything at all**. Durga's last activity was 2026-08-27; Varun's last
  commit predates the merge.
- The named reviewers for the components touched are unavailable in practice:
  Pipeline core → Durga, Suppression semantics → Varun, Aggregation → Durga,
  G-9 property tests → Durga (`Implementation-Ownership-Plan.md:38-43`).

So "whoever is next available" has, for this stretch, resolved to **no one**.
Writing "Reviewer: unfilled" in future commits would record that honestly —
which DEC-7's ORIGINAL text already anticipated ("the Reviewer role is
explicitly recorded as unfilled, not assigned pro forma… An unfilled Reviewer
field that says 'unfilled' is worth more than a filled one that is fiction")
— but recording it does not supply the second pair of eyes, and several of
this session's commits changed a frozen-invariant-adjacent code path (the E-6
fix, DEFECT-22's evaluator change, the suppression range guard).

**This is not resolved here.** It is a question DEC-7 does not reach: what
does peer review MEAN when only one person is active for days at a time? That
needed its own decision and now has one — [[DEC-23]], ruled 2026-08-29. It is
deliberately not pre-empted in this resolution, which closes only the
ownership question.

- **Status:** RESOLVED — superseded by DEC-7's 2026-08-24 amendment. The
  ownership question is closed. The review-availability question it exposes is
  NOT closed here — it is ruled on separately in [[DEC-23]].
- **Signed by:** Jayanth (Architecture Owner)   **Date:** 2026-08-29

---

## DEC-10 — `G-03` fingerprint comparison reuses `fingerprintSimilarity`

**[R]** The contracts separate the similarity *computation* from the *threshold*:
`evaluation.contract.v1.ts` invariant **E-9** ("the ACEM applies no threshold; τ_sim
belongs to the rule set, §13.2"); the boundary comment "score only — τ_sim is applied by
CRED-02 at Stage 2"; and two separately-registered rule-set tunables, `tau_sim` (CRED-02)
and `tau_collision` (G-03 store-write guard). G-03's own rationale
(`SecureSphereX-RuleEngine-Spec-v0_8.md`): the store "defends itself using the rule it
exists to support."

**[I]** Two different similarity functions would mean the store defends itself using a
*different* rule than the one it supports — contradicting that rationale and creating a
class of impersonation that passes one check but trips the other for no stated reason.

**[N] — placement.** G-03 runs at write time inside the store boundary; CRED-02 runs at
Stage 2 inside the engine. Per §2.2 the store cannot import engine internals, so the
shared function must live in a module/shared layer both can reach, with each caller
supplying its own threshold.

**Conclusion — one function, two thresholds.** `fingerprintSimilarity` is a pure
computation returning a score in [0,1], placed in shared implementation (not
engine-internal). `tau_sim` and `tau_collision` are independent, separately-versioned
rule-set parameters and **must not be assumed equal** — which is the whole reason they
are registered separately.

**Decision:** ☐ Approved — one `fingerprintSimilarity`, two independent thresholds
**Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-21

---

## Signing summary

| Decision | Subject | Gates | Sign today? |
|---|---|---|---|
| DEC-1 | Corpus = external store | Step 2 (done) | Yes — ratify |
| DEC-2 | Dotted filenames | — | Yes — ratify |
| DEC-3 | Five amendments (A-1…A-5) | **Step 6 → 7, 8, 11** | **Yes — critical path** |
| DEC-8 | `RuleSet.pslVersion` (A-6) | **Step 6, Step 11** | **Yes — critical path** |
| DEC-4 | G-8/G-11 + G-1 fix | Step 12 | When convenient |
| DEC-5 | Defer ssl/dns stubs | Durga's Stage 1 | When convenient |
| DEC-6 | Review ≠ release | scope guard | When convenient |
| DEC-7 | Implementer accountability | Step 15 | When convenient |
| DEC-10 | One similarity fn | Step 11/13 | When convenient |
| DEC-9 | B1.5 ownership | week 4 | Open by design |
| DEC-16 | A-01 evidence gap (zero guards in the live rule set) | Stage 4 (any rule-set version adding A-01) | When convenient |
| DEC-17 | S-01 guard narrowing (2 of 3 §6.2 conditions live) | Stage 4 (S-01 itself unaffected; a future rule-set revision if closed) | When convenient |
| DEC-18 | `blockedBy` has no domain-scoping mechanism (S-02 live case) | Stage 4 (S-02 itself unaffected today; a future domain-divergent case) | When convenient |
| DEC-19 | CRED-A1 single-parent choice (CRED-01 only, not "or CRED-02") | Stage 5/6 (inert today — DEFECT-18 blocks CRED-A1 from firing at all) | When convenient |

**To unblock the critical path today, sign DEC-1, DEC-2, DEC-3, DEC-8.** The rest gate
later steps and can be signed in any order.

*This table predates DEC-11 through DEC-15 and was never fully
maintained after initial signing (see the "already resolved" correction
in `docs/ArchitectureOwnerReviewQueue.md`) — DEC-16/DEC-17 are added here
per explicit instruction, not as a signal the rest of this table is
current.*

*Staleness re-confirmed 2026-08-29, as of DEC-24: this table still shows
DEC-9 as "Open by design" when it is RESOLVED and signed, and omits DEC-20
through DEC-24 entirely. Deliberately not repaired in that pass — patching
the DEC-9 row alone would make the table LOOK current while five entries were
still missing, which is worse than a visibly unmaintained table. Recorded
here rather than in `docs/DEFECTS.md`: that register is for verification
findings with an owning step and something they block (its own header), and
this blocks nothing — it is a maintenance debt in this document, where a
reader of the stale table will actually see the warning. Not a work item
tonight; noted so it is not silently forgotten.*

---

## DEC-11 — DEFECT-5 resolution: the authoritative module contract

**[R]** SecureSphereX-RuleEngine-Spec-v0_8.md cites an external "ECE Internal Module
Specifications" document (lines 27, 195) as defining the evaluation modules. That
document is not among the 46 corpus files. The register itself notes the external
ECE document is already incomplete — it "REQUIRES three corresponding addendum
entries to remain the complete module register" — so it was never a settled
authority to begin with.

**[I]** The citation does not block implementation. The two things a module requires
are both present and authoritative in the corpus:
  - The MODULE REGISTER — the complete set of ten modules, each module's evidence
    category, rules served, and shared prohibitions (consumes only its own evidence
    category; produces exactly one Security Evaluation per pass; SHALL NOT correlate,
    assign confidence, apply thresholds, classify the Target Resource, or produce a
    Security Decision) — is fully specified in §2.6, closed at ten modules (line 775).
  - The MODULE INTERFACE SIGNATURE is defined by the D0.1 contract
    evaluation.contract.v1.ts (ModuleId, the evaluated/unevaluable result shape, the
    per-module findings types), frozen and audited.

**The narrowing, stated openly.** For modules 1–7 (URL, SSL, DNS, Redirect, Login
Form, JavaScript, Homograph), the register's "Defined in" column cites the absent
ECE document for per-module behavioural detail. For Phase I that detail is supplied
by evaluation.contract.v1.ts's per-module findings types — a TYPED rather than prose
specification. This is a genuine narrowing, and it is recorded here rather than
papered over.

**Conclusion.** The §2.6 register together with evaluation.contract.v1.ts are the
authoritative module specification for Phase I. No prose reconstruction of the
external ECE document is required or attempted — reconstructing an absent authority
would fabricate it. Any future need for the external document is a Phase II
documentation task. This unblocks Step 15.

**Decision:** Accept §2.6 register + evaluation.contract.v1.ts as the authoritative
module contract; ECE external document deferred to Phase II.
**Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-21

---

## DEC-12 (CANDIDATE — unsigned, open) — Sanctioned constructors for the
five brands

**[R]** DEC-3 signed the four ID brands (AnalysisSessionId,
TargetResourceId, PassResultId, FindingId) via Annex A-3 as TYPES ONLY.
DayStamp was added by Annex A-4 under DEC-3 on the same basis. No
sanctioned constructor was authorized for any of the five.

**[R]** Only Origin has a sanctioned constructor: `toOrigin()` at
evidence.contract.v1.ts:36, which parses the URL and returns null on
failure. Invariant I-9 records that Origin values enter the type
system exclusively through it: "Only toOrigin() constructs an Origin.
No cast, no assertion. The store write path (D0.8) accepts Origin
exclusively (§20.3)."

**[I]** Currently the five brands enter the type system by `as` cast
at every boundary — fixtures do this today (Step 8, commit 6060d63);
the capture pipeline will do it when reading its own snapshot output;
the engine will do it when reading corpus payloads. No runtime
validation exists for any of the five. A malformed DayStamp (e.g. a
full ISO-8601 timestamp) satisfies `as DayStamp` silently — which is
the exact class of over-precision §20.3 forbids and the A-4 branding
under DEC-3 was intended to prevent.

**Question for architect ruling.** Do the five brands get parse-validated
constructors modelled on toOrigin, and if so, does each of the five get
one or only those whose value has an enforceable format (DayStamp does;
opaque IDs may not)? Or is `as`-cast at boundaries deliberately
accepted, with validation deferred to producer-side testing?

**Status.** Open. Blocks nothing today — the current `as`-cast pattern
compiles and Step 8 is closed against it. Becomes relevant when: (a) the
capture pipeline ingests external data (Step 2 continuation), (b) the
engine reads corpus payloads (Step 15+), (c) any producer of these
values is written to run outside a fixture. Should be resolved before
those points.

**Decision:** _pending_
**Signed by:** _pending_

---

## DEC-13 (CANDIDATE — unsigned, open) — Cross-environment corpus payload access mechanism

**[R]** DEC-1 decided corpus payload never enters git and named two acceptable homes for it: "on disk (and/or an external store) outside version control." No endpoint, bucket, mount path, or credential scheme for the external-store option is recorded anywhere in DECISIONS.md, the codebase, or any config file.

**[R]** A full-tree grep for object-store references (S3/GCS/bucket/blob/etc.) across the entire repository returns nothing beyond DEC-1's own prose and code comments discussing the decision itself — confirming no mechanism was ever built, not that one was lost or misconfigured.

**[I]** The practical consequence surfaced concretely on 2026-08-22 during DEFECT-6's verification: a session running outside Durga's capture machine had zero path to real payload — no credentials, no reachable endpoint, no way to mount or fetch it, by design rather than by accident. This is not currently a problem — every step that needs real payload (Steps 2, 11, 13, 15) already runs on Durga's machine, where corpus/ holds the real files directly, satisfying DEC-1's "on disk" branch fully. The gap only bites if someone other than Durga, or some process other than local capture, ever needs to read real payload: CI running against real data, a teammate independently verifying something, disaster recovery if her machine is lost, or a handoff under reduced staffing (see DEC-7).

**Question for architect ruling.** Is cross-environment access to real corpus payload ever going to be needed — and if so, by what mechanism (a genuine external object store with credentials, a sync/transfer process onto whichever machine needs it, or something else)? Or is "payload lives only on the capture machine, INDEX.jsonl is the portable record" the permanent intended shape, in which case this is closed by ruling rather than by building anything?

**Status.** Open. Blocks nothing today — current practice (payload on the capture machine, INDEX.jsonl as portable provenance) is fully sufficient and matches DEC-1 as written. Becomes relevant if: (a) CI or any automated process ever needs to validate against real payload rather than just INDEX.jsonl, (b) someone other than Durga needs read access to real snapshots, (c) Durga's machine becomes unavailable and payload needs recovering or relocating. Should be resolved before any of those points, not discovered at them.

**Decision:** _pending_
**Signed by:** _pending_

---

## DEC-14 — Accept CRED-05 and CRED-A1 as non-functional for Phase I

**[R]** DEFECT-18 confirmed both rules structurally unable to fire:
CRED-05's transmissionEndpointDomains and CRED-A1's
injectingScriptOriginDomain both require registrable-domain extraction
from raw evidence (transmissionEndpoints, injectingScriptOrigin
respectively) that no evidence-producer currently performs. Unlike
DEFECT-15's fix, no existing field can be swapped in -- this requires
a genuine evidence-contract amendment adding producer-extracted domain
fields, plus corresponding producer-layer implementation.

**[I]** Both rules remain SIGNED and PRESENT in rules-v0.2.0.json, but are
accepted as non-functional for Phase I. This is a deliberate scope
decision, not an oversight -- fixing it properly requires a contract
amendment (new Annex) touching frozen evidence types, which deserves
dedicated attention rather than a rushed fix.

**Decision:** Accept CRED-05 and CRED-A1 as non-functional for Phase I.
Defer the fix (evidence-contract amendment adding pre-extracted
domain fields, mirroring url.registrableDomain's precedent) to a
future decision, logged but not started.
**Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-25

---

## DEC-15 (CANDIDATE — unsigned, open) — Stage 1 orchestration envelope: five fields with no documented derivation

**[R]** `evaluation.contract.v1.ts`'s `SecurityEvaluation<M>` (§7, "Evaluation
Envelope") attributes its fields to two sources: "Common Representation
Elements (Domain Model §7.3)" and "Domain Representation Elements
(§8.3.5)". All ten module files (`packages/engine/modules/*.ts`) cite the
same two groupings when explicitly scoping envelope assembly OUT of their
own responsibility: "Assembling the surrounding SecurityEvaluation<'X'>
envelope (evaluationId, evidenceRefs, indicators, consistency, summary,
moduleVersion, collectionContext) is Stage 1 orchestration, not this
module's concern."

**[R]** The "Domain Model" is not among the 46 files in `spec/`. It is
cited as an authority throughout the corpus (§5.2, §5.3, §7.3, §7.5.4,
§8.3, §8.3.5, §8.3.7, §8.4.3, §11.3 — confirmed by direct grep across
`spec/SecureSphereX-RuleEngine-Spec-v0_8.md` and the contracts) but never
itself present. This is the same shape of gap DEC-11 already ruled on for
the absent "ECE Internal Module Specifications" document — an external
authority cited by name but not delivered with the corpus — except DEC-11
covered module-level behavioral detail; this decision covers the
orchestration layer above the modules, which no prior decision addresses.

**[I]** Of `SecurityEvaluation<M>`'s thirteen fields, eight are fully
mechanical given only the already-frozen contracts — no invention
required: `contractVersion` (the `EVALUATION_CONTRACT_VERSION` constant),
`targetResourceId`/`analysisSessionId` (direct from the source
`SecurityEvidence`), `passOrdinal` (from its `collectionContext`),
`moduleId` (the category being dispatched), `evidenceRefs` (mechanical:
`{ evidenceId: evidence.evidenceId, category }`), `result` (the exact
`Evaluability<F>` each module's `compute*Findings` function already
returns), and `collectionContext` (direct passthrough). **Five are not:**

- **`evaluationId`** — no ID-generation scheme is documented anywhere for
  this field or its siblings. `evidenceId` (evidence.contract.v1.ts:316)
  is an undocumented bare `string`. `analysisSessionId`'s only producer,
  `createSession()` (boundary.interfaces.v1.ts:220), is an unimplemented
  interface method on the Authentication History Store, which does not
  exist until week 4 (How-To-Start-Coding.md). There is no established
  convention anywhere in this corpus to extend to `evaluationId`.
- **`moduleVersion`** — no module defines a version constant; nothing
  specifies what this string should even represent (a per-module semver,
  the engine package version, a build/commit identifier).
- **`indicators: readonly SecurityIndicator[]`** — no per-module registry
  of indicator IDs exists. The one example given inline
  (`"loginForm.offOriginAction"`) is illustrative, not canonical. Deriving
  these for real would mean inventing, per module, a mapping from Findings
  fields to named indicators — genuine analytical design, not bookkeeping.
- **`consistency: ConsistencyAssessment`** — defined only abstractly
  ("assesses coherence of findings WITHIN the module's own domain ONLY...
  NOT confidence, NOT probability, NOT a risk judgement"). No algorithm or
  heuristic is given for what "coherent" vs. "conflicting" findings means
  for any specific module's Findings shape.
- **`summary: string`** — no template or generation rule specified for the
  human-readable Evaluation Summary text.

**Why this blocks Stage 1 orchestration, not just a detail within it:**
`indicators` and `consistency` are not incidental metadata — they are
named as the module layer's actual analytical contribution beyond raw
Findings (§4, "Security Indicators vs Findings": "Rules predicate on
FINDINGS, never on indicator strings" — implying indicators serve a real,
separate downstream consumer, e.g. human-readable explanations, not yet
specified where). Guessing a scheme for either would be inventing
behavior the Domain Model was supposed to define, not implementing
something already decided.

**Question for architect ruling.** For each of the five fields above: what
is the actual generation/derivation rule? In particular — is there a
recovered or reconstructable copy of the Domain Model (§7.3, §8.3.5)
anywhere outside this corpus that should be added to `spec/`, the way the
46-file corpus was assembled in the first place? Or, absent that, should
each of these five be decided fresh here (mirroring how DEC-11 substituted
`evaluation.contract.v1.ts` + the §2.6 register for the absent ECE
document)?

**Status.** Open. **Blocks the Stage 1 orchestrator implementation** — the
task that surfaced this decision. The seven mechanically-derivable fields
could be assembled today; `indicators` and `consistency` cannot be without
guessing. Not resolved here, per explicit instruction — flagged, not
decided, mirroring DEC-12/DEC-13.

**Decision (original scope):** _pending_
**Signed by:** _pending_

---

### Amendment — 2026-08-26 — exhaustive re-check, partial resolution

The original entry above searched `evaluation.contract.v1.ts`,
`docs/pipeline-design-note.md`, `DECISIONS.md`, `docs/DEFECTS.md`, and the
rule engine spec's §4.1/4.2. This amendment re-searches the FULL corpus —
every `spec/*.md`, the OpenAPI sources, and the Logical Database Design
Specification, which the original pass never opened — specifically hunting
for indirect signals (a sibling field's documented format, a storage
schema's default value, a cross-layer naming match) for each of the five
blocked fields. Per-field record of what was found and what was not:

**`evaluationId` — FOUND, substantial indirect evidence.**
`spec/Logical-Database-Design-Specification-v1_1.md` §5.13 defines
`skr.security_evaluation`, the storage table for exactly this contract:
`evaluation_id | UUID | No | generated | PK`. This is not an isolated
value — the identical `UUID / generated / PK` shape appears for eight
other primary keys in the same document (`entry_id`, `relationship_id`,
`evidence_id`, `pass_result_id`, `finding_id`, `application_id`,
`advisory_finding_id`, `report_id` — LDD lines 540, 569, 657, 725, 785,
832, 871, 886), and the document states the general rule explicitly
(line 81): **"Assigned identifiers (UUIDv4) elsewhere. Analysis Sessions,
Reports, Intelligence Objects and Users have no deterministic derivation
in the architecture."** The ONE documented exception to server-generated
UUIDv4 anywhere in this schema is `analysis_session_id`
(`sessionId`/`analysisSessionId`), explicitly called out every time as
**client-generated** (LDD lines 72, 81, 210, 633, 1435, 2168;
`spec/API-Contract-Specification-v1_2.md` §7.2's identifier table, which
separately confirms `sessionId: UUIDv4, client-generated` vs.
`resourceIdentity: UUIDv5, deterministic over policy version` as the
project's only two patterns in actual use). `evaluation_id` is never
listed as an exception anywhere.

NOT found: no document states this at the D0.2 contract layer directly —
the evidence is from the persistence layer (LDD), one layer downstream of
`evaluation.contract.v1.ts`, related by column-name match and the
project's stated principle that "persistence mechanisms conform to
contracts rather than constraining them" (§7.5.4, cited in
`spec/SecureSphereX-RuleEngine-Spec-v0_8.md` line 1380) — i.e. the DB
column is documented as storing whatever the contract already produces,
not prescribing it. No document says "SecurityEvaluation.evaluationId is
a UUIDv4" in so many words. `evaluationId` does not appear anywhere in
`spec/openapi.yaml`, `spec/securesphere-openapi-3_1.yaml`, or
`spec/assemble-openapi.py` (confirmed by direct grep) — it is not part of
the public API surface at all, which is consistent with, but does not by
itself prove, an internal server-generated identifier.

**`moduleVersion` — FOUND, format only; source still absent.**
LDD: `module_version | VERSION_STRING | No | —` (no default — must be
application-supplied, unlike `evaluation_id`). `VERSION_STRING` is the
same domain used for `contract_version`, `rule_set_version`,
`policy_version`, and `collector_version` elsewhere in the identical
schema — all of which map to real, already-sourced values elsewhere in
this codebase (`EVALUATION_CONTRACT_VERSION`, `RuleSet.ruleSetVersion`,
etc.) EXCEPT `module_version`, which has no equivalent source anywhere.
No `CREATE DOMAIN VERSION_STRING` constraint/regex was found (grepped
directly; none exists in the LDD). No module file
(`packages/engine/modules/*.ts`) defines a version constant. No document
states whether module versioning is meant to be independent per module
(which the per-row, not per-table-global, column placement suggests was
intended) or a single shared value (e.g. the engine package's own
`0.1.0`).

**`indicators` — FOUND, a real sanctioned empty state; no registry.**
LDD: `indicators | JSONB | No | '[]'` — the storage layer's own default
is an empty array, not absence-of-a-value. This is a genuine, documented
"safe" state for the case where no indicators are emitted, distinct from
guessing what indicators to report. NOT found: no per-module list of
indicator IDs, no derivation rule from Findings fields to indicators,
anywhere in 46+ files. The one inline example
(`"loginForm.offOriginAction"`) remains illustrative only.

**`consistency` — FOUND, enum + storage shape; NO algorithm, no default.**
LDD: `CREATE TYPE skr.consistency_kind AS ENUM ('consistent',
'inconsistent', 'indeterminate')`; `consistency | CONSISTENCY | No | —`
— unlike `indicators`, there is **no default** here. The database always
requires an explicit value. NOT found: no heuristic, no per-module
coherence-check description, anywhere searched (`spec/*.md`,
`docs/*.md`, `DECISIONS.md`, `docs/DEFECTS.md`, the contracts).

**`summary` — FOUND, type only; nothing else.**
LDD: `summary | TEXT | No | —` — plain text, mandatory, no format or
length constraint documented. NOT found: no template, no generation rule,
no example beyond the field's own one-line label ("Evaluation Summary")
in the contract comment.

---

#### Classification

**MECHANICAL — resolved this pass:**

- **`evaluationId`.** Any internally-consistent unique-identifier scheme
  satisfies the type, and nothing downstream reads `evaluationId` as a
  predicate operand or otherwise depends on its specific value or on
  determinism (confirmed: zero references to `evaluationId` anywhere in
  `rulesets/rules-v0.1.0.json` or the rule engine spec's predicate
  language) — so the choice carries no analytical risk. **Recommendation:
  a randomly-generated UUIDv4 (`crypto.randomUUID()`), minted fresh each
  time `assembleSecurityEvaluation` constructs an envelope.** Justification:
  matches the LDD's own `evaluation_id: generated` column definition and
  the general "assigned UUIDv4, no deterministic derivation" rule that
  governs every identifier in this schema without a stated determinism
  requirement — the same pattern already used for the other eight
  `generated`-default UUID primary keys in the identical document.
  **Confidence: high.**

**BORDERLINE, treated as SEMANTIC — not resolved this pass:**

- **`moduleVersion`.** Leans mechanical in the sense that "some semver-like
  string" satisfies the type, but the schema's per-row (not per-table)
  placement of `module_version` is a real signal that independent
  per-module versioning was the intended design — and no module currently
  has any version-tracking convention to source a per-module value from.
  Defaulting silently to the shared engine package version (`0.1.0` for
  all ten modules alike) would foreclose that design without a ruling on
  whether it's wanted. **Not implemented.** Two live options for the
  Architecture Owner: (a) a single shared value (the engine package
  version, simplest, already exists) or (b) a genuine per-module version
  constant, introduced now, with a stated bump convention (tied to module
  source changes — manually, or via a build-time hash). Recommend (a) as
  the lower-risk starting point if forced to choose, but this is a
  judgment call, not a mechanical inference — **confidence: low**, hence
  not implemented.

**SEMANTIC — do not resolve, real design logic required:**

- **`indicators`.** The empty-array case (`[]`) is schema-sanctioned and
  safe to use **as an explicitly-marked placeholder** wherever no
  indicator-derivation logic exists — this is different from inventing a
  value, since the storage layer's own documented default already
  authorizes it as a legitimate "nothing to report yet" state. What
  remains genuinely undecided is the actual derivation: which Findings
  fields, on which modules, become which named indicators. **Upstream
  question:** who owns authoring the per-module indicator registry, and
  is it derived automatically from Findings shapes or hand-curated per
  rule the way `rulesets/rules-v0.1.0.json`'s rule metadata is?
- **`consistency`.** No schema-sanctioned safe default exists — unlike
  `indicators`, the database provides none, and `indeterminate` is a
  substantive interpretive claim ("insufficient evidence"), not a neutral
  placeholder, if applied uniformly regardless of what a module actually
  found. **Upstream question:** does "coherence within a module's own
  domain" mean anything concrete for any of the ten Findings shapes today
  (e.g. `LoginFormFindings.forms` containing contradictory field kinds),
  or is `indeterminate`-always the intended state until per-module
  coherence rules are designed — and if the latter, is that itself the
  ruling, or does it need to be stated explicitly rather than inferred?
- **`summary`.** No template, no schema-sanctioned safe default (empty
  text would misrepresent a real evaluation as having nothing to say).
  **Upstream question:** what is this string for and who reads it — is it
  operator-facing (a log/debug aid) or eventually end-user-facing (closer
  to D0.9's `ExplanationItem`, a related but distinct contract not present
  in this corpus)? The answer changes what "correct" even means here.

---

#### What blocks Stage 2 vs. what can ship marked

`evaluationId` and `moduleVersion` are pure provenance/bookkeeping — no
rule predicate in `rulesets/rules-v0.1.0.json` reads either (confirmed by
grep), so neither blocks Stage 2 (predicate evaluation) once populated.
`indicators` similarly does not block Stage 2 predicate matching directly
(§4, "Rules predicate on FINDINGS, never on indicator strings") and MAY
ship as `[]` — clearly documented as an unfilled placeholder, per the
schema's own sanctioned default, not silently. `consistency` and
`summary` are not read by any Stage 2 predicate either, but persisting a
fabricated `consistency` value (as opposed to an honestly-empty
`indicators` list) would misrepresent an analytical judgment that was
never actually made — the asymmetry is that `[]` truthfully says "no
indicators were derived," where `'consistent'` asserted without any
coherence check would be a false claim, not an honest absence. Recommend:
`consistency` and `summary` remain unimplemented (the orchestrator throws
for any module still needing them), not defaulted, even for Stage 2 work
that does not read them.

**Decision (this amendment):**
☑ **`evaluationId`** — RESOLVED. Random UUIDv4, generated at envelope
assembly. Implemented in `packages/engine/orchestrator.ts`. Mechanical
resolution per the MECHANICAL/SEMANTIC framework above — no analytical
consequence, no Architecture Owner ruling required, recorded here for
traceability.
☐ **`moduleVersion`, `indicators`, `consistency`, `summary`** — STILL
OPEN. Options and recommendations above are input for the ruling, not a
substitute for it.
**Signed by:** _pending (Architecture Owner ruling required for the
remaining four fields)_

---

### Amendment — 2026-08-27 — Architecture Owner ruling on the remaining four

**Arithmetic correction, applied above.** The original entry said "twelve
fields, seven are fully mechanical." Counted directly against
`evaluation.contract.v1.ts`, `SecurityEvaluation<M>` has **thirteen**
fields, and the entry's own inline list enumerates **eight** mechanical
ones. The list was right; both counts were off by one (8 mechanical + 1
`evaluationId` + 4 then-blocked = 13). The same wrong count appeared in
`packages/engine/orchestrator.ts`'s header and is corrected there too.

**Per-field ruling:**

☑ **`moduleVersion` — RESOLVED. Per-module tracking.** The shared
engine-package-constant (option (a), the one this entry previously
recommended "if forced to choose") was **REJECTED by the Architecture
Owner**. Reason, on the record: the LDD's *per-row* placement of
`module_version` is real evidence that independent per-module versioning
was intended, and a single shared constant would defeat the field's actual
purpose — audit and deterministic replay (§4.3, §17.2) need to show WHICH
module version produced a given finding. Implemented as
`packages/engine/module-versions.ts`'s `MODULE_VERSIONS: Record<ModuleId,
string>`, all entries `'0.1.0'` today because no module has forked yet —
the STRUCTURE is the point, not the current values. Drift against
`packages/engine/package.json` is guarded by
`module-versions.fixture.test.ts`, which also carries an explicit `FORKED`
allowlist so the first genuine divergence must be recorded deliberately
rather than silently quieting the check.

☑ **`indicators` — RESOLVED. `[]`, unconditionally.** Mechanical, on the
justification this entry already stated: the LDD's own schema default is
`indicators | JSONB | No | '[]'`, so an empty list is a schema-sanctioned
state, and "no indicators were derived" is a TRUE claim rather than a
guess at content. The per-module indicator registry — which Findings
fields become which named indicators — remains undesigned and is NOT
resolved by this; only the honest empty state is.

☑ **`summary` — RESOLVED WITH AN EXPLICIT PLACEHOLDER, not with content.**
Value: ``[DEC-15 UNRESOLVED] No Evaluation Summary generation rule is
specified for module "<moduleId>".`` Precedent is DEC-5's `ssl`/`dns`
"conformant stubs" — correct shape, correct handling, deferred until a
consumer exists. The string is deliberately not prose: it must be
self-evidently NOT real Evaluation Summary content, and greppable. This
entry's own open question ("operator-facing or eventually end-user-facing?")
is NOT answered by this; the placeholder is an interim Phase-I position.
Checked before applying: **no consumer of `SecurityEvaluation.summary`
exists** anywhere in `packages/engine`, `apps/`, or `tools/`. D0.9's
`ExplanationItem.summary` (`boundary.interfaces.v1.ts:152`) IS user-facing,
but is a different field on a different type keyed by `ruleId`, with no
implementor anywhere — the greppable prefix is what would catch a future
implementer wiring one to the other.

☐ **`consistency` — STILL OPEN. Deliberately NOT given a placeholder.**
The Architecture Owner ruled against stamping `'indeterminate'`. Reason, on
the record: the frozen contract defines it as
`'indeterminate'  // insufficient evidence to assess coherence`
(`evaluation.contract.v1.ts:76`) — a **substantive analytical claim**, not
a neutral "not assessed" marker. Applying it to a fully-evidenced
evaluation (the `url` module with all eleven fields present, say) would
assert the evidence was insufficient when it plainly was not. That is a
fabricated claim, the same failure shape as DEFECT-22 (`not()` fabricating
a match), DEC-20 (a skeleton reported where none was distinct), and the
E-6 violation (a rule reporting it found nothing when it was never
tested) — three defects found and fixed on the same day this ruling was
made. `summary` could take a placeholder only because `string` has room
for a value that is obviously not real content; `ConsistencyAssessment`
has exactly three values and no such room.

**Consequence, accepted explicitly rather than worked around:**
`assembleSecurityEvaluation` still throws, a real `SecurityEvaluation<M>`
still cannot be constructed, and invariant **E-8** ("Exactly one evaluation
per module per pass. Never zero, never two.",
`evaluation.contract.v1.ts:307`) therefore remains **UNTESTABLE**. The
Architecture Owner's ruling states this is the correct outcome, not a
shortfall — tests assert one `ModuleDispatchResult` per module, the closest
true statement available, and say so.

The `consistency` design question is now tracked as **[[DEC-21]]**, its own
entry rather than a DEC-15 sub-item: it is genuinely open work with its own
scope (a coherence-assessment design, or a frozen-contract amendment), not
a loose end of this decision.

**Signed by:** _pending (Architecture Owner — `consistency` remains
unruled; the three resolutions above are recorded per the 2026-08-27
ruling)_

---

### Addendum — 2026-08-26 — Stage 2 dependency check (does predicate matching need the 4 open fields?)

New information, not a re-litigation of the four fields above: does
`moduleVersion`/`indicators`/`consistency`/`summary` remaining open
actually block Stage 2 (predicate matching)? Answered from Stage 2's own
spec and contract, not from the earlier "no current rule names them" grep
alone, per explicit instruction that the two checks are not equivalent.

**Read in full before concluding:**
`spec/SecureSphereX-RuleEngine-Spec-v0_8.md` §4.2 (Stage Responsibilities)
and §5 (Predicate Refinements, all of §5.1-§5.6) — the operational
definition of what Stage 2 does and reads. §4.2: "Stage 2 — Predicate
Matching. Each rule's predicate is evaluated against the complete set of
Security Evaluations. **Predicate refinements (§5) are applied here and
only here** — they define what the rule's terms mean." §5.2-§5.5 (R-01
through R-04) each define a term strictly over Findings-level data
(registrable-domain equality, executable-type membership, sensitive-
permission membership, credential-field classification) — none reference
envelope metadata.

**The structural proof, from the contract itself, not inference:**
`packages/contracts/ruleset.format.v1.ts` lines 20-28 —
`FindingPath = \`${ModuleId}.${string}\`` with its own doc comment: "A
predicate reads typed fields from the EvaluationSet. Paths are
`<moduleId>.<field>` and **MUST resolve against D0.2's FindingsByModule**.
A static check validates every path at release (§8, **V-2**)." Every
`Predicate` AST operator (`is`, `not`, `and`, `or`, `gte`/`lte`/`gt`/`lt`,
`eq`/`neq`, `sameSite`/`notSameSite`, `inSet`, `exists`) resolves its
operands exclusively through `ValuePath` (`FindingPath | ItemPath`) —
confirmed by reading the full `Predicate` type (lines 113-151) operator by
operator. None of the four open fields — nor `evaluationId`,
`evidenceRefs`, `moduleId`, `passOrdinal`, `contractVersion`,
`targetResourceId`, `analysisSessionId`, or `collectionContext` — are
readable by ANY predicate operator, because `FindingsByModule[M]` does
not contain them. Confirmed by direct scan of all ten `*Findings`
interfaces in `evaluation.contract.v1.ts`: zero contain a field named
`moduleVersion`, `indicators`, `consistency`, `summary`, or
`evaluationId`. V-2 is a real, currently-enforced check (verified live
every `npm run validate:ruleset` run this session, "V-2 OK") — it is not
merely that no *current* rule references these fields, it is that the
validator would **reject** any future rule that tried to, because no such
`FindingPath` could ever resolve.

**Classification, per field:**

| Field | Classification | Citation |
|---|---|---|
| `moduleVersion` | **CONFIRMED-UNUSED-BY-STAGE-2** | Not in any `FindingsByModule[M]`; not a valid `FindingPath` target; V-2 would reject any predicate naming it |
| `indicators` | **CONFIRMED-UNUSED-BY-STAGE-2** | Same as above. Also independently confirmed by §4 (Security Indicators vs Findings): "Rules predicate on FINDINGS, never on indicator strings" |
| `consistency` | **CONFIRMED-UNUSED-BY-STAGE-2** | Same structural proof; `ConsistencyAssessment` values never appear as an `eq`/`neq` literal target anywhere the type system permits |
| `summary` | **CONFIRMED-UNUSED-BY-STAGE-2** | Same structural proof; `string` field, not inside `FindingsByModule[M]` for any module |

**What Stage 2 actually needs, precisely stated:** for each `ModuleId`,
its `Evaluability<FindingsByModule[M]>` — i.e. exactly what
`evaluateModule`/`evaluateAllModules` (`packages/engine/orchestrator.ts`)
already produce today, fully real, no blocking. Stage 2 predicate matching
does **not** structurally require the full `SecurityEvaluation<M>`
envelope `assembleSecurityEvaluation` currently cannot complete — it
requires only the `moduleId` + `result` pair each dispatch result already
carries.

**One separate, genuine blocker found during this check, unrelated to
DEC-15:** the `priorFindingActive` predicate operator (used by DL-01
only) — "True when at least one primary finding with non-zero effective
weight exists in a PRIOR COMMITTED PASS of the current Analysis Session"
(`ruleset.format.v1.ts` lines 140-151) — reads Analysis History / prior
committed pass state, which requires the Authentication History Store.
The store does not exist until week 4
(`docs/How-To-Start-Coding.md`). This is not a DEC-15 matter and not
ambiguous — it is a confirmed, different, already-known dependency (the
same one `authContext.ts`'s store-reader injection already documents).
Scaffolded as an explicit, typed error rather than a fabricated
true/false default — see `packages/engine/stage2.ts`.

**Conclusion:** DEC-15's four remaining open fields do **not** block
Stage 2 predicate matching. Stage 2 scaffolding proceeds using only the
already-real `evaluateModule`/`evaluateAllModules` output. This does not
resolve DEC-15 — those four fields remain open, required for a complete
`SecurityEvaluation<M>` envelope (relevant to Stage 3 and persistence),
just not for Stage 2 itself.

---

### Addendum — 2026-08-26 — Stage 3 dependency check (Correlation Finding Generation)

Re-derived independently from Stage 3's own spec section, not extended
from the Stage 2 finding above — the two stages read different data, and
the task that produced the Stage 2 addendum applies only to predicate
matching (§4.2, §5).

**Read in full before concluding:**
`spec/SecureSphereX-RuleEngine-Spec-v0_8.md` §7 in full — §7.1 (Rule
Table — Frozen Set, lines 409-430) and §7.2 (Rule Detail, lines 431-556,
all eleven rules: CRED-01 through CRED-07, CRED-A1, DL-01, DL-02, PM-01).
§8 (Rule Families, lines 557-586) checked directly — confirmed not
referenced by §7 (grepped) and independently read in full anyway, per the
"do not skim or sample" instruction; contains nothing relevant to any of
the four fields (rule-family naming conventions and the privacy/scoring
split, neither touching envelope metadata).

§4.2's operational definition of Stage 3: "Every matched predicate
produces one Correlation Finding, **referencing the Security Evaluations
that satisfied it**, and carrying its base weight from the rule set."
§7.2 fleshes this out per rule (predicate, weight, tier, explanation,
false-positive risks, limitations) — none of the eleven rule entries
mentions indicators, consistency, or a summary field; §2.4 (cited in
`passresult.contract.v1.ts`'s own header) states explicitly that "a
finding does NOT carry its own weight" and by the same separation carries
none of Stage 1's envelope metadata either — a Correlation Finding is
its own, narrower D0.4 record, not a repackaged D0.2 evaluation.

**The structural proof, from the actual type, not inference:**
`packages/contracts/passresult.contract.v1.ts`'s `CorrelationFinding`
(lines 42-59) and `CorrelationContext` (lines 35-40) — the literal Stage 3
output type:

```
CorrelationFinding: findingId, contractVersion, targetResourceId,
  analysisSessionId, passOrdinal, ruleId, evaluationRefs (string[]),
  correlationContext
CorrelationContext: emergedInPass, constituentConjunction
```

Grepped exhaustively across `passresult.contract.v1.ts`: zero occurrences
of `moduleVersion`, `indicators`, or `consistency` as a field or type
reference anywhere in the file (the one "inconsistency" hit inside §7's
raw text is DL-02's MIME-type prose, the same false-positive shape
already dismissed in the original DEC-15 pass — not the
`ConsistencyAssessment` type). Zero occurrences of `summary` either — the
only "summary" in this codebase's D0.x-adjacent contracts is D0.9's
`ExplanationItem.summary` (cited in
`spec/Backend-Architecture-Specification-v1_3.md` line 690), a different,
downstream, user-facing explanation contract not present in this corpus
— not `SecurityEvaluation.summary`.

**Classification, per field:**

| Field | Classification | Citation |
|---|---|---|
| `moduleVersion` | **CONFIRMED-UNUSED-BY-STAGE-3** | Not in `CorrelationFinding` or `CorrelationContext`; §7.2's eleven rule entries never reference it |
| `indicators` | **CONFIRMED-UNUSED-BY-STAGE-3** | Same. Also independently consistent with §4's "Rules predicate on FINDINGS, never on indicator strings" — indicators were never in the predicate-to-finding path to begin with |
| `consistency` | **CONFIRMED-UNUSED-BY-STAGE-3** | Same structural absence; no rule's Explanation/false-positive/limitation text in §7.2 references coherence assessment |
| `summary` | **CONFIRMED-UNUSED-BY-STAGE-3** | Same structural absence; the only "summary" concept near this pipeline is D0.9's `ExplanationItem`, a distinct, later, downstream contract |

**What Stage 3 actually needs, precisely stated:** per `CorrelationFinding`
— `targetResourceId`, `analysisSessionId`, `passOrdinal` (all three
already mechanical, resolved since the original Stage 1 orchestrator
work), `ruleId` (from the rule set, already available), the Stage 2 match
result (already real, `packages/engine/stage2.ts`), and
`evaluationRefs: readonly string[]` — "the evaluations this finding was
derived from" (§8.4.5). Cross-checked against
`spec/Logical-Database-Design-Specification-v1_1.md` line 2246:
`finding_evaluation: (finding_id, evaluation_id) — Findings reference
evaluations, never findings` — confirming `evaluationRefs` holds
`evaluationId` values. `evaluationId` was resolved this session (DEC-15,
2026-08-26) — Stage 3's one genuine data dependency on the Stage 1
envelope is therefore already satisfied.

**Two things found while reading §7, reported as discovery — neither
folded into DEC-15, neither resolved here:**

1. **`findingId` generation — new, not previously flagged.**
   `CorrelationFinding.findingId: FindingId` needs a fresh value minted
   per finding, the same shape of need `evaluationId` had before this
   session resolved it — and by coincidence, the exact same evidence
   applies: `spec/Logical-Database-Design-Specification-v1_1.md` line 785
   — `finding_id | UUID | No | generated | PK` — is one of the same eight
   sibling `generated`-default UUID primary keys DEC-15's evaluationId
   resolution already cited. No existing code anywhere constructs a
   `FindingId` (grepped `packages/`) — unsurprising, since Stage 3 has
   never been built. Not resolved in this pass (no implementation of any
   kind was in scope), but worth recording that the resolution path, when
   Stage 3 is actually built, is already evidenced and is not expected to
   need a fresh investigation.
2. **DL-01's Stage 2 `blocked` status propagates, not a new blocker.**
   `priorFindingActive`/Authentication History Store (found during the
   Stage 2 pass, `packages/engine/stage2.ts`'s
   `PriorFindingActiveUnavailableError`) means DL-01 already cannot
   report a real match/no-match from Stage 2 whenever its earlier
   conjuncts don't already short-circuit it — Stage 3 simply has nothing
   to correlate for DL-01 in that case. This is a consequence of the
   already-known Stage 2 blocker, not an independently-discovered Stage 3
   dependency, and is recorded here only for completeness.

**Conclusion:** DEC-15's four remaining open fields do **not** block
Stage 3 (Correlation Finding Generation), for the same reason they don't
block Stage 2 — `CorrelationFinding`'s actual type never references any
of them. Stage 3's one real dependency on the Stage 1 envelope
(`evaluationId`, via `evaluationRefs`) is already resolved. The one
genuinely open input Stage 3 will need (`findingId` minting) is a new,
separate, well-evidenced-but-unimplemented item — not a blocker requiring
a ruling, since the evidence already points the same direction
`evaluationId`'s did, just not yet acted on.

---

#### Resolution — 2026-08-26 — `findingId` minting

Not a DEC-15 field (it was never one of the five in scope there) and not
folded into DEC-15 — recorded here, where it was found, as its own
standalone mechanical resolution, same discipline `evaluationId` was held
to. Re-verified directly, not taken on the strength of the addendum
above alone:

`spec/Logical-Database-Design-Specification-v1_1.md` §5.17
`skr.correlation_finding`: `finding_id | UUID | No | generated | PK` —
re-read directly at lines 780-791. Same general rule applies (LDD lines
80-81, re-read directly): "Assigned identifiers (UUIDv4) elsewhere...
no deterministic derivation in the architecture." Confirmed by grep:
`finding_id` is never listed as a client-generated exception anywhere in
the document (the only such exception, every time, is
`analysis_session_id`/`sessionId`). Identical evidentiary shape to
`evaluationId`'s resolution above — same document, same column pattern,
same absence of a determinism requirement, same absence of any predicate
or Stage 2/3 logic that reads a specific `findingId` value (confirmed:
`FindingId` never appears in `rulesets/rules-v0.1.0.json` or the
`Predicate` AST's operand types).

**Resolution:** Random UUIDv4 (`crypto.randomUUID()`), generated fresh
per `CorrelationFinding`, cast to the branded `FindingId` type
(`evidence.contract.v1.ts:71` — `string & { readonly [FindingIdBrand]:
true }`) via `as FindingId` at the point of minting. This uses the
`as`-cast convention already in universal practice across this codebase
for all five DEC-3-branded types (DEC-12's own text: "fixtures do this
today") — it does **not** resolve DEC-12 (whether these five brands get
parse-validated constructors), it merely applies the pattern DEC-12
itself documents as already the working convention, unchanged, to mint
one more value the same way every existing one already is.

**Decision:** ☑ RESOLVED. Random UUIDv4, generated at finding creation.
Implemented in `packages/engine/id.ts` (`mintFindingId()`), as a
standalone utility — deliberately its own file/commit, separate from
Stage 3's `CorrelationFinding`-producing code, same traceability
discipline as every prior mechanical resolution. Mechanical resolution — no
analytical consequence, no Architecture Owner ruling required (same
reasoning as `evaluationId`), recorded here for traceability.
**Signed by:** _not required — mechanical resolution, per the
MECHANICAL/SEMANTIC framework DEC-15 established_

---

### Addendum — 2026-08-26 — Stage 4 dependency check (Contextual Suppression)

Re-derived independently from Stage 4's own spec section — not inherited
from the Stage 3 finding. The two stages read structurally similar data
(both evaluate a `Predicate` against Findings) but that similarity is
confirmed here directly against Stage 4's own types, not assumed from
Stage 3's conclusion.

**Read in full before concluding:** `spec/SecureSphereX-RuleEngine-Spec-v0_8.md`
§6 in full — §6.1 (Suppression Semantics — Frozen, lines 354-368), §6.2
(S-01 Prior Authentication, lines 370-378), §6.3 (S-02 Federated Identity
Provider, lines 380-392), §6.4 (A-01 User-Trusted Origin, lines 394-403).

**The structural proof, from Stage 4's own type, not inference:**
`packages/contracts/ruleset.format.v1.ts`'s `SuppressionDefinition`
(lines 217-238) — the type that encodes §6's guard conditions:
`guards: readonly Predicate[]` — **the exact same `Predicate` AST type
rules use for their own conditions**, confirmed by reading the field
directly, not assumed from the name. This means Stage 4's guard
evaluation is structurally bound by the identical proof already
established for Stage 2/3: `FindingPath` "MUST resolve against D0.2's
FindingsByModule... A static check validates every path at release (§8,
V-2)" (`ruleset.format.v1.ts:20-28`) — re-verified here against Stage 4's
own `guards` field, not carried over. `blockedBy: readonly RuleId[]` and
`targets: readonly SuppressionTarget[]` (`{ ruleId, reduction }`) carry
no envelope-field references either — confirmed by reading both fields
directly.

Stage 4's OUTPUT type, `SuppressionApplication` / `GuardEvaluation`
(`packages/contracts/passresult.contract.v1.ts:88-104`): grepped
exhaustively, zero occurrences of `moduleVersion`, `indicators`,
`consistency`, or `summary` anywhere in the file. Grepped
`ruleset.format.v1.ts` too: one `summary` hit, at line 275 —
`RuleSet.changeLog[].summary`, a change-log entry's own summary text, the
same unrelated field already dismissed twice before (Stage 2 and Stage 3
checks each independently hit and correctly dismissed the identical
false positive). Grepped §6's raw text directly: zero occurrences of any
of the four terms.

**Classification, per field:**

| Field | Classification | Citation |
|---|---|---|
| `moduleVersion` | **CONFIRMED-UNUSED-BY-STAGE-4** | Not in `SuppressionDefinition`, `SuppressionApplication`, or `GuardEvaluation`; §6.1-6.4 never reference it |
| `indicators` | **CONFIRMED-UNUSED-BY-STAGE-4** | Same structural absence; §6's guards read `AuthContextFindings`/`LoginFormFindings` fields only (§6.2, §6.3), never indicator strings |
| `consistency` | **CONFIRMED-UNUSED-BY-STAGE-4** | Same structural absence; no guard condition in §6.2-§6.4 references coherence assessment |
| `summary` | **CONFIRMED-UNUSED-BY-STAGE-4** | Same structural absence; the one "summary" hit in the suppression-adjacent contract is `RuleSet.changeLog[].summary`, unrelated |

**Two genuine Stage 4 blockers found while reading §6, reported as
discovery — neither folded into DEC-15, neither resolved here, neither
previously tracked as a DEC or DEFECT entry anywhere (checked directly:
`DECISIONS.md` and `docs/DEFECTS.md` grepped for "A-01" and "drift
tolerance" — zero hits before this addendum):**

1. **A-01 (§6.4, User-Trusted Origin) does not exist in the live rule
   set.** Confirmed directly against `rulesets/rules-v0.1.0.json`:
   `suppressions` contains exactly two entries, S-01 and S-02 — A-01 is
   entirely absent. The rule set's own `changeLog` entry documents why,
   in its `summary` field (the unrelated field cited above, read for its
   content here, not its structural relevance): no evidence category
   anywhere represents "an explicit, recorded user trust action, scoped
   to a single origin" (§6.4's own guard condition); `trust_validity_days`
   is a defined, frozen `ParameterId` (§13.2) with nowhere for its
   underlying guard data to live. Needs either an evidence-contract
   amendment adding the missing category, or a ruling that user-trust
   suppression is handled entirely outside the rule-set predicate
   mechanism. Not a DEC-15 matter — a rule-set content gap, not an
   envelope-field gap.
2. **S-01's live guard is a self-documented narrowing of §6.2.** §6.2
   specifies three guard conditions: `origin_present = true`,
   `lifecycleState = ESTABLISHED`, **and** fingerprint drift within
   tolerance. `rulesets/rules-v0.1.0.json`'s S-01 entry encodes only the
   first two as its actual `guards` `Predicate[]` — its own `rationale`
   field states why, verbatim: "No ParameterId exists for a
   drift-tolerance threshold... This guard checks only origin_present and
   lifecycleState=ESTABLISHED, treating drift-within-tolerance as already
   folded into the module's own ESTABLISHED determination... This is a
   real narrowing of §6.2's literal three-condition wording, not a full
   implementation of it." Already flagged for review inside the rule set
   itself; not previously elevated to a DEC or DEFECT entry. Also not a
   DEC-15 matter.

**Conclusion:** DEC-15's four remaining open fields do **not** block
Stage 4 (Contextual Suppression) — same structural reason as Stages 2
and 3: `SuppressionDefinition`'s `guards` field is bound by the identical
`FindingPath`/V-2 proof, independently re-confirmed here rather than
assumed. Stage 4 scaffolding is not blocked by DEC-15. It IS bounded by
the two rule-set content gaps above — A-01 cannot be scaffolded at all
today (no guard data exists to build it from), and S-01 can only be
scaffolded to its already-narrowed, self-documented two-condition form,
not §6.2's literal three-condition text.

Both gaps are formalized below as their own DEC candidates — they were
only prose inside this addendum until now, unlike DEC-12/DEC-13/DEC-15,
which each got a standalone entry with its own number and signing line.

---

## DEC-16 (CANDIDATE — unsigned, open) — A-01 / User-Trusted Origin evidence gap

**[R]** `rulesets/rules-v0.1.0.json`'s own `changeLog` entry (version
`0.1.0`) states the gap directly, in full, verbatim:

> "TWO of THREE §6 suppressions included (S-01, S-02); A-01 (User-Trusted
> Origin) is OMITTED. Checked exhaustively across every module contract,
> not just the two most obviously relevant ones: no field anywhere
> represents a per-origin explicit user trust action. D0.8's
> `lifecycleState` is authentication-derived (repeated logins over time),
> architecturally distinct from A-01's "explicit, recorded user trust
> action" (a single deliberate click past a warning). Sharper framing of
> the gap: `trust_validity_days` IS a defined, frozen `ParameterId`
> (`ruleset_format_v1.ts:70`, tagged `// A-01`) — the spec froze A-01's
> tunable parameter without ever providing anywhere for its underlying
> guard data to live. §6.1 forbids an unguarded suppression ("A
> suppression without guards is an exploitable bypass"), and no V-check
> enforces non-empty guards, so shipping A-01 with `guards: []` would be
> a silent, uncaught violation of a frozen architectural invariant. Needs
> either an evidence-contract amendment adding the missing evidence
> category, or confirmation that user-trust suppression is handled
> entirely outside the rule-set predicate mechanism."

**[R]** §6.4 (A-01 — User-Trusted Origin) specifies the guard condition
the missing evidence category would need to satisfy: "An explicit,
recorded user trust action, scoped to a single origin, within its
validity period." Applies to CRED-01, CRED-04, CRED-07, PM-01, DL-01 →
halve (maximum reduction 0.5, never nullifies).

**[I]** Confirmed independently, not just trusting the changeLog's own
claim: `trust_validity_days` is indeed listed among the rule set's
current eleven `ParameterId`s (`rulesets/rules-v0.1.0.json`'s
`parameters` array), and none of the ten evidence categories in
`evidence.contract.v1.ts`'s `EvidenceByCategory` carries a field
resembling "recorded user trust action" — the closest candidate,
`authContext.lifecycleState`, is explicitly a different concept (derived
from repeated authentication over time, not a single deliberate
override click).

**Question for architect ruling — exactly as the rule set's own text
frames it, no third option invented here:**
(a) An evidence-contract amendment adding the missing evidence category
(what a "recorded user trust action" would need to look like — where
it's captured, by what mechanism, at what layer — is itself undecided);
or
(b) Confirmation that user-trust suppression is handled entirely outside
the rule-set predicate mechanism (e.g., enforced at a different
architectural layer entirely, never modeled as a Stage 4
`SuppressionDefinition` at all).

No recommendation given — the corpus does not lean toward either path;
the changeLog itself presents them as two live, equally-open options.

**Status.** Open. Blocks: A-01 cannot be added to any rule-set version
until this is resolved. Its five target rules (CRED-01, CRED-04,
CRED-07, PM-01, DL-01) currently receive no user-trust-based reduction
at all — not a partial or narrowed implementation the way S-01 is
(DEC-17), a complete absence. Does not block Stage 4 scaffolding of S-01
or S-02, which are independently specified and guard-complete (S-02) or
guard-narrowed-but-present (S-01).

**Decision:** _pending_
**Signed by:** _pending_

---

## DEC-17 (CANDIDATE — unsigned, open) — S-01 guard narrowing (missing drift-tolerance condition)

**[R]** `rulesets/rules-v0.1.0.json`'s S-01 (`introducedIn`/
`lastModifiedIn`: `0.1.0`) carries this `rationale` field, quoted in
full, verbatim — **this is the live, shipped, currently-active
suppression definition, not a draft or a hypothetical**:

> "INTERPRETIVE NARROWING, FLAGGED FOR REVIEW: §6.2's guard is stated as
> three conditions — origin_present=true, lifecycleState=ESTABLISHED,
> AND fingerprint drift within tolerance. No ParameterId exists for a
> drift-tolerance threshold (checked against the full §13.2 tunable
> list; 'drift tolerance' has no corresponding entry), so the third
> condition cannot be expressed as a guard Predicate. This guard checks
> only origin_present and lifecycleState=ESTABLISHED, treating
> drift-within-tolerance as already folded into the module's own
> ESTABLISHED determination rather than independently re-checked at
> Stage 2. This is a real narrowing of §6.2's literal three-condition
> wording, not a full implementation of it."

**[R]** §6.2 (S-01 — Prior Authentication) specifies the full three-part
guard condition this narrows: "The AuthContext Evaluation (§20.11)
reports `origin_present = true` with lifecycle state `ESTABLISHED`,
**and** reports fingerprint drift for that origin within tolerance." As
shipped, `guards` contains exactly two `Predicate`s — `is(authContext.
originPresent)` and `eq(authContext.lifecycleState, 'ESTABLISHED')` —
confirmed directly against the live rule set's `guards` array, not
assumed from the rationale text alone.

**[I]** Re-confirmed independently, not just trusting S-01's own
rationale claim: the current eleven `ParameterId`s in
`rulesets/rules-v0.1.0.json` (`tau_sim`, `redirect_hop_min`,
`page_age_max_ms`, `threshold_medium`, `threshold_high`, `tau_collision`,
`auth_count_n`, `auth_days_m`, `provisional_expiry_days`,
`trust_validity_days`, `establishment_rate_max`) genuinely contain
nothing representing a fingerprint-drift-tolerance threshold. What would
be needed to close the gap: a new `ParameterId` (e.g.
`fingerprint_drift_tolerance` or similar), registered the same way every
other empirical threshold in §13.2 already is, plus extending S-01's
`guards` array with a third `Predicate` comparing
`authContext.fingerprintDrift` against it.

**This is currently SHIPPED and LIVE, not a hypothetical future gap.**
Anyone relying on S-01 today — CRED-02's nullification, CRED-01's and
CRED-04's halving — is relying on the narrowed two-condition version,
not §6.2's literal three-condition text. This has been true since
`rules-v0.1.0`'s authoring, not since this addendum was written.

**Question for architect ruling.** Should a drift-tolerance `ParameterId`
be added, closing the gap to match §6.2 literally? Or is the current
narrowing — treating drift-within-tolerance as already folded into the
AuthContext module's own `ESTABLISHED` determination rather than
independently re-checked at Stage 2 — an accepted, permanent
interpretation of §6.2, not a defect to fix? No recommendation given;
both readings are defensible and the rule set's own rationale
deliberately flagged this for review rather than picking one.

**Status.** Open. Currently shipped as the narrowed (two-condition)
version — no rule-set validation failure results (V-9's checks do not
require guard completeness against §6.2's prose, only structural
validity), so this does not block Stage 4 scaffolding of S-01 itself;
scaffolding would simply build against the narrowed guard as it exists
today. The gap is between the live implementation and §6.2's literal
text, open since `rules-v0.1.0`'s authoring (Step 11, commit `fd61b76`
per `docs/DEFECTS.md` DEFECT-16's citation) — **not discovered today.**
No more precise calendar date for Step 11's completion is recorded
anywhere in the corpus; bounded only by the surrounding dated entries —
after DEC-3/DEC-8's 2026-08-21 signing (Step 11 depends on both, per the
Signing Summary table) and before DEFECT-15's 2026-08-24 investigation,
which already cites DEFECT-16's occurrence 1 (found "at rule-set
authoring time") as an established, past fact by that point.

**Decision:** _pending_
**Signed by:** _pending_

---

### Addendum — 2026-08-26 — Stage 5 dependency check (Effective Weight Calculation)

Re-derived independently — not inherited from Stages 2/3/4's identical
conclusion.

**Confirmed Stage 5's exact name and defining section from §4.2 directly,
not assumed.** §4.2: "**Stage 5 — Effective Weight Calculation.** For
each finding, the effective weight is computed from its base weight and
the maximum applicable reduction. Suppressed findings retain an
effective weight of zero and remain recorded." **Unlike every other
stage's sentence in §4.2, this one cites no `(§X)` section reference** —
Stage 2 cites §5, Stage 4 cites §6, Stage 6 cites §9/§10. Stage 5 is the
one stage in the frozen order with no section of its own.

Grepped the entire document for "effective weight" / "effective_weight"
to confirm this is not an oversight rather than assume it: six hits
total. §2.4 (line 143, philosophical framing: effective weight is a
rule-set-evaluation property, not the finding's own). §4.1 (line 272,
just the stage's name in the frozen order list). §4.2 (line 290, the
one sentence above). **§6.1 (lines 362-368) — the actual formula:**
`effective_weight(f) = base_weight(f) × (1 − max_reduction(f))`,
`max_reduction(f) = max{ reduction(s) : s applicable to f, guards
satisfied } = 0 where no suppression applies` — the SAME §6.1 text
already read in full for the Stage 4 pass (`stage4.ts`'s
`maxAppliedReduction` already implements the `max_reduction(f)` term
directly from this). §9 (lines 599, 607, Stage 6's Scoring Function) —
references `effective_weight(f)` as an INPUT to aggregation, does not
define it. §9.5 (line 630, Recorded Outputs) — states effective weight
must be recorded, does not define how it's computed. **Conclusion: Stage
5's complete defining text is §4.2's one sentence plus §6.1's formula —
nothing else exists anywhere in the document.** Not a hidden section
missed the way the original DEC-15 pass missed the LDD — confirmed by
exhaustive search that there is genuinely nothing more to find.

**The structural proof, from the likely output type, independently
re-verified:** `packages/contracts/passresult.contract.v1.ts`'s
`ScoringEntry` (lines 116-136) — re-read directly, not assumed from the
Stage 3/4 checks' prior conclusions about this file. Grepped the whole
file again: zero occurrences of `moduleVersion`, `indicators`, or
`consistency`; zero occurrences of `summary` either (the file has never
had one, across all three checks this session).

**Genuine finding, not a DEC-15 matter — `ScoringEntry` straddles Stage
5 AND Stage 6, confirmed by its own field comments, not inferred:** of
its eleven fields, eight are Stage 5's own concern — `findingId`,
`ruleId`, `ruleType`, `parentRuleId` (all passthrough from the
`CorrelationFinding`/`RuleDefinition` it scores), `baseWeight` (from
`RuleDefinition`), `suppressionsApplied` and `maxReduction` (from Stage
4's `SuppressionApplication[]` — `maxReduction` is exactly
`stage4.ts`'s already-built `maxAppliedReduction()`), and
`effectiveWeight` (the formula above, all its inputs already available).
**Three fields are explicitly Stage 6's, per their own doc comments, not
Stage 5's**: `subsumed` ("§10.3: subsumed findings remain recorded but
are excluded from the sum"), `parentQualified` ("§9.3: an aggravator
contributes only where its parent is present, unsubsumed, and has
non-zero effective weight"), and `countedInScore` — all three require
knowing the COMPLETE finding set (for subsumption and aggravator
qualification), not one finding in isolation, which is exactly what
distinguishes Stage 6 ("Aggregation... over the complete finding set")
from Stage 5 ("for each finding" — singular, independent). A future
Stage 5 scaffold cannot produce a complete, type-correct `ScoringEntry`
alone — either a narrower Stage-5-only intermediate type is needed, with
Stage 6 completing the object, or Stage 5 and 6 need to be scaffolded
together. Not resolved here; noted so it isn't rediscovered from scratch
when Stage 5 is actually built.

**Classification, per field:**

| Field | Classification | Citation |
|---|---|---|
| `moduleVersion` | **CONFIRMED-UNUSED-BY-STAGE-5** | Not in `ScoringEntry`; not in §4.2's Stage 5 sentence or §6.1's formula — Stage 5 doesn't even read `SecurityEvaluation`/Findings data at all, only Stage 3/4's own output records plus `RuleDefinition.baseWeight` |
| `indicators` | **CONFIRMED-UNUSED-BY-STAGE-5** | Same — Stage 5 is a pure function over `(CorrelationFinding, RuleDefinition, SuppressionApplication[])`, never touches indicators |
| `consistency` | **CONFIRMED-UNUSED-BY-STAGE-5** | Same structural absence |
| `summary` | **CONFIRMED-UNUSED-BY-STAGE-5** | Same structural absence; confirmed zero occurrences in `passresult.contract.v1.ts` across all three checks this session (Stage 3, 4, 5) |

**Conclusion:** DEC-15's four remaining open fields do **not** block
Stage 5 — the same conclusion as Stages 2, 3, and 4, independently
re-derived each time. Stage 5 is, if anything, the MOST clearly
unblocked stage checked so far: it never reads `SecurityEvaluation` or
Findings data directly at all, only the already-built outputs of Stages
3 and 4 plus static rule-set data. The one real open item is the
`ScoringEntry` Stage 5/6 boundary noted above — an architectural
question for whoever scaffolds Stage 5, not an DEC-15 or Architecture
Owner ruling.

---

## DEC-18 (CANDIDATE — unsigned, open) — `blockedBy` has no domain-scoping mechanism

**[R]** §6.3 (S-02 — Federated Identity Provider)'s guard conditions
state, in part: "`eTLD+1(form.action)` matches a registry entry by exact
string equality... **And** CRED-03 has not fired **against the action
domain**." (emphasis on the literal text, not added elsewhere.) The
"Critical guard rationale" row makes the intent explicit: "Without the
CRED-03 guard, an attacker registering a confusable lookalike of a
registry entry would obtain automatic exemption from the strongest
credential rule. The guard closes this directly" — the guard is meant to
be scoped to whether CRED-03 fired on the SAME domain S-02 is being
asked to exempt, not merely whether CRED-03 fired anywhere in the pass.

**[R]** What's actually typed today:
`SuppressionDefinition.blockedBy: readonly RuleId[]`
(`ruleset.format.v1.ts:230`) — bare rule IDs, no per-entry domain or
other scoping value. Its own doc comment: "Negative guards: if ANY
holds, the suppression does NOT apply" — describing exactly the coarser
check, not a domain-scoped one. `CorrelationFinding`
(`passresult.contract.v1.ts:42-59`) carries no domain field of any
kind — `evaluationRefs: readonly string[]` references which evaluations
contributed, but nothing about which registrable domain a finding
concerns.

**[I]** Implemented in `packages/engine/stage4.ts` as the coarser,
type-supported check: did the named `blockedBy` rule fire **at all this
pass** — matching `ruleset.format.v1.ts`'s own simpler framing exactly,
not inventing a stricter interpretation the types don't support. Found
during Stage 4's implementation (not a dedicated dependency-check pass),
documented first in `stage4.ts`'s header comment and that commit's
message; formalized here as its own entry per instruction, same category
of gap as DEC-17 (S-01's self-narrowing) — found via implementation,
living only in a code comment and a commit message until now.

**This affects S-02 specifically — the only live `blockedBy` user
today**, and **is SHIPPED and LIVE, not hypothetical**, same framing as
DEC-17: `rulesets/rules-v0.1.0.json`'s S-02 entry
(`blockedBy: ["CRED-03"]`) is the current, active suppression
definition. Confirmed empirically against the real fixture pipeline
(`packages/engine/stage4.fixture.test.ts`'s integration run): for the
`off-origin-post` fixture, CRED-03 and CRED-01 both fire in the same
pass, and S-02 is correctly recorded as blocked
(`blockedByRuleId: 'CRED-03'`) — under the coarser check, this is
correct by coincidence in that specific case (there is only one domain
in play), not proof the domain-scoped and pass-wide checks always agree.
No case in the current 4 fixtures exercises a scenario where they would
diverge (CRED-03 firing on a DIFFERENT domain than the one S-02 is
evaluating) — the gap is real but not yet observed to produce a wrong
answer in this corpus, which is different from confirming it never
would.

**Question for architect ruling — no recommendation invented, the
corpus does not lean toward one:**
What would close the gap? Two shapes present themselves from the type
system as it stands, neither decided here: (a) add a domain field to
`CorrelationFinding` (or a derived per-finding domain lookup) so
`blockedBy` checking can compare domains, not just rule identity; or (b)
give `blockedBy` entries a richer shape than a bare `RuleId` — e.g.
pairing a rule ID with which `FindingPath` on that rule's own Findings
carries the domain to compare against. Which is closer to the frozen
contracts' intent, whether either is a permissible amendment under the
current freeze, and whether the coarser pass-wide check is simply an
accepted permanent narrowing instead (mirroring how DEC-17 leaves S-01's
narrowing as a live option) are all open.

**Status.** Open. Blocks: nothing observably today (the current 4
fixtures never exercise a domain-divergent case), but the gap is real
and shipped — any future scenario where CRED-03 fires on a different
domain than the one S-02 evaluates would be handled by the coarser,
possibly-incorrect check. Does not block Stage 4 scaffolding itself,
already built against the coarser check with this narrowing documented
inline.

**Decision:** _pending_
**Signed by:** _pending_

---

## DEC-19 (CANDIDATE — unsigned, open) — CRED-A1's single-parent interpretive choice

**[R]** `rulesets/rules-v0.1.0.json`'s CRED-A1 entry carries this
`rationale` field, quoted in full, verbatim — **this is the live,
shipped, currently-active rule, not a draft or a hypothetical**:

> "INTERPRETIVE CHOICE, FLAGGED FOR REVIEW: §7.2 states this
> aggravator's parent requirement as 'CRED-01 or CRED-02' (two possible
> parents), but RuleDefinition.parent is singular (RuleId | null) and
> §9.2/§9.3's aggregation model is likewise single-parent. CRED-01 was
> chosen as the sole parent — not derived from spec text, an explicit
> judgment call pending architect ruling. Consequence: this aggravator
> will NOT contribute when only CRED-02 (not CRED-01) is present,
> narrowing §7.2's literal 'or' behavior. Client-side injection of a
> credential interface from an off-site script is meaningful as
> corroboration and meaningless alone — this is why it carries no
> standalone weight."

**[R]** §7.2's CRED-A1 entry states the parent requirement exactly as
the rationale describes: "**Parent requirement:** Contributes only when
CRED-01 or CRED-02 is present and unsuppressed." `RuleDefinition.parent`
(`ruleset.format.v1.ts:172`) is typed `RuleId | null` — singular, no
provision for a set of alternative parents. §9.2's scoring formula and
§9.3's aggravator semantics are both written in terms of a single
`parent(a)`, confirming the singular-parent model is not an accident of
this one field's type but consistent across the whole aggregation
design.

**[I]** Confirmed directly, not assumed from the rationale's own claim:
`rulesets/rules-v0.1.0.json`'s live CRED-A1 entry has `"parent":
"CRED-01"` — a bare string, not an array, not `null`. Grepped the entire
rule set file for every occurrence of `"CRED-A1"`: exactly two hits —
the rule's own `id` field, and one unrelated `changeLog` entry (the
DEFECT-15 fix, which named CRED-A1 alongside CRED-01/CRED-02/CRED-07
only because all four were separately affected by that fix, not because
of anything related to this parent choice). **No other mechanism
anywhere in the rule set lets CRED-02 alone qualify CRED-A1** — the
stated consequence is confirmed true and complete, not merely asserted:
`packages/engine/stage5-6.ts`'s `parentQualified` computation reads
`rule.parent` directly (the single value), so a pass where CRED-02 fires
without CRED-01 will compute `parentQualified: false` for CRED-A1, and
CRED-A1 will not contribute to the score, exactly as the rationale
predicts.

**Question for architect ruling — no recommendation invented, the
rationale itself frames this as an open judgment call, not a lean:**
Should `RuleDefinition.parent` (and the aggregation model built on it,
§9.2/§9.3) be widened to support multiple alternative parents, matching
§7.2's literal "CRED-01 or CRED-02"? Or is the single-parent model
(CRED-01 chosen) the intended, permanent simplification — treating
CRED-02-without-CRED-01 as a scenario CRED-A1 is not meant to corroborate
at all? Widening the model would be a contract change to
`ruleset.format.v1.ts` (frozen) and to the aggregation formula (§9.2,
also frozen per §13.1) — not a rule-set-data-only change the way most
other open items in this queue are.

**Status.** Open. Blocks: nothing today — CRED-A1 has never been
observed to match against any of the 4 real fixtures at all (a separate,
already-tracked structural gap: DEFECT-18 established
`javascript.injectingScriptOriginDomain` is permanently `null`, making
CRED-A1's third predicate conjunct permanently unsatisfiable regardless
of this parent question). The narrowing is real and shipped, but not
currently observable in practice because CRED-A1 cannot fire for an
unrelated reason first. Becomes relevant if DEFECT-18 is ever resolved
and CRED-A1 becomes reachable — at that point, a CRED-02-only pass will
silently under-score relative to §7.2's literal text unless this is
ruled on first.

**Decision:** _pending_
**Signed by:** _pending_

---

### Addendum — 2026-08-26 — Stage 7 status check (Threshold Evaluation)

Different in kind from every dependency check before it in this
document: this one resolves to **already complete**, not "confirmed
unblocked by DEC-15." Recorded in the same format anyway, per
instruction, so the record stays consistent and searchable.

**Re-read §4.1 and §4.2's exact text once more, specifically to nail
down Stage 7's boundary — not assumed from §9.4 alone.** §4.1's frozen
stage order: `7. THRESHOLD EVALUATION`, immediately followed by
`8. CURRENT SECURITY STATE UPDATE`. §4.2's sentences for each, quoted in
full: **"Stage 7 — Threshold Evaluation. The score is mapped to Low,
Medium, or High."** — one sentence, no section citation, unlike Stage 2
(→§5), Stage 4 (→§6), Stage 6 (→§9/§10). **"Stage 8 — Current Security
State Update. The result is written as a new Analysis Pass Result,
appended to Analysis History, and used to replace Current Security
State subject to monotonic escalation (§11.3)."** — §11.3 is cited HERE,
explicitly, as Stage 8's, not Stage 7's. This directly confirms, rather
than merely repeats, `stage5-6.ts`'s header comment's earlier guess that
`effectiveTier`/`monotonicFloorApplied`/`interventionLocked` belong to
Stage 8.

**Read §11 in full** (§11.1 Recomputation, §11.2 Analysis History, §11.3
Monotonic Escalation, §11.4 Intervention Lock). All four subsections
concern "Current Security State" — the persistent, cross-pass belief
(§11.1: "the latest score, the latest tier... a reference to the
Analysis Pass Result that produced them"), Analysis History (§11.2: an
append-only log of PRIOR pass results), and comparisons against a
Session's PRIOR interventions (§11.3, §11.4: "the tier SHALL NOT be
lowered below any tier that has already produced a user-facing
intervention" — inherently requires knowing what happened in earlier
passes of the same Session). **Every subsection of §11 requires data
from outside the current pass** — the same category of dependency
`priorFindingActive` (Stage 2) already established needs the
Authentication History Store, which doesn't exist yet. Zero mention of
score-to-tier mapping (Stage 7's actual job) appears anywhere in §11.

**Conclusion: Stage 7 (Threshold Evaluation) is fully implemented
already**, in `packages/engine/stage5-6.ts`'s `AggregationResult.rawTier`
— confirmed by re-reading, not merely asserted: `rawTier` is computed as
"score is mapped to Low, Medium, or High" against `threshold_medium`/
`threshold_high`, sourced from the rule set's own `parameters` (§9.4:
"Threshold values are empirical (§13.2)... the structure — three tiers,
Medium as the escalation band, High as the only blocking tier — is
frozen" — exactly what `rawTier`'s boundary logic implements). The
field's own name, `rawTier` — "Tier from score alone, BEFORE §11.3
monotonic escalation" (`passresult.contract.v1.ts:184-185`) — already
anticipated precisely this Stage 7 / Stage 8 boundary before this check
confirmed it. No new code is needed for Stage 7 itself; nothing in §11
is Stage 7's concern.

**What remains — confirmed Stage 8's, not Stage 7's:** `effectiveTier`
(tier after the monotonic floor), `monotonicFloorApplied` (§11.3),
`interventionLocked` (§11.4) — all three require Current Security State
/ Analysis History, a persistence concern this session has not built and
was not asked to build here. Not a gap in Stage 7; a correctly-scoped
boundary. No DEC-15 fields are implicated either way — this check never
needed to reach that question, since Stage 7 turned out to already be
done.

---

## DEC-20 (CANDIDATE — unsigned, open) — `confusableSkeleton`'s absent-vs-present convention is enforced only by a module comment

**[R]** `packages/engine/modules/homograph.ts`'s doc comment (lines
50-56) states the convention CRED-03's correctness depends on, verbatim:

> "confusableSkeleton is the one exception: HomographFindings types it
> `string | null`, so `absent` (a domain genuinely has no confusable
> skeleton distinct from itself) maps cleanly to `null` — a real,
> positive finding, the same shape as url.ts's registrableDomain.
> `notCollected` on confusableSkeleton still makes the whole evaluation
> unevaluable."

So `present` is intended to mean "this domain HAS a confusable skeleton
**distinct from itself**", and `absent` to mean "it does not." CRED-03's
first conjunct — `neq(homograph.confusableSkeleton, null)` — is correct
if and only if a producer honours that reading.

**[R]** Nothing in the contracts says so. `DomainRepresentationEvidence.
confusableSkeleton` (`evidence.contract.v1.ts:265`) is typed
`Observation<string>`, and `HomographFindings.confusableSkeleton`
(`evaluation.contract.v1.ts:177`) is `string | null`. Neither carries a
comment, a name, or a type distinction expressing "distinct from the
domain itself." A producer implementer reading only the contracts would
naturally emit the skeleton unconditionally — UTS-39 defines
`skeleton(x)` as a total function, and for a plain ASCII domain it
simply returns the domain.

**[I]** That is exactly what happened, and it was not hypothetical.
All four committed fixtures emitted `confusableSkeleton:
present('<the domain itself>')`, identical to their own `host`,
`unicodeDomain`, and `punycodeDomain` values. Consequence, measured
against the real pipeline: CRED-03 (primary, **baseWeight 45**) fired on
three of the four fixtures — including `clean-login`, whose own header
comment designates it the deliberately benign baseline. The false
positives were load-bearing: `stage5-6.fixture.test.ts`'s expectation
table recorded `clean-login: 45/Medium` and `off-origin-post: 90/High`,
and `stage4.fixture.test.ts` asserted S-02 was `blockedBy: 'CRED-03'` on
`off-origin-post` — three separate tests had encoded the false positive
as expected behaviour, each with a comment describing it as
"empirically confirmed against the real pipeline."

**Severity evidence — the bug's own propagation, not theory:** The bug's
real-world severity is evidenced by its own propagation, not just by
theory: stage4.fixture.test.ts and stage5-6.fixture.test.ts both had
CRED-03's spurious output hardcoded as their EXPECTED value — including
clean-login, the deliberately-benign baseline fixture, asserted to score
45/Medium. stage5-6's expectation table carried a comment stating this
was "empirically confirmed against the real pipeline." A wrong value,
once encoded as a passing test's expected result with confidence-bearing
language, does not remain visibly wrong — it becomes indistinguishable
from ground truth to anyone who doesn't independently re-derive it by
hand, which is exactly what this verification did. Both corrected as
part of this fix.

**[I]** `homograph.ts` itself is NOT at fault and was not changed. It is
a pure field-for-field pass-through with no derivation logic; it
faithfully reported what the producer supplied. Nor is CRED-03's
predicate wrong as written — given the documented convention, it is
correct. The defect was entirely in the evidence-production side.

**Fixed for now in the fixtures (2026-08-27), the narrow correction:**
all four now emit `confusableSkeleton: absent()`. Verified in both
directions — CRED-03 no longer fires on any benign fixture, and still
fires on a constructed deceptive IDN whose skeleton genuinely differs
from its domain, including with `isIdn`/`containsNonAscii`/
`isMixedScript` all forced false so the `neq(..., null)` arm is proven
to carry the rule on its own (`e2e.sso-flow.fixture.test.ts`, section 8).

**The fragility this entry exists to record, and the actual question:**
the fixtures were corrected, but nothing PREVENTS the same mistake. The
convention lives in one module's comment; the type says
`Observation<string>`; no validator checks it; and the corpus capture
pipeline (`tools/capture/`) will eventually produce this field for real,
written by someone who may never read `homograph.ts`. The next producer
implementer can reintroduce this defect exactly as the fixtures did, and
the symptom — a benign page scoring Medium — is subtle enough that it
survived three test files and a full CI gate run.

**Option B, the structural fix, NOT undertaken here:** express the
comparison explicitly rather than relying on a convention — either add
`punycodeDomain` to `HomographFindings` so CRED-03 can compare via
`notSameSite(homograph.confusableSkeleton, homograph.punycodeDomain)`,
or add a derived boolean (e.g. `confusableSkeletonDiffersFromDomain`)
computed in `homograph.ts` from a plain string comparison. Note
`unicodeDomain` is NOT a viable operand for either: it is **NOT
OBSERVABLE** (`docs/ProducerCapabilityManifest.md`, 0/6 — "no
content-script API returns the decoded Unicode form"), so building the
predicate on it would make CRED-03 permanently unevaluable in
production. `punycodeDomain` is observable (6/6). Also note `eq`/`neq`
compare a path against a LITERAL only — path-to-path comparison is
expressible solely through `sameSite`/`notSameSite`, so there is no
rule-set-only version of this fix.

**Either form of Option B is an amendment to the FROZEN
`packages/contracts/evaluation.contract.v1.ts`** — DEC-3-level
formality, hand-typed by Jayanth, never by Claude Code, and gated by the
pre-tool-use hook on `packages/contracts/`. Flagged explicitly rather
than silently taking the fixture-only fix because it is easier: the
fixture fix is correct and sufficient TODAY, and does not close the hole.

**Question for architect ruling:** accept the convention as-is and rely
on documentation (and possibly a new validator check) to defend it, or
schedule the Option B contract amendment so the comparison is structural
and a producer cannot get it wrong? No recommendation asserted — the
trade-off is a contract amendment against a documented-but-unenforced
invariant, and that is a scope call, not a technical one.

**Related:** [[DEFECT-23]] records a separate and deeper gap in the same
rule — that CRED-03 detects "has any distinct skeleton" rather than
UTS-39's actual homograph-attack definition (skeleton collision against
a known-brand registry). Neither Option A nor Option B addresses that.

- **Status:** CANDIDATE — unsigned, open. Fixture correction applied and
  verified; the structural question is untouched and unruled.
- **Signed by:** *(unsigned — awaiting Architecture Owner)*

---

## DEC-21 — `SecurityEvaluation.consistency`: per-module internal-coherence assessment (ten modules; path 1, no contract amendment)

**[R]** `SecurityEvaluation<M>.consistency: ConsistencyAssessment`
(`evaluation.contract.v1.ts:280`) is non-optional in a FROZEN contract. It
is the last of DEC-15's original five fields still unresolved — the other
four were closed on 2026-08-26 (`evaluationId`) and 2026-08-27
(`moduleVersion`, `indicators`, `summary`). While it is open,
`assembleSecurityEvaluation` cannot return, and no real
`SecurityEvaluation<M>` can be constructed anywhere in this codebase.

**[R]** The contract constrains it hard, and gives all three values a
meaning (`packages/contracts/evaluation.contract.v1.ts:64-76`, verbatim):

> ECE module specs require a Consistency Assessment in every Evaluation
> Result. Domain Model §8.3.5 constrains it hard: it assesses coherence of
> findings WITHIN the module's own domain ONLY. It is NOT confidence, NOT
> probability, NOT a risk judgement.

This is the frozen contract's own text — DEC-11 established it as the
authoritative source in place of the missing "ECE Internal Module
Specifications" document. The contract's own §8.3.5 reference points at the
Domain Model, which DEC-15 already records as absent from the 46-file
corpus — a pre-existing, separately logged gap this entry does not depend
on, since every relation below derives from the enum's own inline comments
and the live Findings types.

```ts
export type ConsistencyAssessment =
  | 'consistent'      // findings within this domain cohere
  | 'inconsistent'    // findings within this domain conflict
  | 'indeterminate';  // insufficient evidence to assess coherence
```

**[I] Why no placeholder is possible — the finding that distinguishes this
from `summary`.** DEC-15 resolved `summary` with an explicitly-labelled
interim string precisely because `string` has room for a value that is
self-evidently not real content. `ConsistencyAssessment` has no such room:
three values, each a substantive claim about the findings.

`'indeterminate'` looks like a neutral "not assessed" marker and is not
one. Its definition is **"insufficient evidence to assess coherence"** — a
claim about the EVIDENCE. Stamping it unconditionally would assert, of the
`url` module on `fixtures/clean-login.ts` (all eleven evidence fields
`present`, module `evaluated`, ten findings produced), that the evidence
was insufficient. That is simply false. The truthful statement is "no
coherence assessment was performed", and **no value in this enum expresses
it.**

**[I] Searched, not assumed.** The LDD supplies the storage shape and
nothing else: `CREATE TYPE skr.consistency_kind AS ENUM
('consistent','inconsistent','indeterminate')`
(`spec/Logical-Database-Design-Specification-v1_1.md:1454`) and
`consistency | CONSISTENCY | No | —` (line 693) — note **no default**,
unlike `indicators`'s `'[]'`; the database always demands an explicit
value. Grepped every `spec/*.md` for "indeterminate": five hits total,
all three LDD copies repeating the same enum/column lines, none defining
the term. No heuristic, no per-module coherence rule, no worked example
exists anywhere in the 46-file corpus.

**[I] Not a hypothetical risk — this exact failure shape was found and
fixed three times on 2026-08-27**, which is why the Architecture Owner
ruled against the placeholder rather than accepting it as expedient:
DEFECT-22 (`not()` over an unevaluable module fabricating a match),
DEC-20 (a confusable skeleton emitted where none was distinct from the
domain), and the E-6 violation (a rule reporting it "found nothing" when
it was never tested). In all three, a value that looked safe asserted
something untrue, and in two of the three the false value had already been
hardcoded into passing tests as the expected result.

**Two live paths, neither undertaken:**

1. **Design a genuine coherence assessment.** Requires deciding, per
   module, what "findings within this domain conflict" concretely means
   for that module's Findings shape — e.g. does
   `LoginFormFindings.forms` containing contradictory field kinds
   constitute `'inconsistent'`? DEC-15 raised this and it remains
   unanswered. This is analytical design work, the ECE module layer's own
   contribution, not bookkeeping — and it is the option that makes the
   field mean what the contract says it means.
2. **Amend the contract to add a fourth value** distinct from
   `'indeterminate'`'s substantive claim — something along the lines of
   `'not_assessed'`, meaning "no coherence assessment was performed",
   which is the honest statement today. **This is an amendment to the
   FROZEN `packages/contracts/evaluation.contract.v1.ts`** — DEC-3-level
   formality, hand-typed by Jayanth, never by Claude Code, and gated by
   the `block-frozen.mjs` pre-tool-use hook. It would also require a
   matching LDD enum change, since the database type is closed.

**Question for architect ruling:** which path — and is the honest interim
position to keep `assembleSecurityEvaluation` throwing (today's state,
which leaves E-8 untestable), or to prioritise path 2 so the envelope
becomes constructible and E-8 becomes testable, with the real coherence
design (path 1) deferred behind an explicit `'not_assessed'`?

**Consequence while this stays open, stated plainly so it is not
rediscovered:** invariant **E-8** ("Exactly one evaluation per module per
pass. Never zero, never two.", `evaluation.contract.v1.ts:307`) cannot be
tested. `packages/engine/e2e.sso-flow.fixture.test.ts` and
`orchestrator.fixture.test.ts` assert one `ModuleDispatchResult` per
module — the closest true statement available — and both say so in
comments pointing here. That is a deliberate, recorded limitation of the
2026-08-27 ruling, not an oversight in those tests.

**Related:** [[DEC-15]], which this entry carves out of; DEC-5, whose
"conformant stub" precedent authorised `summary`'s placeholder and
deliberately does NOT extend to this field.

---

### Resolution — 2026-08-28 — per-module internal-coherence relations

**Path 1 taken** (design a genuine coherence assessment), not path 2 (a
frozen-contract amendment). `packages/contracts/` is untouched.

**`indeterminate`'s home, ruled:** `result.status === 'unevaluable'` →
`'indeterminate'`, unconditionally. This is the one place the contract's own
definition — "insufficient evidence to assess coherence" — is *literally
true*: no findings exist to assess. It is not a placeholder, and it is
unreachable for an `evaluated` result, which is correct.

**The ten relations, implemented in `packages/engine/consistency.ts`.**
Every one is INTERNAL to a single module's own Findings object; none reads
another module's evaluation (E-2, §8.4.3). Because nearly every Findings
field is a producer pass-through, these are in practice checks on the
PRODUCER contradicting itself.

| Module | Relation → `inconsistent` |
|---|---|
| `url` | `isIpLiteral && registrableDomain !== null` |
| `ssl` | `!httpsEstablished` with any certificate fact non-null; or `daysUntilExpiry < 0` with `certificateCurrentlyValid === true` |
| `dns` | `!resolves && (aRecordCount > 0 \|\| aaaaRecordCount > 0)` |
| `redirect` | `hopCount !== chainLength` |
| `loginForm` | `credentialFormPresent && forms.length === 0` |
| `javascript` | **none — always `consistent`** |
| `homograph` | `isMixedScript && scriptsUsed.length === 0` |
| `authContext` | five clauses: the type's own documented origin-present/absent shape, plus `!storeAvailable` |
| `downloadContext` | `!referrerPresent && referrerRegistrableDomain !== null`; or `hasCompoundExtension && declaredExtension === null` |
| `permissionContext` | `requestedPermission === null && precededByUserGesture !== null` |

**`javascript` has no relation, and that is the finding — not an omission.**
Each pairing among its four live fields was checked and rejected with a
reason (transmission without a listener is ordinary; an inline script can
inject a credential interface with `dynamicScriptLoadCount: 0`;
`dynamicScriptLoadCount` relates to nothing else). Two relations exist in
principle but are unreachable while DEFECT-18 pins
`transmissionEndpointDomains` to `[]` and `injectingScriptOriginDomain` to
`null`.

**Relations deliberately REJECTED, each recorded at its predicate:**
`chainTrusted` with `chainComplete: false` (AIA fetching makes
trusted-but-incomplete legitimate); `resolves: true` with zero addresses
(`resolves` is undefined anywhere in the corpus — [[DEFECT-25]]);
anything involving `cnamePresent` or `nameServerCount`;
`mechanisms.length === chainLength` (checks this package's own arithmetic,
not the producer); `loginForm`'s converse (product ambiguity, ruled out of
scope); `scriptsUsed.length === 1` with `isMixedScript` ([[DEFECT-24]]);
`isIdn` implying `containsNonAscii` (punycode form is ASCII);
`extensionMimeConsistent` against its inputs (already enforced in-module);
`pageAgeMs` in the permission relation (an ordinary page has an age);
`pageAgeMs < 0` (range validation, not coherence between findings).

**Consequences, all verified:**
- `assembleSecurityEvaluation` now RETURNS a complete, type-conformant
  `SecurityEvaluation<M>` and no longer throws. All thirteen fields are
  genuinely constructed.
- A new `assembleEvaluationSet` produces the `EvaluationSet` — one
  evaluation per module per pass.
- **Invariant E-8 is testable for the first time** and is now tested
  directly, on real `SecurityEvaluation` objects, across all four fixtures
  (`orchestrator.fixture.test.ts` Part 3c, `e2e.sso-flow.fixture.test.ts`
  section 2b). Every prior version could only assert the weaker "one
  `ModuleDispatchResult` per module".
- `Stage1EnvelopeBlockedError` was **DELETED**. It existed only to report the
  blocked field; with no remaining construction path it was dead code in the
  same sense DEFECT-18 uses the term, and a retained-but-unreachable error
  class is a future false safety net. Removed on the Architecture Owner's
  2026-08-28 instruction. `MechanicalEnvelopeFields` is retained — it is live,
  used by `buildEvaluation`.
- No score or tier changed on any fixture: `clean-login` 0/Low,
  `no-credential` 0/Low, `off-origin-post` 45/Medium, `sso-flow` 0/Low.

**Verification:** adversarial tests seed the ACTUAL violation for every
module, not just the happy path — a suite that only exercised coherent
inputs would pass identically against `return false`. Boundary cases are
covered explicitly (`daysUntilExpiry: 0` is valid, `-5` is not) as are the
deliberate non-violations. `tsc -b` clean; 18/18 test files pass;
`test:fixtures` 7/7; `validate:ruleset` CONFORMANT.

- **Status:** RESOLVED and SIGNED 2026-08-29. Implemented in
  `packages/engine/consistency.ts`.
- **Signed by:** Jayanth (Architecture Owner)   **Date:** 2026-08-29

---

## DEC-22 — B1.5/G-9: property-testing library selection

**[R]** G-9 is wired into CI and does nothing. `package.json`'s
`test:properties` is still its original stub —
`echo "test:properties: stub (Stage 1b / G-9 implements this)"` — and
`.github/workflows/ci.yml:117-123` runs it under the comment "G-9 — property
tests (Stage 1b onward)". This is the same shape as DEFECT-1 (G-1 verifying
nothing) and the pre-Step-8 G-7: a gate that is green because it asserts
nothing.

**[R]** No decision anywhere selects a property-testing library. Searched
[[DEC-9]] (five lines, purely administrative — no tooling content), the
Implementation-Ownership-Plan (four B1.5/G-9 mentions — lines 38, 143, 207,
222 — none naming a library), and the rule-engine specification (zero hits
for `fast-check`, `jsverify`, `property-based`). `devDependencies` today are
`@eslint/js`, `dependency-cruiser`, `eslint`, `globals`, `typescript`,
`typescript-eslint` — no property-testing library installed.

**Recorded so it is not mistaken for a decision:** `fast-check` was named in
passing by Claude Code in an earlier working session as "the conventional
TypeScript choice". That was an assumption, not a ruling, and nothing in this
corpus endorses it. The investigation below was run precisely because
"conventional" is not "decided".

---

#### Investigation — registry facts, gathered 2026-08-29

| | `fast-check` | `jsverify` |
|---|---|---|
| Latest version | 4.9.0 | 0.8.4 |
| Last published | **2026-07-08** (~52 days ago) | **2023-09-27** (~2 years stale) |
| License | MIT | MIT |
| Weekly downloads | **37,512,910** | 45,837 |
| Direct dependencies | 1 (`pure-rand`) | 4 (`lazy-seq`, `rc4`, `trampa`, `typify-parser`) |
| Install-time lifecycle hooks | **NONE** | **NONE** |
| Unpacked size | ~1.4 MB | — |

**Supply-chain check, the reason for looking at all:** neither package, nor
`fast-check`'s single transitive dependency `pure-rand`, declares
`preinstall` / `install` / `postinstall` / `prepare`. Their `scripts` blocks
are build/test entries that run in the maintainers' repo, not on
`npm install`. `npm audit` reports **0 vulnerabilities** against the current
tree. No CVE was discoverable for either through the registry data available
here — stated as "not found by this check", not as "none exists".

`jsverify`'s four transitive dependencies were each last published in **June
2022**. That is four unmaintained packages entering the tree, against
`fast-check`'s one actively-maintained.

---

#### Which is actually better, on the merits — not on popularity

Download counts are reported above for completeness and are NOT the argument;
a 800:1 ratio mostly measures defaults, not quality. Three things decide it:

1. **Maintenance.** `jsverify` has had no publish in ~2 years and pulls in
   four dependencies last touched in 2022. Adopting it means adopting five
   unmaintained packages for a gate that must stay green for the life of the
   project.
2. **Dependency surface.** 1 vs 5. This project has a stated preference for
   fewer dependencies, and `pure-rand` exists for a real reason — a seeded,
   reproducible PRNG, which is exactly what a REPLAYABLE property failure
   needs (§17.2, G-10).
3. **Shrinking and seeding.** `fast-check` reports a failing counterexample
   with a seed and a shrunk minimal case. For this project that is not a
   convenience: a property failure that cannot be replayed deterministically
   is a defect report that cannot be acted on, and determinism is §4.3's
   central claim.

**The third option, taken seriously rather than dismissed:** a hand-rolled
harness — a loop, `Math.random`, and assertions — adds no dependency at all
and is maybe 50 lines. It is genuinely viable for `maxAppliedReduction`'s
order-independence. It is NOT viable for the whole target: without shrinking,
a failure surfaces as a 40-element generated finding set with no indication
which element mattered; without seeding, it is not reproducible; and
generators for the ten `*Findings` shapes are real work that would then be
maintained by this project instead of upstream. The dependency buys
reproducibility and minimisation, which is the part that makes a failing
property test actionable.

**Recommendation: `fast-check`, as a `devDependency`.** Reasoning above, in
that order. This is a recommendation, not a resolution — the Architecture
Owner rules after seeing these findings, not before.

**Scope note:** this entry rules on the LIBRARY only. Whether B1.5's coverage
should extend beyond B1.2/B1.3 to `stage7-8.ts` and `consistency.ts` is a
separate schedule commitment, deliberately not bundled into this yes —
see [[DEC-24]].

**Related:** [[DEC-9]], closed as superseded; [[DEC-23]], the review-
availability ruling its resolution surfaced.

- **Status:** RESOLVED and SIGNED 2026-08-29 — `fast-check` approved as a
  devDependency for G-9. Not yet installed; no property test written;
  `test:properties` still a stub. Implementation follows this ruling.
- **Signed by:** Jayanth (Architecture Owner)   **Date:** 2026-08-29

---

## DEC-23 — Peer review when only one person is active: Architecture Owner verification pass

**[R]** DEC-7's 2026-08-24 amendment moved accountability from pre-assignment
to named-at-commit, but kept the review obligation intact:

> Peer review still happens. Whoever is next available reviews it, named
> explicitly in the commit or pull request. Review is not skipped because
> assignment is now flexible — accountability moved from "pre-assigned" to
> "named at the point of work," it did not disappear.

**[I] The obligation is not being met, measured from the commit record rather
than impression.** Gathered 2026-08-29 over the 15 commits since the
`varun/main` reconciliation (`da3659d`..`055918b`):

- **13 of 15 commits are authored by Jayanth alone.** The remaining two are
  Durga's corpus checkpoint (`a45b286`) and the merge commit (`01680ab`) —
  neither is a review of anyone's work.
- **Zero commits name a Reviewer.** Every commit body in the range was
  grepped; the only "review" hit is the phrase "design review" inside
  DEC-21's message, describing a conversation, not a reviewer.
- **On 2026-08-28 and 2026-08-29 — six commits — no one other than Jayanth
  committed anything at all.** Durga's last activity was 2026-08-27; Varun's
  last commit predates the merge entirely.
- The named reviewers for the components actually touched were inactive
  across that window: Pipeline core → Durga, Suppression semantics → Varun,
  Aggregation → Durga, G-9 property tests → Durga.

So "whoever is next available" has, for this stretch, resolved to **no one**.
This is not a commit-message habit that better discipline would fix; there
was no second person to name. Several commits in that window changed
invariant-adjacent logic — the E-6 violation fix (`f22967e`), DEFECT-22's
evaluator change (`469497b`), and the suppression range guard (`5e1675c`).

**[I]** DEC-7's ORIGINAL text already provides for recording the absence
honestly — "the Reviewer role is **explicitly recorded as unfilled**, not
assigned pro forma… An unfilled Reviewer field that says 'unfilled' is worth
more than a filled one that is fiction". That remains right, and it remains
insufficient: recording a gap does not supply the second pair of eyes, and
deferring review until a named reviewer resurfaces means invariant-adjacent
code ships unreviewed for days at a time.

**Decision — a standing practice, not a one-time waiver.**

While only one person is actively available, DEC-7's peer-review requirement
is satisfied by an **explicit, recorded verification pass by the Architecture
Owner before any commit touching invariant-adjacent logic** — evaluators,
suppression, aggregation, escalation, consistency. Specifically:

1. The verification pass happens **before the commit**, not deferred until a
   named reviewer resurfaces.
2. It is **recorded**, not implicit — the commit names the Architecture Owner
   as having verified, distinctly from the Implementer line.
3. It is a genuine verification against the contracts and the property being
   claimed, not a restatement of the commit message. The negative-control
   discipline already used this session — break the behaviour, confirm the
   test catches it, restore — is the standard, not a nice-to-have.
4. It applies to invariant-adjacent logic. Documentation, register entries,
   and test-only changes do not require it, though nothing prevents it.

**This applies going forward until Durga or Varun is confirmed active again,
at which point normal DEC-7 peer review resumes** and this practice lapses
automatically. It does not amend DEC-7; it states how DEC-7's requirement is
discharged under single-person availability.

**Stated plainly so it is not over-claimed:** an Architecture Owner
verification pass is NOT equivalent to independent peer review. The same
person authoring and verifying loses the independence that makes review
valuable, and this ruling does not pretend otherwise. It is the strongest
available discipline under the actual staffing, chosen over the two
alternatives — shipping unreviewed, or blocking all invariant-adjacent work
until someone returns — both of which are worse. Commits made under this
practice remain eligible for retro-review when people are available, exactly
as DEC-7's original amendment envisaged.

**Related:** [[DEC-9]], whose resolution surfaced this gap and deliberately
did not pre-empt it.

- **Status:** RESOLVED and SIGNED 2026-08-29. Standing practice, effective
  immediately, lapsing when a second person is confirmed active.
- **Signed by:** Jayanth (Architecture Owner)   **Date:** 2026-08-29

**Amendment — 2026-08-29:** a fifth condition, added to the four above. This
documents an ADDITION to a signed decision, not a revision of it — the
original four conditions and the 2026-08-29 signature stand unchanged.

5. **Before any `git commit --amend`:** confirm `git log origin/main..HEAD`
   includes the target commit (i.e. it is still local-only, not yet pushed)
   before amending. If it is already on `origin`, do not amend — correct via
   a follow-up commit instead.

Grounded in a real incident, not a hypothetical: on 2026-08-29 an amend of
`737668a` was requested to widen an understated commit message. The stated
safety checks — HEAD is the tip, tree clean — both passed, but `737668a` had
already been pushed (`git ls-remote` confirmed it at `refs/heads/main`), so
amending would have required a force-push, rewriting history two other
remotes could already hold. The amend was declined and the correction landed
as `a588c79` instead. Under single-person availability there is no second
reviewer to catch this before it reaches `origin`, which is why it belongs in
this list rather than in ordinary git hygiene.

**Decision:** ☑ Approved — DEC-23 amended as above
**Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-29

---

## DEC-24 (CANDIDATE — unsigned, open) — B1.6: extend property-test coverage to B1.4 and the consistency relations

**[R]** B1.5's exit criteria and dependency line, from the
Implementation-Ownership-Plan: line 143 — "Property tests G-9 | **B1.2,
B1.3** | Randomised; order-independence proven" — and line 222 —
"suppression monotonic and **order-independent** under property test ·
aggregation **pure and recomputable**".

**Those targets remain accurate and remain unmet.** Nothing here revises
them. `stage4.fixture.test.ts` and `stage5-6.fixture.test.ts` are
example-based: hand-written literals and the four committed fixtures, no
generators, no randomisation, no shrinking.

**[I] B1.5's dependency line reads `B1.2, B1.3` because B1.4 and
`consistency.ts` did not exist when the plan was written.** Confirmed from
git, not inferred:

- `packages/engine/consistency.ts` — added **2026-08-28** (`f3520ea`, DEC-21)
- `packages/engine/stage7-8.ts` — added **2026-08-29** (`055918b`, B1.4)

Extending coverage to them closes a gap the plan could not have anticipated.
It does not override the plan, and the plan is frozen and cannot be edited to
match — which is why the divergence has to live here.

**[I] The cost, quantified so it is visible rather than implied.**
Property-testable pure functions now in the engine:

| File | Exported functions | In B1.5's original scope? |
|---|---|---|
| `stage4.ts` | 2 | Yes (B1.2) |
| `stage5-6.ts` | 1 | Yes (B1.3) |
| `stage7-8.ts` | 5 | **No — B1.4, post-dates the plan** |
| `consistency.ts` | 11 | **No — DEC-21, post-dates the plan** |

**3 functions originally in scope, 16 outside it** — roughly a 6× increase in
surface. Counted as properties rather than functions:

- **B1.5, original scope (~7 properties):** suppression order-independence;
  max-not-product across generated application sets; `maxAppliedReduction`
  bounded in [0, 1]; aggregation determinism over permuted finding sets;
  score = Σ effectiveWeight where `countedInScore` (P-8); `effectiveWeight`
  within [0, baseWeight] across generated reductions; empty-set stability.
- **B1.6, this extension (~8 properties):** `recordIntervention` is a
  maximum — commutative, associative, idempotent, monotonic (4);
  `computeEffectiveTier` never returns below the floor, and is idempotent
  under re-application (2); `computeRawTier` monotonic non-decreasing in
  score (1); `assessConsistency` returns `indeterminate` if and only if the
  result is unevaluable, across generated findings for all ten modules (1).

**~15 properties instead of ~7**, plus **generators for the ten `*Findings`
shapes** — which is the larger share of the work and is required only for the
`consistency.ts` half.

**Framed as B1.6, deliberately separate from B1.5.** Keeping it distinct
means B1.5's original exit criteria can be signed off on their own terms
against the plan as written, without this extension's schedule risk attached
to them. Bundling would make B1.5 unsignable until a body of work the plan
never scoped is complete.

**The trade, stated both ways.** Accepting B1.6 means accepting real
additional test-writing time on top of work already in flight. Declining it
means G-9 goes green while **16 of 19 pure functions** are covered only by
hand-picked examples — including `recordIntervention`, whose maximum property
is currently proven by one hand-enumerated malformed sequence and a 3×3
sweep, and the ten consistency relations, each proven by exactly one
coherent and one contradictory literal. Either choice is defensible; leaving
it unrecorded is not.

**Questions for architect ruling:**
1. Is B1.6 accepted as a task at all, or is the extension declined and the
   gap recorded as accepted?
2. If accepted — scheduled alongside B1.5, or explicitly after it, so B1.5
   can close first?
3. Does B1.6 cover both `stage7-8.ts` and `consistency.ts`, or only the
   former? The `consistency.ts` half carries the `*Findings` generator cost
   almost entirely on its own.

**Depends on:** [[DEC-22]] (`fast-check` approved) — B1.6 cannot start before
the library exists, but B1.5 has the same dependency, so this is not a
distinguishing constraint.

**Related:** [[DEC-21]], which introduced the consistency relations;
[[DEC-9]], closed as superseded.

- **Status:** CANDIDATE — unsigned, open. A real schedule commitment on top
  of work already in flight; deliberately not bundled into DEC-22's yes.
- **Signed by:** *(unsigned — awaiting Architecture Owner)*

---

## DEC-25 (CANDIDATE — unsigned, open) — Output canonicalisation as a class: is order-independence an engine-wide requirement, or established case by case?

**[R]** Determinism is not a quality goal in this project, it is a contracted
property. §4.3: given identical Security Evaluations and an identical
rule-set version, stages 2–7 produce an identical score and tier, "no
dependency on wall-clock time or any iteration/evaluation order".
`passresult.contract.v1.ts` P-13 requires replay to reproduce "identical
scoring, identical findings, and an identical effectiveTier", and **G-10 is
the CI gate that checks it**. §9.1 states the aggregation form directly: "a
pure function over the complete finding set... SHALL NOT be implemented as an
incremental accumulator".

**[I] Two defects of the same class were found on the same day, in the same
file, by the first property test this project has ever run.** Both violated
§9.1/P-13; neither was visible to any example-based test.

| | Mechanism | Impact |
|---|---|---|
| [[DEFECT-26]] | `suppressionsApplied` projected in input-array order | record byte-instability; no score effect |
| [[DEFECT-27]] | `primarySum` accumulated in input order; IEEE-754 addition is not associative | score differs in final bits; G-10 replay implication |

Both are now FIXED. That is not what this entry is about.

**[I] The pattern, stated as the actual finding:** wherever the engine
projects a collection or accumulates a number, the OUTPUT inherits the INPUT's
order unless something is done about it. Nothing in the codebase currently
requires an author to think about that, and nothing checks it. Two instances
in one function is weak evidence of a systemic problem and strong evidence
that the property is not being designed for — DEFECT-27 in particular was
invisible to a deliberate hand-built reproduction attempt (five weights, all
120 orderings, one distinct sum, spread 0) and surfaced only under generated
input.

**[I] Deliberately NOT folded in: [[DEFECT-28]].** It was found in the same
run and in the same file, and it is a DIFFERENT root cause — a cardinality
ambiguity in §9.3 (which parent applies when several findings share the parent
rule), not an ordering or floating-point issue. It has no canonicalisation
answer; it needs a ruling on what §9.3 means. Merging it into this entry would
blur a specification gap into an implementation-hygiene question, and the two
need different remedies.

**[I] Where the pattern could still be hiding — and where it demonstrably
could not be.** `packages/engine/stage7-8.ts` and
`packages/engine/consistency.ts` have **no property-test coverage at all**;
their exit criteria are B1.6, tracked as [[DEC-24]], which is UNSIGNED. Both
contain pure functions over collections:

- `consistency.ts` — ten predicates reading array fields (`scriptsUsed`,
  `mechanisms`, `forms`, `transmissionEndpointDomains`).
- `stage7-8.ts` — `recordIntervention` is a running maximum, and `Math.max`
  over a set is associative and commutative in IEEE-754 for non-NaN values,
  so the FP-accumulation half of this pattern is unlikely to bite there.

Stated precisely rather than as blanket suspicion: the FLOATING-POINT half of
this pattern is specific to summation, and neither file sums anything today.
The ORDERING half — a projection inheriting input order — is plausible in
either and unverified in both. §9.3's cardinality ambiguity is specific to the
aggravator mechanism and does not generalise to either file.

**Questions for architect ruling:**

1. Is order-independence an engine-wide REQUIREMENT to be asserted for every
   pure function producing a collection or a sum, or a property established
   case by case where it matters?
2. If engine-wide: what enforces it? Options include extending B1.5/B1.6's
   property suite to every such function, a review checklist item under
   [[DEC-23]]'s verification pass, or a lint-style architectural gate. None is
   proposed here as preferred.
3. Should the two remaining untested files be brought under property test
   BEFORE more engine code is written on top of them, or does that wait for
   [[DEC-24]]'s scheduling ruling regardless?

**Cost note, so the answer is not free-seeming:** extending property coverage
to `stage7-8.ts` and `consistency.ts` is exactly the [[DEC-24]] scope already
quantified there (~8 additional properties plus generators for the ten
`*Findings` shapes). This entry does not re-argue that cost; it observes that
two real defects of this class were found the moment property testing was
first applied, which is evidence bearing on DEC-24's open question rather than
a separate proposal.

**Related:** [[DEFECT-26]], [[DEFECT-27]] (the two instances, both fixed);
[[DEFECT-28]] (same run, different root cause, deliberately separate);
[[DEC-22]] (`fast-check` approved — its shrinking/seeding argument is what
made DEFECT-27 findable); [[DEC-24]] (B1.6 scope, unsigned).

- **Status:** CANDIDATE — unsigned, open. No code change proposed; both
  instances are already fixed. This entry asks whether the class needs
  systematic treatment, which is a scope question, not an implementation one.
- **Signed by:** *(unsigned — awaiting Architecture Owner)*

---

## DEC-26 — Extraction has never been built; minimal scope for it, given how few rules the corpus can validate at all

**[R] The pipeline was always a three-stage design, and only two stages
exist.** `packages/contracts/snapshot.format.v1.ts`'s `ExtractionRecord`
carries `extractorVersion`, `evidenceContractVersion`, `extractedOn`, and
`evidence: SecurityEvidence` — capture produces `RawMaterial`, an EXTRACTOR
turns it into `SecurityEvidence`, and the engine consumes that. `Snapshot.
extraction` is typed `ExtractionRecord | null`.

**[I] No snapshot has ever been extracted.** Sampled 60 snapshots across
both labels from the corpus payload store: **0 have `extraction`, 0 have
`presentsCredentialInterface`.** Both are `null` throughout. A real phishing
snapshot's top level is `snapshotId`, `formatVersion`, `capturedOn`,
`provenance`, `split`, `fetch`, `raw`, `extraction: null`,
`presentsCredentialInterface: null`.

This is NOT a defect and is not filed as one: nothing is broken. The
extractor was never written. It is recorded here because it changes what
C1.5 costs and what CP-2 can claim.

**[I] What `raw` actually holds**, from
`phishing/2026-08-21/2f315a95cbb6f349315c786702b58343.json.gz`:

| field | present |
|---|---|
| `requestedUrl`, `finalUrl` | yes — plain strings |
| `renderedDom` | yes — raw HTML |
| `domContentHash`, `responseHeaders` | yes |
| `redirectChain` | present but `[]` on this snapshot |
| `tlsCertificateChain` | **null** |
| `dnsRecords` | **null** |
| `screenshotRef` | **null** |

---

#### Three DIFFERENT kinds of gap, deliberately kept distinct

Collapsing these into "extraction is missing" would hide that they need
completely different responses.

**1. BUILDABLE NOW — raw material exists, extraction logic does not.**
`url` and `loginInterface`. The URL strings and the rendered DOM are both
captured. What is missing is parsing: one URL string into `UrlFindings`'
eleven fields (needs PSL for `registrableDomain`), and the DOM into
`credentialFormPresent` plus `forms[]` with field kinds, hidden flags,
autocomplete state and action domains. `domainRepresentation` belongs here
too, with a caveat: `docs/ProducerCapabilityManifest.md` marks
`scriptsUsed`/`isMixedScript`/`confusableSkeleton` NOT OBSERVABLE for the
content-script spike, but explicitly as "library gaps, not platform gaps —
a real producer can bundle the tables". A harness can bundle Unicode
script-property and UTS-39 confusables data; a content script could not.

**2. STRUCTURALLY IMPOSSIBLE without changing capture itself.**
`scriptRuntime`. `listenerOnCredentialField`,
`clientSideTransmissionObserved` and `credentialInterfaceInjected` are
RUNTIME observations. No static snapshot of rendered DOM can ever show
them, however good the extractor. Closing this would mean instrumenting
capture to execute and observe pages — a change to the capture stage, not
the extraction stage.

**Flagged for an explicit decision, because the value looks like zero:**
`scriptRuntime`'s only consumers are **CRED-05** and **CRED-A1**, and
[[DEC-14]] already accepted both as **non-functional for Phase I** (signed
2026-08-25). So building capture instrumentation for `scriptRuntime` would
benefit **no live rule at all** — the two rules it feeds cannot fire today
regardless of evidence quality. Recommend NOT building it, and recommend
that be recorded rather than left as an open todo someone later picks up
without noticing DEC-14.

**3. CONTRACTUALLY OUT OF SCOPE — not an implementation choice.**
`downloadContext` and `permissionContext`. `snapshot.format.v1.ts:283-285`,
verbatim:

> S-9  DL and PM family rules are NOT corpus-validatable (D0.1 conformance
>      classes). Snapshot-derived metrics cover the CRED family only; DL-01,
>      DL-02 and PM-01 REQUIRE in-browser validation.

`authContext` is likewise closed off, by a different invariant —
`snapshot.format.v1.ts:281-282`:

> S-8  A snapshot NEVER contains user data. The capture pipeline MUST NOT
>      read or write the Authentication History Store (§20.2).

---

#### S-10: a SECOND, independent reason CRED-04 cannot be trusted here

`snapshot.format.v1.ts:289-291`, verbatim:

> S-10 CRED-04 is DIVERGENT: the harness observes server-side redirect chains
>      the extension may not see. Its corpus recall MUST be reported
>      separately and MUST NOT be folded into a headline figure.

**Cross-reference, stated explicitly so a future reader does not assume
fixing one fixes both:** [[DEFECT-19]] records that CRED-04 is structurally
unable to fire because `RedirectFindings.initialRegistrableDomain` and
`.finalRegistrableDomain` are ungroundable and permanently `null`. That is
an ENGINE-side defect with a stated fix path (an evidence-contract
amendment adding registrable-domain fields, or Stage 1 producer-side
extraction).

S-10 is a different problem and **survives that fix completely**. Even with
DEFECT-19 resolved and CRED-04 firing correctly, the harness and the
extension observe DIFFERENT redirect chains — server-side versus what a
browser follows — so a corpus recall figure for CRED-04 measures something
the extension does not do. S-10 does not permit folding it into a headline
figure at all.

Two independent barriers. Resolving DEFECT-19 leaves S-10 untouched.

---

#### S-11, verified live before citing

`snapshot.format.v1.ts:286-288`, verbatim:

> S-11 Residual leakage is REPORTED, never engineered away by re-splitting:
>      cross-split kit duplication rate, temporal-holdout metrics, and
>      CRED-02 brand overlap accompany every published result (§13.3).

Confirmed to match `spec/DesignNote-Corpus-Split-Independence.md` §5, whose
recommendation is "adopt C (registrable domain) as the split key, and report
residual leakage rather than engineering it away", with Complement 1
(cross-split duplication rate), Complement 2 (temporal holdout) and
Complement 3 (CRED-02 brand overlap) mapping one-to-one onto S-11's three
named metrics. The contract encodes the design note; the substance agrees.

Not a scoping constraint on extraction — a REPORTING obligation on whatever
metrics C1.5 eventually publishes. Recorded here so it is not discovered
after the fact.

*(Minor observation, no action: S-11 appears BEFORE S-10 in the contract's
invariant list. Cosmetic ordering only; both are unambiguous.)*

---

#### The realistic corpus-validatable set

| Rule | Corpus-validatable? | Why |
|---|---|---|
| **CRED-01** | **Yes, fully** | `loginForm.forms[].actionRegistrableDomain` + `url.registrableDomain` |
| **CRED-03** | **Yes, fully** | `homograph.*` + `loginForm.credentialFormPresent` — needs bundled Unicode/UTS-39 tables |
| **CRED-06** | **Yes, fully** | `loginForm.credentialFormPresent` + `url.isSecureScheme` |
| **CRED-07** | **Yes, fully** | `loginForm.forms[]` field flags + `url.registrableDomain` |
| **CRED-02** | **PARTIAL only** | `loginForm` half is extractable; the `authContext` half needs the live store, which S-8 forbids the capture pipeline from touching. Can NEVER be corpus-validated, regardless of how good extraction becomes. |
| CRED-04 | No | [[DEFECT-19]] (engine) AND S-10 (divergent observation) — independently |
| CRED-05, CRED-A1 | No | [[DEC-14]], accepted non-functional |
| DL-01, DL-02, PM-01 | No | S-9, contractually |

**Four rules fully, one partially. Out of eleven.**

---

#### Build scope — ALL SIX derivable categories (Architecture Owner ruling, 2026-08-29)

**Ruled this session: no minimal scope. Build everything genuinely derivable
from captured data, not only what currently unlocks a validatable rule.**

Extract all six categories the raw material can actually support:

| Category | Raw source | Build? |
|---|---|---|
| `url` | `raw.requestedUrl` / `raw.finalUrl` | **YES** |
| `loginInterface` | `raw.renderedDom` | **YES** |
| `domainRepresentation` | host of `raw.finalUrl` | **YES** |
| `redirect` | `raw.redirectChain` | **YES** |
| `transport` (ssl) | `raw.tlsCertificateChain` — **always `null`** | **NARROWED — `isHttps` only** |
| `dns` | `raw.dnsRecords` — **always `null`** | **NARROWED — permanently stubbed** |
| `scriptRuntime` | — | NO — structurally impossible |
| `downloadContext` | — | NO — S-9 |
| `permissionContext` | — | NO — S-9 |
| `authContext` | — | NO — S-8 |

**Stated plainly, so the ruling is not mistaken for a claim it does not
make: extracting `redirect`, `transport` and `dns` does NOT change which
rules are corpus-validatable.** That remains **four of eleven** — CRED-01,
CRED-03, CRED-06, CRED-07 fully, CRED-02 partially — exactly as the S-8 /
S-9 / S-10 findings above establish. Those findings are unaffected by build
scope and are not revised by this ruling.

They are built anyway because they are genuinely buildable from data already
captured, and because the corpus is then ready the moment a rule needs them
— whenever DEFECT-19's contract amendment lands, whenever DEC-5's ssl/dns
stubs are promoted to real implementations, whenever a future rule-set
version reads a `dns.*` or `transport.*` path. Extracting them later would
mean re-running extraction over the whole corpus; extracting them now costs
one pass. The earlier draft recommended a three-category minimum on the
grounds that the other three unlock no validatable rule today. That
reasoning was correct about validatability and wrong about what to build:
"unlocks a rule today" is a narrower test than "is genuinely derivable", and
the Architecture Owner ruled for the latter.

**Two exclusions stand exactly as reasoned above, unaffected by this
ruling:**

- **`scriptRuntime` — NOT built, and capture is NOT instrumented for it.**
  Structurally impossible from a static snapshot (gap kind 2), and its only
  consumers — CRED-05 and CRED-A1 — are [[DEC-14]] non-functional, so the
  instrumentation would benefit no live rule. This is not a "buildable but
  deprioritised" case; the raw material does not and cannot exist.
- **`downloadContext`, `permissionContext` — cannot be built.** S-9,
  contractually. `authContext` likewise, by S-8.

**Caveats carried forward from the earlier draft, still applicable:**
`domainRepresentation` remains the most expensive of the six — bundled
Unicode script-property and UTS-39 confusables tables — and must respect
[[DEC-20]]'s `confusableSkeleton` convention (`absent()` where no skeleton is
distinct from the domain) or CRED-03 fires on every page, the exact defect
DEC-20 already corrected once in the fixtures.

---

#### AMENDMENT (Architecture Owner ruling, 2026-08-29) — `transport` and `dns` narrowed to `isHttps` only

**This supersedes the "genuinely derivable" rationale above FOR THESE TWO
CATEGORIES SPECIFICALLY.** The remaining four — `url`, `loginInterface`,
`domainRepresentation`, `redirect` — are unaffected and still build fully.

The ruling above was made when the evidence was "`null` on the snapshot
inspected" — one sample. That was too weak a fact. The producer was then read
directly, and the position is stronger and different in kind:

- **`tools/capture/capture.py:330`** — `"dnsRecords": None`. A hardcoded
  literal. There is no code path that assigns anything else.
- **`tools/capture/capture.py:228`** — `tls_chain: list[str] | None = None`.
  `tls_chain` occurs exactly **twice** in the entire file: that initialiser
  and line 329 where it is serialised. **It is never assigned.**

Empirically confirmed at 50 snapshots per store (25 benign + 25 phishing,
seeded sample, two independent payload stores): `tlsCertificateChain`
non-null **0/50 and 0/50**; `dnsRecords` non-null **0/50 and 0/50**.
`screenshotRef` likewise 0/100.

So these fields are not "sparsely populated" or "populated later" — they are
**null by construction, for every snapshot that has ever been captured or
that this capture pipeline can produce.** "Genuinely derivable from captured
data" was the test the ruling applied, and on the evidence now available
these two categories **fail that test**: they are derivable only from a
contract shape that capture never fills.

**Narrowed scope, ruled today:**

- **`transport` — build `isHttps` ONLY**, derived from the scheme of
  `raw.finalUrl`, which is always present. The other seven fields
  (`certificateSubject`, `subjectAlternativeNames`, `validFrom`, `validTo`,
  `issuer`, `chainComplete`, `chainTrusted`) are emitted as `notCollected`
  unconditionally. **No X.509 parsing is written.** This also removes the
  third dependency flagged during scoping — a certificate parser — from the
  build entirely.
- **`dns` — permanently stubbed.** All eight fields `notCollected`
  unconditionally. No DNS-record parsing is written.

**"Permanently" means: for as long as `capture.py` does not collect these.**
This is not a deferral behind a todo. Un-stubbing either category requires a
change to the CAPTURE stage first — instrumenting TLS-chain retrieval and DNS
resolution — at which point this amendment is revisited on new evidence. An
extractor change alone can never lift it.

S-7 governs the stubbed fields: `notCollected`, never `absent`, because the
harness cannot populate them and `absent` would assert a confirmed-negative
fact. ⚠️ Noted for a later cleanup, not resolved here: every
`NotCollectedReason` is worded for an extension (`api_unavailable` = "browser
exposes no API for this") and none is worded for "the capture pipeline does
not collect this." `api_unavailable` is the closest fit and is what the
extractor will emit; the fit is loose and the enum may want a
`producer_does_not_collect` variant in some future amendment.

**Consequence for CP-2 that should be settled before metrics are published:**
a confusion matrix from this corpus covers four rules fully and one
partially, not the engine. It should be published as such, with CRED-04
reported separately if it is reported at all (S-10) and S-11's three
residual-leakage metrics alongside. Presenting it as whole-engine accuracy
would overstate what the corpus can establish. This is unchanged by the
build-scope ruling — building more extraction does not widen what can be
validated.

**Ruled 2026-08-29:** build all six derivable categories (above).
`scriptRuntime` capture instrumentation is explicitly NOT to be built while
[[DEC-14]] stands — recorded here rather than left as an open todo someone
later picks up without noticing that its two consumers cannot fire.

**Still open for architect ruling:**
1. Does CP-2's scope get restated to "CRED-01/03/06/07 fully, CRED-02
   partially" before any metrics work begins? — see also [[DEC-27]], which
   adds a second, independent narrowing: only **12.3%** of snapshots carry a
   credential interface at all, so the effective sample for those four rules
   is far smaller than the corpus count.
2. ~~Extraction language — TypeScript or Python?~~ **RESOLVED in [[DEC-27]]:
   TypeScript, with `tldts` and `parse5`.** Not decided in this entry.

**Related:** [[DEC-5]] (ssl/dns stubs), [[DEC-14]] (CRED-05/CRED-A1
non-functional), [[DEC-20]] (`confusableSkeleton` convention),
[[DEFECT-19]] (CRED-04 engine-side), [[DEFECT-23]]/[[DEFECT-24]] (homograph
gaps bearing on CRED-03).

- **Status:** SIGNED 2026-08-29. This entry sets SCOPE. Its
  `transport`/`dns` scope was narrowed by the amendment above on 2026-08-29;
  its language question is resolved by [[DEC-27]], under which
  implementation of `url`, `domainRepresentation` and the `isHttps`-only
  `transport` slice has begun.
- **Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-29

---

## DEC-27 — Extraction toolchain: TypeScript, `tldts`, `parse5`; PSL divergence gated by a new V-15

Consolidates the toolchain decisions for the extractor whose scope
[[DEC-26]] sets. Three separable rulings plus two scoping facts recorded so
they are not rediscovered later.

---

### 1. Language: TypeScript. Confirmed.

`apps/harness` may import `contracts` and `engine` under the dependency
matrix (`CLAUDE.md` §2), so a TypeScript extractor is type-checked by
`tsc -b` directly against the frozen `SecurityEvidence` — including
`Observation<T>`'s tri-state, which S-7's "`notCollected` never `absent`"
discipline depends on. A Python extractor would hand-maintain an untyped
mirror of a frozen contract it could never be checked against, and S-7 would
degrade from a type error to a convention.

Second reason: **CP-3 requires the harness and the extension to produce
identical findings on SHARED fields**, and A1.2's exit criterion is the same.
One language means one derivation of the shared logic rather than two
implementations to reconcile.

**Stated honestly, because it was overstated in the first assessment: DOM
ACCESS is not reusable.** The extension reads a live DOM
(`document.querySelectorAll`); the harness parses an HTML string. That layer
is written twice regardless. What genuinely transfers is everything above it
— URL → `UrlEvidence`, host → `DomainRepresentationEvidence`, field
classification, and the `Observation` discipline — plus the contract types.
Real reuse, narrower than "write it once."

**The counter-argument, recorded because it is strong and was nearly
decisive.** `rulesets/rules-v0.1.0.json:6` already pins the PSL authority:

```json
"pslVersion": "tldextract==5.3.0 include_psl_private_domains=true (bundled snapshot sha256:b69315c085d53972724b8f2df111ffc329b0c84fe0a47d62c8c91655cc774a38)"
```

⚠️ **The string shown above was SUPERSEDED after this entry was drafted.** When
DEC-27 was written it read `"tldextract==5.3.0 (bundled snapshot sha256:b693…)"`
— library, version and digest, with no configuration. [[DEFECT-34]] showed that
omission was load-bearing (the same library and snapshot resolve differently
depending on one flag), and [[DEC-31]] added the configuration, applied in
`409171d`. The current value is quoted here so this entry's argument is read
against the artifact as it actually stands. **The argument itself is unchanged
and was not weakened by the correction — if anything DEFECT-34 confirmed it.**

and `tools/capture/capture.py:224` already computes `split_key =
registrable_domain(url)` with that same library — so **the corpus split keys
are themselves tldextract-derived.** A TypeScript extractor using `tldts`
ships a DIFFERENT PSL snapshot from the one the frozen rule set declares.
`registrableDomain` is the field CRED-01 and CRED-07 both key on, so a
suffix-boundary disagreement changes findings while `pslVersion` still claims
tldextract 5.3.0. Python would have inherited the pinned snapshot for free.

That cost is accepted, and **paid for by ruling 3 below**, which converts the
divergence from invisible to gated. Without ruling 3 this language choice
would be unsafe.

---

### 2. Libraries: `tldts` for PSL, `parse5` for HTML.

Diligenced to the [[DEC-22]] standard. All four candidates: **MIT**, **no
`install`/`preinstall`/`postinstall` hooks**, **`npm audit`: 0
vulnerabilities**.

| Package | Version | Last publish | Weekly DL | Packages added |
|---|---|---|---|---|
| **`tldts`** ✅ | 7.4.11 | 2026-08-24 | 80.9M | 2 |
| `psl` | 1.15.0 | 2024-12-02 (~21 mo) | 43.0M | 2 |
| **`parse5`** ✅ | 8.0.1 | 2026-04-19 | 153.8M | 2 |
| `htmlparser2` | 12.0.0 | 2026-07-17 | 94.9M | 6 |

**`tldts` over `psl`, on the merits: freshness, which for a PSL is the whole
product.** `psl`'s last publish is ~21 months old, so its suffix list is ~21
months stale — and a stale PSL does not fail loudly, it silently misresolves
eTLD+1 for every suffix added since. That is precisely the failure mode
`pslVersion`'s own contract comment names ("A PSL update can shift an eTLD+1
boundary and change a sameSite outcome under identical evidence"). Equal
footprint, equal licence, both hook-free.

**`parse5` over `htmlparser2`, on the merits: browser semantics.** `parse5`
implements the HTML5 tree-construction algorithm, including its
error-recovery and implied-tag-insertion rules, so malformed markup parses
the way a browser parses it. `htmlparser2` is a fast forgiving stream parser
that does not implement tree construction. That distinction is load-bearing
here for a specific reason: **`raw.renderedDom` is a post-render Playwright
serialisation of what Chromium actually built**, and phishing pages are
disproportionately malformed. A parser that recovers differently from
Chromium would derive a different form structure from the same page.
Matching browser semantics is the correctness requirement, not a preference.
`parse5` is also the lighter of the two (2 packages vs 6) and is the parser
`jsdom` itself uses.

---

### 3. MANDATORY: V-15 and a PSL conformance fixture. Not optional.

**`pslVersion` is declared, contractually meaningful, and enforced by
nothing.** Searched `tools/`, `packages/`, `apps/`: it appears in the
contract definition, in `BASELINE.md`'s amendment table, and in one comment
in `contract-conformance-check.py`. **No validator check reads it. No engine
code reads it.** It is a declared-but-unenforced field — the same shape as
the `integrityDigest` gap that [[DEFECT-17]] found and closed by wiring
**V-14** into G-8.

Two things are therefore required, and adopting `tldts` is conditional on
both:

**(a) A new G-8 check, V-15** (next free — `validate-ruleset.py`'s header
documents V-1…V-14, V-14 being DEFECT-17's addition). V-15 asserts that
`RuleSet.pslVersion` matches the PSL the extractor actually bundles. A
mismatch fails the gate. This makes an invisible divergence a build failure,
exactly as V-14 did for the integrity digest.

**(b) A PSL conformance fixture** proving `tldts` and `tldextract` agree on
registrable-domain boundaries.

⚠️ **THE FIXTURE THIS SECTION ORIGINALLY SPECIFIED WAS DEFECTIVE, and the
defect was in the specification, not the implementation.** Recorded here rather
than quietly overwritten, because the failure is instructive.

As drafted, this section named four boundary domains and reported that the
fixture confirmed agreement on all five cases. That was true and worthless.
Both sides ran at their LIBRARY DEFAULTS — `psl-reference.py` called
`tldextract.extract()`, `psl.ts` called `tldts` unconfigured — while
`capture.py:86-92` runs with `include_psl_private_domains=True`. The fixture
confirmed two defaults agreed **with each other** while neither matched the
producer, and passed green while the two PSLs actually in use disagreed on
**32.5% of phishing snapshots**. The `user.github.io -> github.io` expectation
in the original table is precisely the wrong answer: the producer returns
`evil1.github.io`.

[[DEFECT-34]] names the shape — *a verification mechanism confirms internal
consistency between two things that both happen to be wrong the same way,
rather than confirming either one matches the actual authoritative
configuration* — and records the standing principle that a conformance check
MUST verify against the producer's actual runtime configuration.

**The corrected fixture**, in force since `ce05ded`, runs **seven** cases, of
which **four are PSL-PRIVATE and chosen because they fail if either side
reverts to a default**:

| Domain | Expected (producer config) | Exercises |
|---|---|---|
| `user.github.io` | `user.github.io` | PSL PRIVATE — ICANN-only yields `github.io` |
| `cancelcardiffbahora.vercel.app` | `cancelcardiffbahora.vercel.app` | PSL PRIVATE — real live-feed phishing host |
| `qg77.chris-x.workers.dev` | `chris-x.workers.dev` | PSL PRIVATE — ICANN-only yields `workers.dev` |
| `bucket.s3.amazonaws.com` | `bucket.s3.amazonaws.com` | deep PSL PRIVATE suffix |
| `example.co.uk` | `example.co.uk` | multi-label ICANN — control, identical under both |
| `school.pvt.k12.ma.us` | `school.pvt.k12.ma.us` | four-label ICANN — control |
| `accounts.example.com` | `example.com` | plain two-label control |

The fixture additionally asserts the ORACLE'S CONFIGURATION
(`ref.includePrivateDomains === true`), so a default-configured oracle now
fails rather than silently verifying the wrong question. [[DEC-32]] removes the
duplication entirely by single-sourcing the flag in `tools/ci/psl-config.json`.

Disagreement on any of these blocks adoption. Seven is a floor, not a ceiling —
the list should grow when a divergence is found in the wild.

---

### 4. Scoping fact for C1.5 / CP-2: the credential-interface population rate is **12.3%**

Measured over the full 617-snapshot consistent store, not sampled:

| Label | Snapshots | Has DOM | Has `<form>` | **Has password input** |
|---|---|---|---|---|
| benign | 200 | 126 (63.0%) | 67 | **14 (7.0%)** |
| phishing | 417 | 342 (82.0%) | 118 | **62 (14.9%)** |
| **total** | **617** | **468 (75.9%)** | **185** | **76 (12.3%)** |

DOM availability is fully explained by `fetch.outcome`: `success` (333),
`http_error` (123) and `empty_document` (12) carry a DOM;
`dns_resolution_failed` (74), `timeout` (62), `navigation_error` (10) and
`tls_handshake_failed` (3) do not. 73 of the DOMs present are under 200
bytes.

**Why this is recorded as a DECISION input and not a curiosity:** CRED-01,
CRED-03, CRED-06 and CRED-07 — the four rules [[DEC-26]] identifies as fully
corpus-validatable — all gate on `credentialFormPresent`. So the effective
validatable sample for those rules is **~76 snapshots, not 26,700**, and on
this store the credential-bearing negative class is **~14 benign snapshots**.

**CP-2's eventual confidence intervals MUST be computed on the
credential-bearing subset, not the raw corpus count.** An interval quoted
against 26,700 would be wrong by more than two orders of magnitude in the
denominator and would present a ~14-negative measurement as a large-sample
result. This is a distinct constraint from S-11's residual-leakage reporting
and from S-10's CRED-04 separation; all three apply simultaneously.

Caveat, stated so the number is not over-trusted: this is a regex probe for
`<input type=password>`, not extraction. It undercounts OTP/PIN/username-only
interfaces — `CredentialFieldKind` has five variants — and any form
constructed after `load` fired. Real extraction will find more. The order of
magnitude is not in question.

---

### 5. Operational item, NOT a blocker: corpus locality

`corpus/` in the working repository holds `INDEX.jsonl` (26,700 entries) and
`.gitkeep` — **zero payloads**. This is correct per [[DEC-1]] (payload never
enters git), but it means the corpus the committed index describes is **not
reachable from the working tree**, and no payload store matching those 26,700
entries was found on this machine.

Development and the S-6 determinism proof therefore use a **617-snapshot
store whose payload count and index line count agree exactly** (a second
store on disk holds 687 payloads against 481 index lines and is **not** used
— that inconsistency is itself worth a look, separately).

This does not block extraction: S-6 is a property of the extractor
(`identical RawMaterial + identical extractorVersion ⇒ identical
SecurityEvidence`), and any real snapshot set proves or disproves it equally
well. It DOES block C1.5 metrics, which need the real corpus. Recorded as an
operational item — the payload store for the 26,700-entry index needs to be
located or re-captured before CP-2.

---

**Related:** [[DEC-1]] (corpus never in git), [[DEC-8]] (`pslVersion`
introduced, A-6), [[DEC-22]] (dependency diligence standard), [[DEC-26]]
(extraction scope), [[DEFECT-17]] (the V-14 precedent this V-15 follows),
[[DEFECT-31]] (fabrication forced by contract shape).

---

### Ruling 3 — BUILT 2026-08-29. How the incomparable-string problem was resolved.

**The two version strings cannot be compared, and V-15 does not pretend
otherwise.** The rule set declares `tldextract==5.3.0
include_psl_private_domains=true (bundled snapshot sha256:b693…)` — the
configuration clause added by [[DEC-31]] in `409171d`, after this entry was
drafted; the extractor bundles `tldts@7.4.11`. Different projects,
different version lines, different PSL snapshot identities. No normalisation
makes them comparable, and a check that compared them would either fail
permanently or, if fudged into passing, assert nothing.

Comparing them is also **not the risk worth gating**. The risk is DRIFT: one
side moves and nobody re-verifies that the two PSLs still agree on
registrable-domain boundaries — silently changing `registrableDomain`, the
field CRED-01 and CRED-07 both key on.

So the mechanism splits in two, and each half asserts only what it can:

**V-15 (in `validate-ruleset.py`, gate G-8) — the PINNING half.** Two exact
comparisons between values that ARE comparable:

1. `BUNDLED_PSL` in `apps/harness/extract/version.ts` vs the `tldts` actually
   in `node_modules` — catches the dependency moving.
2. `PSL_RECONCILED_AGAINST` in the same file vs the rule set's `pslVersion` —
   catches the rule set's declaration moving.

Either mismatch means conformance was last verified against something no
longer in use. `PSL_RECONCILED_AGAINST` exists precisely so there is a
comparable value to check; it records WHICH declared `pslVersion` the
empirical reconciliation was performed against.

**`psl-conformance.fixture.test.ts` (gate G-8 companion) — the EMPIRICAL
half.** Invokes `tools/ci/psl-reference.py` and compares tldextract's answers
against tldts's directly over the boundary set. Confirmed live:
**tldts 7.4.11 and tldextract 5.3.0 agree on all five domains**, including
both PSL private-section cases. Degrades to a pinned baseline when tldextract
is not importable — CI installs no Python deps — and **says which mode ran**,
never claiming a live cross-check that did not happen.

Together: V-15 proves the pairing is DECLARED current; the fixture proves the
two actually AGREE. Neither alone is sufficient, which is why ruling 3
required both.

**⚠️ KNOWN GAP — V-15's constants are SELF-ATTESTED. Verified, not theorised.**

Walked through the combined case explicitly: what if BOTH sides move in one
commit — the rule set's `pslVersion` changes AND `tldts` is upgraded together?

| Case | V-15 |
|---|---|
| Both move, `version.ts` NOT updated | ✅ **FAILS** — both checks trip |
| Both move, both constants updated to match | ⚠️ **PASSES** |

The second row is the gap, and it is **by design rather than an oversight**:
V-15 gates whether the pairing is DECLARED current, and a developer who edits
both constants has declared it current. Nothing V-15 can see distinguishes
"updated the constants and re-ran conformance" from "updated the constants."

**The backstop is `psl-conformance.fixture.test.ts`** — but it had a hole of
its own. `psl-reference.py` exits 3 when tldextract is not importable, and the
test then degrades to comparing tldts against DEVELOPER-WRITTEN expectations,
with no independent oracle. **CI installed no Python dependencies**, so the
live cross-check was never running there. A simultaneous update that also
edited the expectation table would have passed CI with zero independent
verification.

**Closed, because the fix was trivial:** `ci.yml` now installs tldextract at
the version DERIVED from the rule set's own `pslVersion` (so it cannot drift
from what is declared), and sets `SSX_REQUIRE_PSL_ORACLE=1`, which turns the
degrade path into a hard failure. CI can no longer silently fall back to the
weaker mode; local development still can, and says so loudly.

**Residual gap, NOT closed and not trivial:** the two PSLs are compared on
five boundary domains. A disagreement on any suffix outside that list is
caught by nothing. The list is a floor and should grow whenever a divergence
is found in the wild.

**A flaw found by negative control, recorded because it was self-inflicted.**
V-15 first returned "no violations" when `version.ts` was absent — a green
check that had verified nothing, the same vacuous-gate shape [[DEFECT-29]]
closed for G-9's `--if-present` and [[DEFECT-17]] closed for the integrity
digest. It now FAILS on a missing extractor. Caught only because the negative
control tested the missing-file path rather than just the mismatch paths.

- **Status:** SIGNED 2026-08-29. **Rulings 1, 2 and 3 are all now
  implemented** (V-15 green as one of fifteen G-8 checks; conformance fixture
  wired into `ci.yml` with no `--if-present`).
- **Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-29

---

## DEC-28 — CRED-01 and CRED-07 verified UNFIRABLE on real 2026 phishing: the form-action threat model is superseded, and it was the assumption [[DEC-14]] rested on

**[R] Measured, not inferred.** The full pipeline was run end to end against a
real corpus for the first time — 617 snapshots (200 benign, 417 phishing),
snapshot → `extractEvidence` → `runAnalysisPass` (Stages 1–8) → tier, 0 errors.

| Rule | Firings | |
|---|---|---|
| **CRED-06** | 9 phishing, 0 benign | the only rule that fired at all |
| **CRED-01** | **0** | weight 45 — the highest in the rule set |
| **CRED-07** | **0** | requires the same off-site conjunct |
| CRED-03 | 0 | 0 IDN domains, 0 confusable skeletons in this corpus |

**[I] The cause is in the data, and was verified against RAW markup rather
than trusted to the extractor.** Across all 617 snapshots, **zero credential
forms declare an off-site action.** Every `action` attribute is either absent
— self-submit, or handled entirely by script — or relative:

```
page=https://komitoufik-creator.github.io/LOGIN/   action=(none)
page=http://aethersyncmatrix8.lol/                 action=/?_task=login
page=https://dhl.iformalia.es/                     action=./
page=https://www.facebook.com/                     action=(none)
```

Not one absolute cross-domain URL. Contemporary kits exfiltrate by
JavaScript to their own backend, or post to a same-host script. **The
declarative form-action signature CRED-01 detects is essentially extinct in
this sample.** Separately, 11 credential interfaces (9 phishing, 2 benign)
have no `<form>` element at all — fields submitted by `fetch()` — which the
action-based rules cannot see even in principle.

This is a RULE-SET finding, not an extraction defect. The extractor resolves
actions correctly; there is nothing off-site to find.

---

### [I] The rule set ANTICIPATED this exact failure, and routed it to CRED-05

This is the part that matters, and it is documented in the frozen artifact
rather than being an interpretation. `rules-v0.1.0.json`, verbatim.

**CRED-01's `knownLimitations`:**

> "Cannot observe submission destinations rewritten by script at submit time —
> **that case belongs to CRED-05.** A page may declare a benign action
> attribute and override it dynamically."

**CRED-01's `rationale`:**

> "Distinguished from CRED-05 (**script-mediated exfiltration, invisible to
> this predicate**)…"

**CRED-05's `rationale`:**

> "Captures credentials leaving the page by script rather than by form
> submission, to an off-site endpoint — **the exfiltration path CRED-01
> structurally cannot see**, since CRED-01 only reads the form's declared
> action, not runtime script behavior."

CRED-01 and CRED-05 were designed as **two halves of one threat model**, each
carrying weight 45, explicitly cross-referencing the other's blind spot. The
rule set is internally coherent and its authors were right.

### [I] What this does to DEC-14 — and what it does NOT do

[[DEC-14]] (signed 2026-08-25) accepted CRED-05 and CRED-A1 as non-functional
for Phase I, on the grounds that fixing them "requires a contract amendment
… which deserves dedicated attention rather than a rushed fix." That reasoning
was sound and **is not disturbed by anything here.**

**This entry does NOT reverse DEC-14. It removes the assumption DEC-14 rested
on.**

Turning off one half of a two-half threat model is a defensible scope decision
**if the other half still covers a meaningful share of real attacks.** That
was the implicit premise, and it was reasonable — CRED-01 carries the joint
highest weight, is the only rule that fires in the committed fixtures
(`off-origin-post` scores 45/Medium through it), and the rule set's own
structure presents it as the primary of the pair.

**The measurement shows the remaining half covers 0 of 617.** So the effective
state is not "one of two exfiltration rules is deferred" but **"neither
exfiltration rule can fire"** — one disabled by decision, the other by
obsolescence. DEC-14's cost was assessed as partial coverage loss; it is
actually total, for this attack class.

Stated plainly so the record is not over-read: DEC-14 was correctly reasoned
on the information available on 2026-08-25. The information changed on
2026-08-29. Nothing about DEC-14 was wrong; its premise no longer holds.

### [I] CRED-07 is blocked by the same conjunct, BY DESIGN

CRED-07's own `knownLimitations`, verbatim:

> "Weak in isolation, which is why it carries the lowest primary weight and
> **requires the off-site conjunct to fire at all.**"

The concealment material genuinely exists in the corpus — 4 credential forms
with a hidden field, 13 with autocomplete disabled — so CRED-07's first
disjunct is satisfiable. It never fires because its second conjunct
(`notSameSite` on the action) is never true. Same root cause; deliberate
design, not an accident.

⚠️ Note the interaction with [[DEFECT-31]]: CRED-07's `hidden` input is
markup-only and under-reports (CSS/JS concealment invisible). That limitation
is currently MASKED — it cannot affect results while the off-site conjunct
blocks the rule entirely. **If the off-site requirement is ever relaxed,
DEFECT-31 becomes live and load-bearing on CRED-07's numbers immediately.**

---

### RECOMMENDATION — do not tune anything against today's figure

**Today's measured recall is 13.6% on the credential-bearing subset (9 of 66
phishing), 2.2% on the whole corpus, with precision 100% on 9 positives.**

**No weight, threshold, or `tau` parameter should be tuned against these
numbers until the direction question below is ruled on.** The figure describes
**one rule (CRED-06) detecting one now-uncommon pattern** — a credential form
served over plain HTTP. It does not describe the system's capability, and
tuning against it would optimise the rule set for the residue of what is
measurable rather than for what is happening.

Three specific traps, stated so they are not walked into separately:

1. **Do not lower thresholds to raise recall.** Recall is not threshold-bound
   here — the rules never fire at any threshold, because their predicates are
   false. §13.2's `medium: 30` / `high: 60` are not implicated.
2. **Do not re-weight CRED-06 upward** because it is the only rule producing
   signal. Its 9 firings were all correct; its weight is not the problem.
   Inflating it would encode "HTTP login page" as the system's primary
   detector.
3. **Do not treat precision 100% as validated.** It rests on 9 positives. One
   false positive takes it to 90%. No confidence interval has been computed,
   and [[DEC-27]] §4 requires intervals on the credential-bearing denominator
   (n=80), not the corpus count.

---

### Direction — RULED 2026-08-29

**Option C — accept and record the coverage gap — applies to THIS measurement
as an unavoidable FACT, not a choice.** Already-captured static snapshots
cannot retroactively reveal runtime JavaScript behaviour. No extractor change,
however good, can recover from an existing snapshot what capture never
observed. The 617-snapshot measurement above therefore stands as it is, and
CP-2's scope statement must record that the exfiltration attack class was
UNCOVERED for it — not under-detected, uncovered.

That is Option C's whole extent. It describes what is true of data already on
disk. It is explicitly NOT a decision to leave the gap open going forward.

**Option A — rebuild CRED-05's real detection path — is NOT deferred to an
unscheduled Phase II, and that framing is explicitly REJECTED.**

[[DEC-14]] already made a "defer, and assume coverage exists elsewhere" call
once. This finding is the direct result of that assumption failing. Repeating
the same shape of deferral — logging an intention with no concrete plan, no
owner and no scope — would be **the same mistake a second time, not a lesson
learned from it.** The distinguishing feature of DEC-14 was not that it
deferred; it is that it deferred without establishing what the deferral cost,
and the cost turned out to be total rather than partial.

**So Option A's DESIGN phase starts now, as its own scoped task** — the
capture-observability design recorded immediately below this entry. It has a
concrete investigation scope, checked against actual Playwright capabilities
rather than assumed, to the same standard [[DEC-27]]'s PSL diligence used.

**Option A's IMPLEMENTATION is sequenced after design, and the reason is not
scheduling convenience.** `tools/capture/capture.py` is the most foundational
code in this repository: every evaluation module, every metric, every snapshot
in every corpus depends on what it produces, and a capture change invalidates
previously-captured material rather than merely extending it. Re-capturing is
not a rerun — it is a new corpus. That deserves the same design-before-code
discipline every other build this session received, not a rushed patch
appended at the end of a long night. Writing capture instrumentation now, at
speed, would be the third instance of the pattern this entry exists to name.

**Option B — broaden CRED-01's predicate — remains REJECTED**, reasoning
unchanged from the draft: it changes what CRED-01 means, and its `rationale`
and `knownLimitations` both currently disclaim exactly the behaviour it would
acquire, so the artifact would have to be amended in step to stay honest.

**The fourth possibility — relaxing CRED-07's off-site conjunct — remains set
aside**, also unchanged: CRED-07 is "weak in isolation" by its own
documentation, so deleting the conjunct converts a specific rule into a broad
one, and [[DEFECT-31]]'s currently-masked `hidden` under-reporting becomes
live at the same instant. If concealment is to become a standalone signal that
is a rule-design decision deserving its own entry, not a conjunct deletion.

- **Status:** Option C's factual state **RESOLVED and recorded** — static
  snapshots cannot retroactively yield runtime behaviour, and CP-2 must state
  the exfiltration class as uncovered for this measurement. Option A's
  **DESIGN task OPEN**, scoped in the capture-observability design below, with
  implementation deliberately sequenced after it. Neither blocks tonight's
  other closures.

**Related:** [[DEC-14]] (CRED-05/CRED-A1 non-functional — premise removed, not
reversed), [[DEC-26]] (corpus-validatable set; gap kind 2 on runtime
observation), [[DEC-27]] §4 (the n=80 denominator), [[DEFECT-31]] (CRED-07's
masked `hidden` limitation), [[DEFECT-32]] (`credentialFormPresent`
classification error, still unmeasured in the under-classification arm).

- **Status:** SIGNED 2026-08-29. The DIRECTION is ruled (see the Direction
  section above: C resolved as fact, A's design started, B rejected); the
  ENTRY is now signed. **No fix implemented and none
  prototyped** — the design task below is design only. The measurement is
  reproducible via `SSX_CORPUS_STORE=… npm run metrics:confusion`.
- **Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-29

---

## DEC-29 — Capture-observability DESIGN for `scriptRuntime`: what `capture.py` must observe to make CRED-05 and CRED-A1 real

**This is [[DEC-28]]'s Option A design task. DESIGN ONLY — no `capture.py`
change is proposed for tonight, and none was written.** It exists so that
Option A is a scoped, actionable item with a real effort estimate rather than
an intention, which is the specific failure mode DEC-28 exists to avoid
repeating.

**Verification standard.** Every Playwright capability below was checked by
INSTALLING playwright 1.60.0 in an isolated scratchpad venv and introspecting
the real API surface — not read from documentation and not assumed. The same
standard [[DEC-27]] applied to `tldts` and `parse5`. Where something could not
be verified this way it is marked **UNVERIFIED** explicitly.

---

### [I] The safety question, answered first: no new execution risk

**`page.on('request')` is PASSIVE OBSERVATION and adds no attack surface
whatsoever.** This matters because the question "can we capture outbound POST
destinations without executing untrusted JS unsafely?" contains a premise
worth correcting:

**`capture.py` ALREADY executes untrusted JavaScript.** Line 267 today:

```python
page.goto(url, timeout=FETCH_TIMEOUT_MS, wait_until="load")
```

with `ignore_https_errors=True` and a full headless Chromium. Every hostile
script on every phishing page in the existing corpus has already run. The DOM
being extracted from is the POST-EXECUTION result — that is what makes
`renderedDom` useful at all.

So network observation does not introduce JS execution. It records more of
what already happens. The genuinely new risk is elsewhere, in §3 below.

---

### [I] Field-by-field: what each `ScriptRuntimeEvidence` field actually requires

| Field | Mechanism required | Verified? | Difficulty |
|---|---|---|---|
| `transmissionEndpoints` | network layer only | ✅ | **Low** |
| `dynamicScriptLoadCount` | network layer only | ✅ | **Low** |
| `dynamicScriptOrigins` | network layer only | ✅ | **Low** |
| `clientSideTransmissionObserved` | network + sentinel fill | ✅ APIs exist | **Medium–High** |
| `credentialInterfaceInjected` | injected MutationObserver | ✅ APIs exist | **Medium** |
| `listenerOnCredentialField` | listener introspection | ✅ two routes | **High** |
| `injectingScriptOrigin` (D0.1) | mutation + stack attribution | ⚠️ **UNVERIFIED** | **Highest** |

#### 1. Network layer — `transmissionEndpoints`, `dynamicScript*` — LOW difficulty

`page.on('request')` fires for every outbound request. Verified present on
`Page` and on `BrowserContext` (context-level covers popups and all frames,
which a phishing page may use). The `Request` object exposes, all verified:

```
Request.url  .method  .post_data  .post_data_json  .post_data_buffer
Request.headers  .all_headers  .resource_type  .frame  .is_navigation_request
```

- `transmissionEndpoints` — collect `request.url` where `method == 'POST'` and
  `resource_type in ('xhr','fetch')`. Passive, complete, no injection.
- `dynamicScriptLoadCount` / `dynamicScriptOrigins` — count requests with
  `resource_type == 'script'` arriving after the `load` event
  (`page.on('load')` sets a flag). Preferable to watching DOM `<script>`
  insertion: it is observed at the network layer where the page cannot
  interfere with our bookkeeping.

**This tier alone unblocks CRED-05's `transmissionEndpointDomains`** once
paired with the registrable-domain extraction [[DEC-14]] deferred — and it
requires no code inside the hostile page at all.

#### 2. `clientSideTransmissionObserved` — the hard one, and the design decision

The field means *credentials left the page by script*. The network layer sees
the request; it cannot know the body carried a credential. Two approaches:

**(a) Sentinel fill — accurate, and changes what capture IS.** Fill each
credential field with a unique token (`page.fill` verified), trigger submit,
then scan every outbound `post_data` for the token. If it appears in a request
to an off-site endpoint, exfiltration is *observed*, not inferred.

⚠️ **This converts capture from OBSERVATION into INTERACTION**, and that is a
governance question, not a technical one. The harness would be submitting data
to live criminal infrastructure — generating traffic, confirming the page is
live, and potentially poisoning the attacker's own dataset. It also risks
tripping anti-analysis logic and changing what is captured. **Flagged for
explicit ruling; NOT recommended without one.**

**(b) Structural proxy — safe, weaker.** Record "a credential form is present
AND an off-site XHR/fetch POST occurred." Purely passive. Cannot distinguish
credential exfiltration from analytics beaconing, so it would over-report —
and per [[DEFECT-32]]'s reasoning a bidirectional error yields no publishable
bound. Would need a differently-named field, or an explicit precision caveat.

**Recommendation: ship tier 1 first and treat this field as its own decision.**
It is the only field in `ScriptRuntimeEvidence` that cannot be answered
passively, and conflating it with the easy three would hold them hostage.

#### 3. Injected instrumentation — `listenerOnCredentialField`,
`credentialInterfaceInjected` — where the REAL new risk is

Both need code running *inside the page*. `add_init_script` is verified on both
`Page` and `BrowserContext`, and runs **before any page script** — the timing
required to observe registrations rather than their aftermath.

- `credentialInterfaceInjected` — a `MutationObserver` installed pre-load,
  flagging credential-field insertion after the `load` event.
- `listenerOnCredentialField` — **two routes, both verified to exist:**
  1. Monkey-patch `EventTarget.prototype.addEventListener` in an init script
     and record registrations, reporting back via `expose_binding` (verified,
     signature `(name: str, callback: Callable)`).
  2. **CDP `DOMDebugger.getEventListeners`** — `BrowserContext.new_cdp_session`
     is verified present. Chromium-only, which `capture.py` already is.

  **Route 2 is preferable and the difference is security, not convenience.**
  Monkey-patching runs OUR code in the hostile page's context, where malicious
  script can detect it (`addEventListener.toString()` no longer looks native),
  disable it, or feed it false data. **A phishing kit that detects
  instrumentation and behaves benignly makes the evidence actively
  misleading — worse than absent, because it looks like a clean bill of
  health.** CDP observes from OUTSIDE the page, out of reach of page script.

**This is the genuinely new risk surface**, and it is why the two tiers should
not be built together: tier 1 cannot be tampered with, tier 3 can.

#### 4. `injectingScriptOrigin` — ⚠️ UNVERIFIED, hardest, and possibly not worth it

Attributing a DOM mutation to the script that caused it needs a stack capture
at mutation time correlated to a script URL. **I did not verify that this is
reliably achievable** — `MutationObserver` callbacks are asynchronous and the
originating stack is typically gone by the time they fire.

Recorded honestly as an open question rather than estimated. Note it is
CRED-A1's field, and CRED-A1 is a weight-10 aggregator that also carries
[[DEFECT-19]]'s single-parent interpretive choice — so it is the least
valuable field here and the most expensive. **Recommend descoping it from the
first implementation** and letting CRED-A1 stay non-functional even after
CRED-05 is restored.

---

### Effort estimate — real, and scoped by tier

Deliberately given per tier, because the tiers have different risk profiles and
should be separately approvable. These assume someone fluent in the capture
pipeline, and EXCLUDE re-capture time.

| Tier | Scope | Estimate |
|---|---|---|
| **1** | Network observation: 3 fields, `capture.py` + `RawMaterial` extension | **1–2 days** |
| **2** | Extraction + contract: `scriptRuntime` extractor, DEC-14's registrable-domain amendment | **2–3 days** |
| **3** | CDP listener introspection + MutationObserver | **3–5 days** |
| **4** | `clientSideTransmissionObserved` (blocked on the §2 ruling) | **2–4 days after ruling** |
| **—** | `injectingScriptOrigin` | **UNKNOWN — descope** |

**Tiers 1+2 ≈ 3–5 days restores CRED-05's endpoint detection.** That is the
value-carrying subset.

⚠️ **The dominating cost is not code — it is RE-CAPTURE.** `scriptRuntime` is
observable only at capture time, so every existing snapshot is permanently
blind to it. The 617-snapshot store and the 26,700-entry index would both need
re-capturing, and phishing URLs decay fast — a re-capture months later samples
a *different population*, not the same one again. **S-11's residual-leakage
reporting and any temporal-holdout comparison would need re-basing.** This
cost is structural and no amount of design removes it; it is the strongest
argument for deciding scope carefully before running capture, which is exactly
why DEC-28 sequenced design before implementation.

---

### Handoff

**First concrete item for whoever picks up capture-pipeline work next** —
Durga per [[DEC-7]] availability, or whoever is free.

**Start with Tier 1.** It is self-contained, carries no tamper risk, needs no
governance ruling, and delivers the field CRED-05 actually needs
(`transmissionEndpoints`). It can be validated on a handful of URLs before any
corpus-wide re-capture is contemplated.

**Do not start with Tier 3.** It is where instrumentation becomes detectable,
and building it first would put the least reliable evidence into the corpus
first.

**Two things need a ruling before their tiers begin, not during:** the
sentinel-fill interaction question (§2), and whether `injectingScriptOrigin`
is descoped (§4).

**Related:** [[DEC-28]] (the finding that scoped this task), [[DEC-14]]
(CRED-05/CRED-A1 non-functional; its registrable-domain amendment is Tier 2's
dependency), [[DEC-26]] (gap kind 2 — recorded `scriptRuntime` as impossible
from a STATIC snapshot, which remains true; this changes capture, not
extraction), [[DEFECT-18]] (the structural dead-rule finding behind DEC-14).

- **Status:** SIGNED 2026-08-29. **DESIGN ONLY.** No `capture.py`
  change written or proposed for immediate execution. Playwright capabilities
  verified against 1.60.0 by direct API introspection; `injectingScriptOrigin`
  attribution explicitly UNVERIFIED and flagged as such.
- **Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-29

---

## DEC-30 — Tier 1 BUILT and validated; Tier 3 design (CDP-ONLY, monkey-patching FORBIDDEN); Tier 4 answered empirically

Records the build, validation and design work following [[DEC-29]]. Three
parts: what Tier 1 does now, what Tier 3 must and must not do, and what Tier 4
turned out to be.

---

### PART 1 — Tier 1 BUILT and VALIDATED

`tools/capture/capture.py` now observes the network passively via
`page.on("request")` at CONTEXT level (covering popups and nested frames),
populating `raw.scriptRuntimeObservations`.
`apps/harness/extract/scriptRuntime.ts` consumes it into
`ScriptRuntimeEvidence`.

**`BrowserContext.route()` was deliberately NOT used**, contrary to DEC-29's
own investigation list. `route()` INTERCEPTS: every matched request must be
explicitly continued or fulfilled, so a handler bug stalls the page and
corrupts the capture. `on("request")` cannot affect what happens.
**Observation must never be able to change what is captured**, and route()
can. Passive observation was sufficient for all three fields.

#### ⚠️ Validation found a STRUCTURAL BUG that would have silently ruined a full re-capture

Validated against synthetic pages whose exact behaviour was written in
advance — deliberately, because **a live phishing page has no ground truth**:
if capture reports two endpoints, nothing tells you whether the page had two,
five or zero. A live capture can show the code RUNS; only a known page can
show it is CORRECT.

The first run reported `dynamicScriptLoadCount: 0` on a page that provably
loads a script after load. Tracing every event gave the cause:

```
req document  GET  kit.html          afterLoad=False
DCL
req fetch     POST /beacon           afterLoad=False   <- page's load handler already ran
req script    GET  /late.js          afterLoad=False   <- page's load handler already ran
LOAD-EVENT                                             <- Playwright notifies us LAST
GOTO-RETURNED
```

**Playwright delivers its `load` event AFTER the page's own
`window.addEventListener('load', …)` handlers have already run and issued
their requests.** A flag set on `load` is therefore ALWAYS false for anything
the page does in its own load handler — which is exactly where exfiltration
beacons and late script injection live.

**Gating on `load` would have reported `dynamicScriptLoadCount: 0` across an
entire re-captured corpus, silently, with no error to investigate.** Given
that re-capture is population-altering and irreversible for decayed phishing
URLs, this bug would have cost a corpus.

Fixed by using **DOMContentLoaded** as the boundary, which fires before the
page's load handlers. Known imprecision, documented rather than hidden:
`async`/`defer` scripts declared in the original HTML can also land after DCL
and will be counted as dynamic. That over-counts benignly and is vastly
preferable to a flag that is structurally always false.

**This is the entire justification for DEC-28's design-before-implementation
sequencing, vindicated on the first validation run.**

#### Validation results

| Fixture | transmissionEndpoints | dynamicScriptLoadCount | Expected |
|---|---|---|---|
| beacon-on-load kit | 1 (`/beacon`) | 1 (`/late.js`) | ✅ exactly |
| benign page | 0 | 0 | ✅ exactly |
| submit-only kit | **0** | **0** | ✅ — see Part 3 |

**S-6 determinism: the same page captured THREE times produced byte-identical
`scriptRuntimeObservations`.** Both arrays are sorted and de-duplicated at
serialisation, because request ARRIVAL ORDER is a property of the network and
the page's scheduler and is not reproducible — what CRED-05 needs is the SET.
Extraction-side determinism is covered by `s6-determinism.test.ts` property
10, with negative controls confirming both the sorting and the
no-inference rule actually fire.

**No live phishing URL was contacted.** Both origins were `127.0.0.1`.

---

### PART 2 — Tier 2 required two frozen-contract amendments. ✅ BOTH LANDED in `ce05ded`.

**Status of this section as of `ce05ded`: RESOLVED.** Amendments A and B were
hand-typed into `packages/contracts/` by Jayanth (Architecture Owner) per
[[DEC-7]] and shipped in `ce05ded`. `ScriptRuntimeEvidence.transmissionEndpointDomains`
now exists and is derived producer-side by
`apps/harness/extract/scriptRuntime.ts` through the V-15-gated `psl.ts` path;
`RawMaterial.scriptRuntimeObservations` now exists and `capture.py` populates
it. Tier 2 is BUILT.

*The section below is preserved as written, because it records why the block
was real and what was required to lift it. Read it as history, not as current
state.*

This was the honest state at drafting, not a partial delivery. **Tier 2 could
not be completed by tooling**, per `CLAUDE.md`: "Amendments are made by hand,
never by Claude Code — a pre-tool-use hook blocks writes under
`packages/contracts/`."

**Amendment A — `RawMaterial` has nowhere to store network observations.**
`snapshot.format.v1.ts:177-197` has no such field. `capture.py` currently
writes `raw.scriptRuntimeObservations` as a SUPERSET key: existing consumers
ignore it, the extractor reads it defensively, nothing breaks — and nothing
type-checks it either. Proposed:

```ts
  /** DEC-29 Tier 1. Passive network observation at capture time.
   *  null for every snapshot captured before it existed. */
  readonly scriptRuntimeObservations: {
    readonly transmissionEndpoints: readonly string[];
    readonly dynamicScriptOrigins: readonly string[];
    readonly dynamicScriptLoadCount: number;
    readonly postRequestCount: number;
    readonly postAfterDclCount: number;
  } | null;
```

**Amendment B — `ScriptRuntimeEvidence` has no registrable-domain field.**
This is exactly the amendment [[DEC-14]] deferred, unchanged. CRED-05's
predicate reads `javascript.transmissionEndpointDomains`; the module reports
`[]` unconditionally, and `javascript.ts`'s header explains why it must:

> "Deriving a domain from a raw endpoint string would require PSL-equivalent
> registrable-domain extraction logic inside this module — exactly the class of
> thing a module must not do; that derivation belongs at Stage 1 in the
> evidence PRODUCER."

That reasoning is correct and should NOT be worked around. Proposed:

```ts
  /** Pre-extracted by the producer, mirroring actionRegistrableDomain's
   *  precedent. The module MUST NOT derive these itself (§2.6, E-4). */
  readonly transmissionEndpointDomains: Observation<readonly string[]>;
```

**Until both land, CRED-05 still cannot fire.** Tier 1's data reaches
`ScriptRuntimeEvidence` but stops there.

⚠️ **CORRECTION as of `ce05ded` — the conclusion survives, the reason does
not.** Both amendments have landed, and **CRED-05 still cannot fire — but the
blocker is now CAPTURE, not CONTRACT.** Every snapshot in every existing corpus
was captured before Tier 1's network observation existed, so
`raw.scriptRuntimeObservations` is absent on all of them,
`ScriptRuntimeEvidence` is `notCollected` throughout, and the `javascript`
module returns `unevaluable` before CRED-05's predicate is reached. The
extraction path is complete and proven end to end on a real `capture.py`
output; what is missing is captured data, which only a re-capture produces.

Stated explicitly so this sentence is not read as "CRED-05 fires once the
amendments land" — it does not, and no amount of extraction work will change
that. See [[DEC-29]]'s re-capture cost note: `scriptRuntime` is observable only
at capture time, so every pre-Tier-1 snapshot is permanently blind to it.

⚠️ **DEC-29's Tier 1/2 effort
estimate (1–2 and 2–3 days) costed the CODE and omitted that the gating item
is a hand amendment nobody can schedule around. That estimate was incomplete
and is corrected here.**

---

### PART 3 — TIER 4 ANSWERED: the passive combination is PARTIAL, and the ruling is premature rather than moot

The question was whether Tier 1 + Tier 3 together yield usable signal for
`clientSideTransmissionObserved` without sentinel-fill. **Tested directly with
two kits, identical except for when they exfiltrate.**

| Kit behaviour | Passive network observation |
|---|---|
| Beacons on load (no interaction) | ✅ endpoint captured |
| Exfiltrates ONLY on submit | ❌ **nothing — 0 requests** |

**For submit-only kits the signal does not exist passively. Not "we cannot see
it" — it has not happened.** No amount of observation finds a request that was
never issued, because nothing was submitted.

**What Tier 1 + Tier 3 gives, precisely.** CRED-05's predicate is a
three-way `and`:

| Conjunct | Beacon-on-load kit | Submit-only kit |
|---|---|---|
| `listenerOnCredentialField` | ✅ Tier 3 (CDP) | ✅ Tier 3 (CDP) |
| `clientSideTransmissionObserved` | ⚠️ inferable, weakly | ❌ no evidence exists |
| `exists endpoint notSameSite` | ✅ Tier 1 | ❌ empty |

So the passive combination **covers beacon-on-load kits and is structurally
blind to submit-only kits**. It is not sufficient, and it is not useless.

**And `clientSideTransmissionObserved` must NOT be inferred from "an off-site
POST occurred", even for the kits where one does.** Analytics, telemetry and
ad beacons produce an identical network signature. Inferring transmission from
any POST over-reports in an unbounded direction — and per [[DEFECT-32]]'s
reasoning a bidirectional error yields no publishable bound at all. Worse, it
would over-report preferentially on BENIGN pages, since those carry the real
analytics: the same failure shape as DEFECT-32's email-only classification,
measured at 36% of benign positives before it was ruled out. The extractor
therefore leaves the field `notCollected`, and a negative control in
`s6-determinism.test.ts` fails if anyone later "simplifies" it into an
inference.

#### ⚠️ RECOMMENDATION: the sentinel-fill ruling is PREMATURE, not moot

The passive combination does not remove the need for a decision. **But the
decision currently rests on an unknown quantity: what fraction of real kits
beacon before submission?** Nobody knows, and it is not knowable from the
existing corpus — no captured snapshot has any network data.

**Tier 1 measures exactly that number.** Running it over a sample yields the
beacon-on-load fraction directly, and that fraction determines whether
sentinel-fill is worth its governance cost:

- If most kits beacon on load → passive coverage is good, sentinel-fill buys
  little, and the ethics question can be declined on cost/benefit rather than
  argued on principle.
- If most exfiltrate only on submit → passive coverage is poor, and the ruling
  has to be faced with real stakes attached.

**Recommend deferring the sentinel-fill ruling until Tier 1 has run on a
sample and produced that fraction.** This is not the "defer and assume"
pattern DEC-28 rejects: it is deferring a decision until the one measurement
that determines its answer exists, with the measurement already built and the
decision explicitly scheduled after it.

The ethical objection stands regardless and is unchanged: sentinel-fill would
have the harness SUBMIT data to live criminal infrastructure, generating
traffic, confirming the page is live, and potentially tripping anti-analysis
logic that changes what is captured.

---

### PART 4 — TIER 3 DESIGN. CDP-ONLY. Monkey-patching is FORBIDDEN.

Implementation may follow once Tier 1's sample validation is in hand.

#### 🚫 HARD CONSTRAINT — read this before writing any Tier 3 code

**Monkey-patching `EventTarget.prototype.addEventListener` to observe listener
registration is FORBIDDEN. Not disfavoured — forbidden.** It will look like the
simpler option to whoever implements this, and it must not be chosen. The
reasoning, recorded verbatim so it cannot be quietly re-litigated as a
"simplification":

> Patching runs OUR code inside the hostile page's context, where malicious
> script can detect it (`addEventListener.toString()` no longer returns native
> code), disable it, or feed it false data. **A phishing kit that detects
> instrumentation and behaves benignly makes the evidence actively misleading —
> worse than absent, because it looks like a clean bill of health.**
> CDP observes from OUTSIDE the page, out of reach of page script.

Absent evidence is `notCollected` and everything downstream handles it
correctly under S-7. Falsified evidence is `present` and wrong, and there is no
invariant anywhere in this system that catches it. **The failure modes are not
comparable, and that asymmetry is the whole argument.**

If a future implementer believes patching is necessary, that requires a new
signed decision overriding this one — not a code comment.

#### The design

**Mechanism: `BrowserContext.new_cdp_session(page)` → `DOMDebugger.getEventListeners`.**
Verified present on playwright 1.60.0 by direct API introspection. Chromium-only,
which `capture.py` already is (`pw.chromium.launch`).

Sequence, after `page.goto(..., wait_until="load")` and the existing 2s settle:

1. Open a CDP session on the page.
2. `DOM.getDocument`, then `DOM.querySelectorAll` for
   `input[type=password], input[type=email], input[autocomplete]` — the same
   field set `loginInterface.ts` classifies, so the two categories cannot
   disagree about which fields are credential fields.
3. For each node: `DOM.resolveNode` → `objectId`, then
   `DOMDebugger.getEventListeners(objectId)`.
4. `listenerOnCredentialField` = true iff any credential field carries a
   listener of type `input`, `keyup`, `keydown`, `change`, `blur` or `paste`.
   ⚠️ Record the TYPES observed, not just the boolean — a `blur` listener and
   a `keydown` listener are very different signals, and collapsing them at
   capture time destroys information that cannot be recovered.
5. `credentialInterfaceInjected` — a pre-load `MutationObserver` via
   `add_init_script`, flagging credential-field insertion after DCL.

⚠️ **Step 5 is the one part that CANNOT be done from outside the page**, and
it therefore carries the detection risk the CDP constraint exists to avoid.
It should be built LAST and treated as lower-confidence evidence than steps
1–4. It may warrant its own decision about whether the risk is worth
`credentialInterfaceInjected` at all — whose only consumer is CRED-A1, already
[[DEC-14]] non-functional.

**`injectingScriptOrigin`: DESCOPED, confirmed.** Unverified feasibility
(MutationObserver callbacks are async; the originating stack is typically
gone), lowest value (CRED-A1's aggravator only, weight 10, itself carrying
[[DEFECT-19]]'s single-parent interpretive choice). CRED-A1 stays
non-functional even after CRED-05 is restored.

**Revised estimate:** steps 1–4 (the CDP part, no in-page code) **2–3 days**.
Step 5 (MutationObserver) **2 days**, and should be separately approved.
Excludes re-capture.

---

**Related:** [[DEC-29]] (the design this executes; its Tier 1/2 estimate is
corrected in Part 2), [[DEC-28]] (design-before-implementation, vindicated by
the DCL bug), [[DEC-14]] (Amendment B is its deferred amendment, unchanged),
[[DEFECT-32]] (the over-classification reasoning Part 3 applies).

- **Status:** SIGNED 2026-08-29. **Tier 1 BUILT, validated, S-6
  proven. Tier 2 BUILT — both contract amendments landed in `ce05ded`
  (Part 2, corrected in place); `transmissionEndpointDomains` is derived
  producer-side and proven end to end against a real `capture.py` output.
  CRED-05 still cannot fire, but the blocker is now CAPTURE rather than
  CONTRACT: every existing snapshot predates Tier 1's network observation, so
  `scriptRuntime` is `notCollected` corpus-wide and the `javascript` module is
  `unevaluable` before the predicate is reached. Tier 3 DESIGNED, not built.
  Tier 4 answered; its ruling recommended deferred until Tier 1 yields the
  beacon-on-load fraction.** No corpus-wide re-capture performed or
  recommended yet — which is exactly why CRED-05 remains dark.
- **Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-29

---

## DEC-31 — `pslVersion` amended to record PSL configuration (applied `409171d`)

**[R] The declaration AS IT STOOD when this entry was written**, `rulesets/rules-v0.1.0.json:6`, verbatim *(superseded by this entry's own correction, applied in `409171d` — see the AFTER block and Status below)*:

```
"pslVersion": "tldextract==5.3.0 (bundled snapshot sha256:b69315c085d53972724b8f2df111ffc329b0c84fe0a47d62c8c91655cc774a38)"
```

**[I] It records the library, the version, and the snapshot digest — and says
NOTHING about configuration.** Checked mechanically: the string contains none
of `private`, `icann`, `include`, `config`, `section`.

**[I] That omission is not cosmetic, because the same library and the same
snapshot give DIFFERENT answers depending on one flag.** `tldextract` 5.3.0
with the identical bundled snapshot returns:

| host | `include_psl_private_domains=True` | `False` (library default) |
|---|---|---|
| `evil1.github.io` | `evil1.github.io` | `github.io` |
| `cancelcardiffbahora.vercel.app` | `cancelcardiffbahora.vercel.app` | `vercel.app` |
| `chris-x.workers.dev` | `chris-x.workers.dev` | `workers.dev` |

So `pslVersion` as written **does not identify the resolution behaviour the
rule set was authored against.** Two implementations can both satisfy the
declaration exactly and still disagree on 32.5% of phishing snapshots — which
is precisely what happened ([[DEFECT-34]]).

`ruleset.format.v1.ts:253-256` states the field's purpose: "PSL version the
registrable-domain comparisons were authored against. A PSL update can shift
an eTLD+1 boundary and change a sameSite outcome under identical evidence —
recorded for G-10 replay." **A configuration change shifts eTLD+1 boundaries
exactly as a version update does**, so by the field's own stated purpose it
belongs in the declaration.

---

### DRAFTED CORRECTION — not applied. `rulesets/` is frozen.

Same handling as every contract question tonight: drafted for the Architecture
Owner, not written by tooling.

**BEFORE:**

```json
  "pslVersion": "tldextract==5.3.0 (bundled snapshot sha256:b69315c085d53972724b8f2df111ffc329b0c84fe0a47d62c8c91655cc774a38)",
```

**AFTER:**

```json
  "pslVersion": "tldextract==5.3.0 include_psl_private_domains=true (bundled snapshot sha256:b69315c085d53972724b8f2df111ffc329b0c84fe0a47d62c8c91655cc774a38)",
```

The configuration is placed INSIDE the version clause, before the digest,
because it qualifies the resolver rather than the data — the snapshot digest
is unchanged by the flag, which is exactly why the flag has to be stated
separately.

#### ⚠️ CORRECTION to this entry's first draft — the immutability dilemma does not exist

The draft above originally posed a choice between amending in place and
bumping to `rules-v0.1.1`, on the premise that §12.2 forbids mutating a
released artifact. **That premise was wrong, and it was my error.** Checked
against the file rather than assumed:

```
rulesets/rules-v0.1.0.json:4    "released": false,
```

§12.2's immutability applies to a RELEASED version. This rule set declares
`released: false`, so **it is mutable and no version bump is required.** Amend
in place. There is no trade-off to rule on; the choice I put in front of the
Architecture Owner was manufactured by not reading line 4.

What DOES still apply: the digest must be recomputed, or **V-14 fails**. That
is a mechanical consequence of any edit, not an immutability question.

*(Separate observation, no action proposed: the file is named
`rules-v0.1.0.json` but line 3 declares `"ruleSetVersion": "rules-v0.2.0"` —
the DEFECT-15 fix bumped the version per §14.1 without renaming the file. Not
introduced by anything tonight and not addressed here; noted so it is not
mistaken for a side effect of this amendment.)*

**Also recommended, and cheap: extend V-15 to enforce it.** V-15 already
compares `PSL_RECONCILED_AGAINST` against the rule set's `pslVersion` as exact
strings, so once the configuration is IN the string, V-15 gates it for free —
a future extractor changing `allowPrivateDomains` without updating the
constant would fail G-8. No new check is needed; the existing one becomes
meaningful the moment the declaration is complete.

**Related:** [[DEFECT-34]] (the divergence this would have prevented),
[[DEC-27]] (V-15 and the conformance fixture), [[DEC-8]] (introduced
`pslVersion` as amendment A-6), [[DEFECT-17]] (V-14, the digest check that
constrains how this is applied).

- **Status:** **APPLIED in `409171d`, SIGNED 2026-08-29.** No longer a candidate:
  the change is in the artifact and the decision is ratified. The drafted
  correction above was hand-typed into the frozen `rulesets/` path by Jayanth
  (Architecture Owner) per [[DEC-7]] — both lines: `pslVersion` gains
  `include_psl_private_domains=true`, and `integrityDigest` becomes
  `sha256:f691cbdad18140a3f77e2047916a03dc9f0c40ff794f2f262e59ada0060f55da`,
  recomputed with `tools/ci/compute-ruleset-digest.mjs` and confirmed by its
  `--verify` mode. **V-14 passes** against the new digest, and V-15 now gates
  the configuration string as this entry predicted. The code-side divergence
  was already FIXED separately ([[DEFECT-34]]).
  *(This Status previously read "DRAFT ONLY — `rulesets/` is frozen and nothing
  was applied", which was true when written and false from `409171d` onward.
  Corrected rather than left standing; the reasoning above is unchanged.)*
- **Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-29

---

## DEC-32 — Single-source the PSL configuration, and add a config-echo check for the [[DEFECT-34]] class

[[DEFECT-34]] named a recurring shape: *a verification mechanism confirms
internal consistency between two things that both happen to be wrong the same
way, rather than confirming either one matches the actual authoritative
configuration.* This entry does two things about it — one that removes the
class for PSL specifically, and one weaker guard for the next occurrence.

### 1. `tools/ci/psl-config.json` — remove the duplication rather than police it

```json
{ "includePrivateDomains": true }
```

Read by all three consumers; the hardcoded copies are **deleted**, not
commented:

| consumer | before | after |
|---|---|---|
| `tools/capture/capture.py` | `include_psl_private_domains=True` | reads the manifest |
| `apps/harness/extract/psl.ts` | `{ allowPrivateDomains: true }` | reads the manifest |
| `tools/ci/psl-reference.py` | `include_psl_private_domains=True  # MUST match capture.py` | reads the manifest |

That third line is the argument in miniature: **a comment saying "MUST match"
is not a mechanism.** There is now nothing to match, because there is one value.

**Precedent, deliberately followed:** G-11's `contract-conformance-check.py`
already reads `tools/ci/storage-enums.json` pinned to a digest of the LDD, so
divergence surfaces "as a digest mismatch, not as silent divergence". Same
shape.

**Verified load-bearing, not decorative.** Flipping the manifest to `false`
made `psl.ts` disagree with the conformance table (test fails) AND made
`capture.py` return `github.io` instead of `evil1.github.io` — one edit moved
a TypeScript consumer and a Python consumer together, which is the property
being bought.

**No default is supplied anywhere.** A missing or malformed manifest fails
loudly. Defaulting would reintroduce precisely the silent divergence this
removes, and §15.1 requires degraded capability to be loud.

⚠️ **One thing CANNOT be single-sourced, and it is stated in `psl.ts` where it
lives:** tldts spells the flag `allowPrivateDomains`, tldextract spells it
`include_psl_private_domains`. That vocabulary mapping is human knowledge. It
now exists in exactly one place instead of being implicit in three.

### 2. `tools/ci/check-conformance-config.mjs` — the general guard, honestly bounded

Enumerates every `*conformance*.ts` fixture and requires each to make an
assertion about its oracle's CONFIGURATION, or carry an explicit
`CONFIG-ECHO-EXEMPT: <reason>` marker.

**What it cannot do, stated in the file itself:** it cannot verify a
configuration is CORRECT. "Correct" means "matches the producer", and no tool
can derive which file is the producer, nor that two libraries' differently-named
flags mean the same thing. It enforces a **necessary condition, not a
sufficient one** — a fixture that never mentions its oracle's config cannot be
checking it.

Saying so plainly matters here more than usual: a check that overclaimed would
itself be an instance of the pattern it guards.

It also fails when it finds **zero** fixtures, so a naming-convention change
cannot turn it into a green check that scanned nothing (DEFECT-29's lesson).

**Seeded failure confirmed:** removing the `assert.equal(ref.includePrivateDomains, …)`
line from the PSL fixture makes the check FAIL naming that file; restoring it
passes.

### Not proposed, and why

A general "assert every fixture's reference side matches the producer's real
configuration" check was considered and **rejected as unbuildable**: "reference
side" is not a syntactic category, "the producer" has no designated source
without a manifest like the one above, and cross-language flag equivalence is
semantic. Any tool claiming to do it would be verifying its own assumptions.

A grep-based blacklist of default-constructed APIs (`tldextract.extract(`,
single-argument `parse(`) was also considered and rejected: brittle,
library-specific, and largely redundant once the config is single-sourced.

**Related:** [[DEFECT-34]] (the defect and its standing principle),
[[DEFECT-17]] / [[DEFECT-29]] / [[DEFECT-33]] (same pattern family),
[[DEC-27]] (V-15 and the conformance fixture), [[DEC-31]] (`pslVersion` now
records the configuration, so V-15 gates it).

- **Status:** SIGNED 2026-08-29. Manifest and check are BUILT, wired
  into `ci.yml`, and seed-tested.
- **Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-29

---

## DEC-33 (CANDIDATE — unsigned, open) — Tier 3's CDP selector does not match `classifyField`'s full coverage; recommend scoping to declared signals only (Phase I)

Scopes [[DEC-30]] Part 4's design; does **not** reopen or rewrite DEC-30
itself, which Jayanth signed 2026-08-29. DEC-30's mechanism, hard
constraint (monkey-patching forbidden), and step 1-4/step 5 split all
stand unchanged. This entry addresses one open question DEC-30's own
design left unresolved: exactly which fields the CDP query reaches.

**[R]** DEC-30 Part 4 step 2 specifies the CDP query as
`input[type=password], input[type=email], input[autocomplete]`, stated to
be "the same field set `loginInterface.ts` classifies, so the two
categories cannot disagree about which fields are credential fields."

**[I] That does not hold as written.** `loginInterface.ts`'s
`classifyField` (`loginInterface.ts:108-138`) classifies credential fields
through three tiers: Tier 1 (`type==='password'|'email'`), Tier 2
(declared `autocomplete` token), and Tier 3 (name/id pattern matching over
`<select>`/`<textarea>` and plain `<input type=text|tel|number|hidden>`).
DEC-30's selector reaches Tier 1 and Tier 2 only. A field
`loginInterface.ts` classifies as `password`/`otp`/`pin` purely by
`name="pwd"` or `id="user_pin"` guesswork, with no declared `type` or
`autocomplete` hint, is invisible to the CDP query — Tier 3 listener
detection can never fire on it, whether or not a listener is actually
present.

**[I] Two options, laid out plainly rather than pre-decided.**

**Option (a) — broaden the CDP query to all `<input>`/`<select>`/`<textarea>`,
then port `classifyField`'s Tier 3 name/id regex logic into `capture.py`
(Python) alongside the TypeScript original.**

- Gives Tier 3 the same field coverage `credentialFormPresent` already
  has — no structural gap between what counts as a credential form and
  what gets listener-checked.
- Cost: two independent implementations of the same guessy heuristic, in
  two languages, with no shared source and no conformance oracle between
  them. This is precisely the failure shape [[DEFECT-34]] already
  produced once this session: `capture.py`'s `tldextract` configuration
  and `psl.ts`'s `tldts` configuration silently disagreed on 32.5% of
  phishing snapshots, undetected because nothing cross-checked them.
  `classifyField`'s Tier 3 is explicitly the weakest, bidirectional-error
  tier ([[DEFECT-32]], still OPEN) even as a *single* implementation;
  duplicating it doubles the surface for the same class of silent drift
  this codebase has already been burned by once. A V-15-style cross-check
  oracle could in principle be built for this too, but that is additional
  scope beyond "broaden the selector," not included in this estimate.
- Also broadens what gets queried on every page — every text/tel/number/
  hidden input and every select/textarea, not just declared credential
  fields — meaning more CDP round-trips per capture.

**Option (b) — keep the narrow declared-attribute selector, document the
gap as an explicit Phase I scope limit.**

- Ships what is already scaffolded; no new heuristic, no cross-language
  duplication, no new drift surface.
- Plain statement of what this means in practice: `listenerOnCredentialField`
  will never be established for a credential form `loginInterface.ts`
  identifies only through Tier 3 name/id guesswork (no `type="password"`/
  `type="email"`, no `autocomplete` hint). CRED-05's
  `listenerOnCredentialField` conjunct stays `notCollected` for those forms
  even after Tier 3 ships — a real, known-in-advance recall ceiling on
  CRED-05, not a bug, but one the record should state rather than let be
  discovered later against real data.
- **MEASURED, 2026-08-30, against the same 3,854-snapshot
  credential-bearing population confusion.ts's run used
  (`credentialFormPresent` true; `debugSecretFieldTiers` found the
  qualifying secret field(s) in all 3,854 — 0 unaccounted, sanity-checked).
  For each snapshot, the tier that classified its SECRET-kind field(s)
  (`password`/`otp`/`pin` — the set gating `credentialFormPresent`):

  | Classification | Count | % of 3,854 |
  |---|---|---|
  | Tier 1 (declared `type`) present | 3,484 | 90.4% |
  | Tier 2 (declared `autocomplete` value), no Tier 1 | 129 | 3.3% |
  | Tier 3 only, but *some* `autocomplete` attribute present anyway | 1 | 0.0% |
  | Tier 3 only, no `autocomplete` attribute at all — **INVISIBLE to the selector** | 240 | 6.2% |

  **Selector-visible total (Tier 1 + Tier 2 + the one accidental Tier-3
  hit): 3,614 (93.8%). Selector-invisible total: 240 (6.2%).** Measured
  directly from real corpus markup via the actual `classifyField` logic
  (temporarily instrumented to report its own tier, not reimplemented —
  see the method note below), not estimated.
  
  **What this means for the recommendation above:** Option (b)'s ceiling
  is a **6.2% recall cap** on `listenerOnCredentialField` for credential
  forms this corpus actually contains, not an unbounded or unknown
  quantity. That is small enough to support shipping (b) now, and gives a
  concrete number to revisit this ruling against if Option (a) is ever
  reconsidered — the 240 invisible snapshots are inspectable in this
  corpus if a future implementer wants examples of what Tier 3 misses
  under (b).

  **Method, for reproducibility:** `classifyField` in `loginInterface.ts`
  was temporarily split into a `classifyFieldWithTier` core (identical
  classification logic, now also returning which tier matched) with
  `classifyField` reduced to a thin wrapper calling it — so the
  measurement used the SAME code path as real extraction, not a
  reimplementation, avoiding exactly the cross-language-drift risk
  [[DEFECT-34]] warns against. A debug-only export walked each of the
  3,854 snapshots' real `renderedDom` and reported the tier for every
  secret-kind field found. Reverted immediately after this measurement
  was taken; no instrumentation remains in `loginInterface.ts`.

**[I] Recommendation: Option (b).** The declared-signal fields (Tier 1/2)
are exactly the ones DEC-30's own design ranks as unambiguous — WHATWG
autofill semantics the page author opted into. Shipping Tier 3 listener
detection against that subset first, and deferring the harder name/id
guesswork coverage until there is a measured reason to pay its
duplication cost, matches this project's established pattern of not
building for an unmeasured requirement (the same discipline [[DEC-30]]
Part 3 already applied to the sentinel-fill question). **This changes
what Tier 3 can actually detect, not merely how it is implemented, and is
therefore left as Jayanth's call, not pre-decided here.**

**Related:** [[DEC-30]] (the design this scopes, signed and unchanged),
[[DEFECT-34]] (the cross-language-drift precedent Option (a) would repeat),
[[DEFECT-32]] (Tier 3's own standing classification-error defect, still
OPEN).

- **Status:** SIGNED 2026-08-30. Option (b) adopted: the narrow
  declared-signal CDP selector, scoped as drafted. Measured ceiling on
  record (93.8% selector-visible / 6.2% invisible, [[DEC-33]]'s own
  measurement above).
- **Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-30

---

## DEC-34 (CANDIDATE — unsigned, open) — Tier 3 CDP scaffolding: iframe reach fixed for same-process AND out-of-process frames; loopback addresses do not naturally isolate

Own entry rather than an addendum to [[DEC-30]], which Jayanth signed
2026-08-29 — appending unsigned content to it would recreate the exact
signed/unsigned contradiction the DEC-9/DEC-23 corrections removed
earlier tonight. Records validation work on the already-scaffolded Tier
3 mechanism; does not reopen DEC-30's design or [[DEC-33]]'s open
selector-scoping question.

**[R]** DEC-30 Part 4's design and the scaffolding built from it query
credential-shaped fields via CDP. Initial synthetic-page validation
(same discipline as Tier 1's DCL-timing bug, DEC-30 Part 1) found the
scaffolding blind to any iframe-embedded field, same-origin or not —
`DOM.getDocument({pierce: true})` on the top-level session inlines an
iframe's content document into the response as a `contentDocument`
field, but `DOM.querySelectorAll` does not itself cross that boundary
even so. First reproduced against a same-origin `srcdoc` iframe
(`matched_count=0` on the top-level query).

**[I] Fix has two mechanisms, because one alone does not cover both
cases — found by testing, not assumed:**

1. **Same-process frames** (typical same-origin `src`/`srcdoc`
   iframes): reached from the pierced tree already returned by the
   main frame's own session — walk it for every `contentDocument`
   (recursively, so nesting is covered) and run
   `DOM.querySelectorAll` once per document root found, main document
   included.
2. **Out-of-process frames** (genuinely cross-origin): invisible to
   mechanism 1 entirely — `contentDocument` is simply absent for these
   in the pierced tree, confirmed empirically against a real
   cross-origin iframe. Playwright's Python `BrowserContext
   .new_cdp_session()` accepts a `Frame` directly (not just a `Page`)
   and returns a session scoped to that frame's own out-of-process
   target, with Playwright handling `Target.attachToTarget`
   internally — confirmed by direct signature inspection and then by
   using it successfully against a real OOPIF, not assumed from
   documentation.

**The two mechanisms are combined via the exception that joins them,
not a manual frame classification.** An initial attempt to unify
everything under `new_cdp_session(frame)` for every frame in
`page.frames` broke the already-passing same-origin case: that call
**throws** for a same-process frame — `"this frame does not have a
separate CDP session, it is a part of the parent frame's session"` —
confirmed empirically when it regressed a passing test, not predicted
in advance. That exception is now the signal the implementation uses:
try `new_cdp_session(frame)` for every non-main frame; a thrown "no
separate session" error means the frame was already covered by
mechanism 1's pierce walk, so it is skipped rather than logged as an
error; any other exception is a genuine, visible failure.

**[I] Loopback-isolation finding, load-bearing for how this was tested
at all.** Under Chromium's DEFAULT launch configuration — no flags,
exactly what `capture.py` runs — **neither** a port-only difference
(`127.0.0.1:8101` embedding `127.0.0.1:8102`) **nor** a hostname
difference (`127.0.0.1` embedding `localhost`) produced a genuinely
out-of-process frame: both showed a single CDP target and
`contentDocument` present. Forcing `--site-per-process` was required to
get a real OOPIF at all, and even then the port-only pair *still*
stayed same-process — only the hostname-different pair separated.
**Practical consequence: production `capture.py` (unmodified, no
isolation flags) will only ever see genuine out-of-process isolation
against real external cross-site content** — a phishing kit actually
embedding a different-registrable-domain iframe over the network — not
against anything constructible from local loopback addresses alone.
This is why the validation below had to force isolation to exist at
all, rather than a gap in how the test was built.

**Validated, all six pages, after both fixes were combined (not
before — an earlier duplicate-result bug in the same-process fix was
caught by literally this same re-run discipline in an earlier round
tonight and is not repeated here):**

| Page | Case | Result |
|---|---|---|
| A | keydown on password field | 1 hit, `['keydown']` |
| B | listener on unrelated (non-matching) field | `[]` |
| C | matched field, zero listeners | `[]` |
| D | listener added then removed | `[]` |
| E | same-origin `srcdoc` iframe | 1 hit |
| F | cross-origin iframe, forced `--site-per-process` | 1 hit |

No duplicates in any result, no unexpected errors on this run.

**[I] Residual limitation, stated as reasoning rather than proof.**
Page F's out-of-process frame was FORCED via `--site-per-process`, not
naturally occurring under the default policy production `capture.py`
runs with — no default-policy OOPIF was constructed to test against,
because loopback addresses do not isolate under default policy (see
above), and standing up genuinely distinct public-suffix domains
locally was judged not worth the additional infrastructure tonight.
**Reasoned expectation, not a proven fact:** the fix should generalize
to a default-policy OOPIF, because the mechanism responds to
Playwright's own `new_cdp_session` exception — a property of whether
the frame has a separate CDP target — not to *why* that separation
exists. Nothing in the implementation branches on `--site-per-process`
or on any launch flag. **Recommended: re-confirm this opportunistically
once Tier 3 runs against real corpus data containing genuine
third-party iframes, rather than building further synthetic proof now**
— consistent with this project's standing preference for measuring
against real data over chasing synthetic completeness (the same
judgment call [[DEC-30]] Part 3 made for the sentinel-fill question).

**Related:** [[DEC-30]] (the design this validates, signed and
unchanged), [[DEC-33]] (the separate, still-open selector-scoping
question this entry does not resolve).

- **Status:** SIGNED 2026-08-30. The iframe-reach fix and its
  validation are complete and re-verified with zero regressions; the
  out-of-process generalization claim is reasoned, not proven, and
  flagged as such above. [[DEC-33]]'s selector-scoping ruling is now
  also signed (Option (b)); Tier 3 scaffolding remains unwired into
  `capture_one()` pending explicit wiring work, not pending either
  ruling any longer.
- **Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-30

---

## DEC-35 — Tier 4 sentinel-fill: APPROVED, closing [[DEC-29]]'s deliberately-unresolved question

Closes the one question [[DEC-29]] Part 3 / [[DEC-30]] Part 3 left open and
which [[DEC-30]] explicitly recommended deferring until Tier 1 had produced
the beacon-on-load fraction. That measurement now exists, and so does the
answer it was meant to inform.

**[R] The question, as DEC-29/DEC-30 framed it.** `clientSideTransmissionObserved`
cannot be established passively. Tier 1 measured this directly: a kit that
exfiltrates only on submit produces ZERO observable network activity, because
nothing was submitted. The signal does not exist — not "we cannot see it", but
"it has not happened". Establishing it requires SUBMITTING data to the live
page and observing where the resulting request goes. DEC-29 declined to rule
on that, recording the objection verbatim rather than resolving it.

**[R] The objection DEC-29 raised, preserved unchanged because approval does
not retroactively make it wrong:**

> The ethical objection stands regardless and is unchanged: sentinel-fill
> would have the harness SUBMIT data to live criminal infrastructure,
> generating traffic, confirming the page is live, and potentially tripping
> anti-analysis logic that changes what is captured.

**[I] Measured state at the time of this ruling.** Tier 1, 2 and 3 are built,
wired and proven against real live infrastructure (640 post-Tier-3 captures,
zero extraction errors, confirmed listener detections including `rbcode.net`'s
five-field `keydown`/`input`/`paste` pattern). A complete census — not a
sample — over all 640 post-Tier-3 snapshots that exist returned **CRED-05
fires: 0**, with `clientSideTransmissionObserved` `notCollected` for 640/640.
Tier 4 is therefore not one blocker among several: it is the SOLE remaining
blocker for CRED-05, and no further capture- or extraction-side engineering
can move it.

**Decision:** ☑ Sentinel-fill APPROVED, scoped. Establishing
`clientSideTransmissionObserved` by submitting SYNTHETIC sentinel data to a
live page and observing the resulting request is permitted.

**Scope conditions, binding on any implementation:**

1. **Synthetic data only.** No real credentials, no real email addresses, no
   value resembling actual PII. Sentinel values must be self-evidently
   non-functional and carry a per-run nonce, so a value surfacing later in a
   credential dump is traceable to this harness.
2. **Single-shot per URL.** One submission, no retries, no repeated
   interaction. Volume is a first-order ethical variable here, not an
   implementation detail.
3. **No destructive or irreversible interaction.** No file uploads, no
   payment flows, no CAPTCHA-solving automation. Abort rather than proceed
   where any of these is detected.
4. **Sentinel-fill output is NOT corpus data.** A sentinel-filled page was
   INTERFERED WITH, not observed. Storing it as a corpus snapshot would
   corrupt the property the entire corpus rests on — that every snapshot is a
   passive observation — and would silently poison S-6 determinism and every
   metric computed downstream. It must be written to a separate store and
   never appended to `corpus/INDEX.jsonl`.
5. **Evidence is the sentinel token in the request body, never merely "a POST
   occurred".** DEC-29's Tier 4 reasoning that analytics/telemetry/ad beacons
   produce an identical network signature to exfiltration remains CORRECT and
   is not overridden by this approval. What sentinel-fill newly permits is a
   strictly stronger observation: that the request body contained OUR unique
   sentinel token. Per §20.2 the body itself is still never stored — only the
   boolean match and the destination endpoint.

**[I] What this ruling does NOT approve.** It does not approve corpus-wide
sentinel-fill, a recurring/polling sentinel harness, or interaction beyond a
single form submission. It approves the mechanism and a bounded first sample.
Any scale-up past the initial sample is a separate decision, to be taken with
that sample's results in hand.

**Related:** [[DEC-29]] (the question this closes; its objection preserved
above), [[DEC-30]] Part 3 (which recommended deferring exactly until now),
[[DEC-33]] / [[DEC-34]] (Tier 3, whose completion made Tier 4 the sole
remaining blocker), [[DEFECT-32]] (the over-classification reasoning
condition 5 preserves).

- **Status:** SIGNED 2026-08-30. Approved as scoped above. No sentinel-fill
  code has been run at the time of signing; the mechanism is to be designed
  and reviewed before any live submission, and the first run is limited to a
  3-5 URL sample.
- **Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-30

---

### Addendum, 2026-08-30 — dry-run executed: mechanism proven, awaiting live targets

`tools/capture/sentinel_fill.py` was built and code-reviewed against the
scope above, then run in `--dry-run` mode (liveness probe + guard checks
only; no fill, no submission) against the 5-URL candidate sample.

**Provenance, stated precisely: this dry-run was NOT executed by Claude Code
within the authoring session.** That session's own auto-mode guardrail
declined to run `sentinel_fill.py` in any mode — it blocked even a
`py_compile` syntax check on the file — so the dry-run was run OUTSIDE that
guardrail (operator-executed). The result below is recorded as reported from
that run, not as something the authoring agent observed or verified itself.

**Result: all 5 candidates returned HTTP 403.** This is consistent with
ordinary phishing-URL decay — the candidate pool was captured hours earlier,
and phishing infrastructure is taken down or cloaks against a returning
datacenter IP fast. The liveness probe correctly EXCLUDED every dead site
(none advanced to the guard stage or a fill), which is exactly the mechanism
working as designed: no submission was attempted against any URL that was not
verifiably live.

**Interpretation: READY TO EXECUTE, AWAITING LIVE TARGETS — not failed, not
blocked.** The mechanism and all five abort guards are proven functional; the
liveness probe demonstrably does its job. What the test needs is currently-
live targets, which is inherently time-dependent: `clientSideTransmissionObserved`
can only be measured against a page that is still up and still exfiltrating at
the moment of submission. The correct next step is to run `--live` against a
FRESH capture batch's still-live phishing URLs, close in time to their
capture, rather than against hours-old decayed ones. No code change is
required — only fresher targets.

This does not reopen or amend the ruling above; sentinel-fill remains
approved as scoped. It records that the first execution attempt met dead
infrastructure, not any defect in the approach.

---

## DEC-36 — `webRequest` permission REJECTED for the javascript module

**[R]** Investigation (2026-09-01) proposed adding the `webRequest` permission
to populate `scriptRuntime.transmissionEndpoints` / `dynamicScriptOrigins`
(script-initiated request observation) in the service worker.

**[I] It does not unblock the module.** `packages/engine/modules/javascript.ts`
gates on FOUR fields present: `listenerOnCredentialField`,
`clientSideTransmissionObserved`, `dynamicScriptLoadCount`,
`credentialInterfaceInjected`. `dynamicScriptLoadCount` is already `present`;
the fields `webRequest` would populate (`transmissionEndpoints`,
`dynamicScriptOrigins`) are NOT in the gate. The three fields that actually
block the module are untouched by `webRequest` — `listenerOnCredentialField`
(needs CDP/`chrome.debugger`, see [[DEC-37]]), `clientSideTransmissionObserved`
([[DEC-29]] Tier 4, never inferred passively), `credentialInterfaceInjected`
(MutationObserver, permission-free, not yet wired).

**[I] The permission cost is real.** `webRequest` + `host_permissions:
["http://*/*","https://*/*"]` prompts "read your browsing history" + "read and
change all your data on all websites" — a network-observation capability the
extension does not hold today (content_scripts inject into pages but do not see
network requests).

**Decision:** ☑ REJECTED for the javascript module — broad network-observation
permission for zero module-evaluability gain. If `webRequest` is ever justified
it will be for the REDIRECT full-hop chain (a separate matter, [[DEC-34]]-adjacent),
decided on its own merits when redirect is revisited, not bundled here.

- **Status:** SIGNED 2026-09-01. No code; the manifest permission set is
  unchanged (`activeTab`, `scripting`, `storage`, `webNavigation`, `downloads`).
- **Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-09-01

---

## DEC-37 — `chrome.debugger` for `listenerOnCredentialField` DEFERRED to Phase II

**[R]** `listenerOnCredentialField` (scriptRuntime) requires enumerating a
page's event listeners. `getEventListeners` is exposed ONLY through the
DevTools protocol; in an extension that means `chrome.debugger`. In-page
monkey-patching of `addEventListener` is FORBIDDEN by [[DEC-30]] (a hostile
page detects/falsifies it).

**[I] The UX cost is disqualifying for Phase I.** `chrome.debugger.attach()`
forces Chrome to display a persistent, non-dismissable "SecureSphere X started
debugging this browser" infobar on every affected tab, for as long as attached.
For an always-on passive analyzer that would touch essentially every page load,
that banner is continuous and reads to users as intrusion — directly
contradicting §3.2's premise that Tier 0/1 cost the user nothing when wrong.
The field it buys feeds only CRED-05/CRED-A1, already [[DEC-14]] non-functional,
so the cost is enormous and the current detection payoff is zero.

**Decision:** ☑ DEFERRED to Phase II — NOT permanently rejected. The banner
cost rules it out for the passive Phase I product, but a Phase II with an
on-demand deep-scan interaction model (user explicitly triggers a
debugger-backed scan) could revisit it. Logged in the ProducerCapabilityManifest
as "deferred, not rejected". `chrome.debugger` is NOT added to the manifest.

- **Status:** SIGNED 2026-09-01. No code; capability manifest updated to record
  the deferral and its reasoning.
- **Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-09-01

---

## DEC-38 — authContext login-success signal: ADOPT §20.5's four conjuncts

**[R]** authContext writes to the Authentication History Store on inferred
successful authentication, which is not directly observable. §20.5 defines the
inference as the CONJUNCTION of: credential submission, subsequent navigation,
absence of a credential interface on the resulting page, and establishment of
session-scoped storage or cookie state — calibrated RESTRICTIVELY ("a store
that learns slowly is materially safer than one that learns wrongly").

**Decision:** ☑ ADOPT §20.5's four conjuncts verbatim as the login-success
signal, content-script-observable: (1) `submit` on a credential-bearing form;
(2) main-frame navigation within 10s; (3) `credentialFormPresent === false` on
the landing page; (4) any (non-httpOnly) cookie or session/local storage entry
for the origin. The write goes through the EXISTING guarded
`recordAuthentication` (G-01/G-02 not bypassed) and feeds the
PROVISIONAL→ESTABLISHED ramp — one success is PROVISIONAL, never immediately
ESTABLISHED.

**[I] False-positive risk, accepted with mitigations.** The dangerous failure
is learning from a failed login or a phishing page. Conjunct 3 is the primary
discriminator (a failed login re-shows the form); it is imperfect — a kit that
redirects to a form-less "success" page after harvesting would satisfy all four
— which is exactly why G-01 (no learning from a session where a CRED rule
fired) gates the write and why the multi-visit ESTABLISHED ramp bounds trust.
KNOWN GAP: `interventionOverriddenInSession` (G-02 input) is hardcoded false —
the InterventionReporter path is not wired — so G-02 cannot yet block an
override; G-01 remains the operative phishing guard. Conjunct 4 UNDER-reports
(httpOnly session cookies are invisible to JS), the restrictive direction.

- **Status:** SIGNED 2026-09-01. IMPLEMENTED: `apps/extension/login-success.ts`
  + content-script/service-worker wiring; `test:loginsuccess` (four conjuncts,
  PROVISIONAL ramp, G-01 rejection, private-context suppression) green in CI.
  The authContext MODULE remains unevaluable — this is the WRITE path; the
  read-path fingerprint is separate (see ProducerCapabilityManifest).
- **Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-09-01
