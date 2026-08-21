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
**Signed by:** Jayanth (Architecture Owner)  **Date:** 2026-08-21

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

## DEC-9 — `B1.5` (property test) ownership — deliberately open

Per the guide, not due now — due week 4. `Implementation-Ownership-Plan.md` §3
currently assigns `B1.5` (property tests, depends on `B1.2`/`B1.3`) to the Architecture
Owner. **Left open by design; revisit at week 4.** No signature required now.

**Status:** OPEN — revisit week 4.

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

**To unblock the critical path today, sign DEC-1, DEC-2, DEC-3, DEC-8.** The rest gate
later steps and can be signed in any order.
