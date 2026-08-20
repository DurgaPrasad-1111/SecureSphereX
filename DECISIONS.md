# SecureSphere X — Project Decisions

**Status: DRAFT — Revision 1. Not signed. Requires Architecture Owner (Jayanth) review, amendment, and signature before it satisfies Step 1.**

> **How this document came to exist.** `How-To-Start-Coding.md` assumes a `DECISIONS.md` Revision 3 already sits in the repo, fully evidenced, needing only sign-off. No such file exists anywhere in the 46-file spec corpus — confirmed by an exhaustive search for `DECISIONS.md`, `DEC-1`…`DEC-9`, and `Annex A` across every spec document. Rather than block on an artifact that was never produced, this draft reconstructs each decision from evidence already present in the specs. **Every claim below is tagged:**
>
> | Tag | Meaning |
> |---|---|
> | **[R]** | Recovered — a spec document already states this directly. Source cited. |
> | **[I]** | Inferred — a logical consequence of surviving spec content. Reasoning shown. |
> | **[N]** | New Decision — the specs leave this genuinely open. A recommendation is offered, but this is real judgment, not archaeology. |
>
> Treat `[N]` items with real scrutiny. Treat `[R]`/`[I]` items as "verify the citation," not "trust the conclusion."

---

## DEC-1 — Corpus storage: Git-LFS vs. external object store

**[R]** `Implementation-Readiness-Review.md` §1 (item R-1) states this explicitly: *"Decide corpus storage: Git-LFS vs external object store. Affects repo initialisation; migrating after commits is painful and rewrites history."* `Stage0-Completion-Pack.md` §1 lists `corpus/` as *"Snapshots. Git-LFS or external store"* — also non-committal.

**[I]** `How-To-Start-Coding.md` Step 2 already presupposes gzip-compressed snapshots committed under a path the corpus tooling globs directly (`rglob("*.json.gz")`), and Step 1's own check criterion is:
> `.gitignore` names `corpus/**` with an exception for `corpus/INDEX.jsonl`, **or** `.gitattributes` exists.

These are the two branches of DEC-1: (a) external store — `corpus/` git-ignored except a lightweight `INDEX.jsonl`; or (b) Git-LFS — `.gitattributes` tracks `corpus/**`. Gzip (Step 2) is compatible with either.

**[N]** The size estimate. Step 2 references *"DEC-1's 120 GB disk estimate"* as a pre-existing figure to be replaced by measurement — I could not find where 120 GB was derived from in the spec corpus, and I'm not going to invent a precise figure. What the specs do support: 30-minute polling across two feeds, gzip'd rendered DOM + headers + TLS chain (no screenshots per Step 5's raw-material list), over a multi-week capture window. **Recommendation: don't try to reconstruct 120 GB — run the first `--limit 25` capture (Step 2) and multiply the measured average bytes/snapshot by your expected capture volume. That's a real number instead of an inherited guess.**

**Recommendation:** Given a three-person academic project (no dedicated infra budget, `docker-compose` deployment per `Backend-Architecture-Decision-Record.md` Decision 1), **external object store is the lower-risk default** — Git-LFS has bandwidth quotas on free GitHub tiers that a fast-growing phishing corpus can hit mid-project, and DEC-1 is explicitly a one-way door. But this is genuinely your call to make, not mine.

**Decision:** ☐ External store (`.gitignore` + `INDEX.jsonl`) ☐ Git-LFS (`.gitattributes`)
**Signed by:** _______________ **Date:** _______________

---

## DEC-2 — Dotted filenames in `packages/contracts/`

**[N]** I could not find spec evidence for the claim in Step 1's table that underscore filenames make `tsc` "fail on the first commit." TypeScript module resolution doesn't care whether a `.ts` filename uses underscores or dots — `evidence_contract_v1.ts` is exactly as valid as `evidence.contract.v1.ts`. **Flagging this as a possible error in `How-To-Start-Coding.md` rather than accepting it at face value** — the "strict reviewer" instruction cuts both ways.

What the spec corpus *does* establish: `MANIFEST.md` documents that the **real, current, authoritative repository uses underscore names** (`evidence_contract_v1.ts` etc.) as a deliberate correction — `FIX_LOG.md` records a prior session that converted dotted references back to underscore to match reality. So underscore is the established convention where these files currently live (`spec/`).

**Recommendation:** Dotted naming for the `packages/contracts/` copies only is a reasonable, harmless convention choice (it's a common pattern for `*.type.ts` files) — but **the "or `tsc` fails" justification should be struck or re-verified**, not carried forward as if it were a proven fact. `spec/`'s six source files stay underscore-named regardless; this only affects the copies.

**Decision:** ☐ Dotted names, `tsc`-failure claim removed from rationale ☐ Verify the `tsc` claim first ☐ Keep underscore names in `packages/contracts/` too
**Signed by:** _______________ **Date:** _______________

---

## DEC-3 — Five contract questions (Annex A-1 … A-5)

**[R]** `How-To-Start-Coding.md` Step 6 names the five sites directly, even without the amendment *text* existing anywhere: B-14 subscription invariant (comment), `get()` in-memory constraint (comment), branding the four ID types (`analysisSessionId`, `targetResourceId`, `passResultId`, `findingId`), branding `DayStamp` (the eight `...On` date fields), and making `FetchRecord` a discriminated union.

**[I]** The rationale for each follows directly from what unbranded types allow today: a bare `string` lets `analysisSessionId` and `findingId` be swapped at a call site with no compiler error; a bare date `string` lets a `DayStamp` and a full ISO-timestamp mix silently; an un-discriminated `FetchRecord` lets `httpStatus` be populated on a `timeout` outcome, an impossible state the type system should reject. These are standard type-safety hardening, not architecture changes — consistent with `MANIFEST.md` §6's framing of contract changes needing "every consumer updated in the same change."

**Recommendation:** All five as scoped in Step 6. This one is low-risk to sign as-is; the main failure mode is incomplete application (Step 6 already warns `createSession(...)` at line 210 is the usual miss), not wrong direction.

**Decision:** ☐ Approved, apply per Step 6 Annex A-1…A-5
**Signed by:** _______________ **Date:** _______________

---

## DEC-4 — Resolving the `G-8` name collision

**[R]** Fully resolved by internal evidence, no gap here. `Stage0-Completion-Pack.md` §3 names `G-8` as *"Rule-set static validator: V-1…V-12."* `MANIFEST.md` §5 separately calls `contract-conformance-check.py` *"Governance rule G-8"* — the exact collision `How-To-Start-Coding.md` describes. Since `spec/` is frozen and read-only, this collision can't be fixed there; it has to be resolved in the implementation-side `DECISIONS.md`.

**Recommendation:** Adopt Step 3's resolution as stated: `G-8` = rule-set validator (owns the name in `ci.yml`); `contract-conformance-check.py`'s CI step is renamed `G-11`. This is already fully specified elsewhere in the guide — signing it here just makes it official.

**Decision:** ☐ Approved — `G-8` = rule-set validator, `G-11` = contract-conformance check
**Signed by:** _______________ **Date:** _______________

---

## DEC-5 — Defer `ssl`/`dns` modules to stubs

**[R]** Directly and completely recovered. `Implementation-Ownership-Plan.md` §9, "Scheduling Decision Requiring Sign-off":
> *"Defer full implementation of the `ssl` and `dns` modules. No rule in `rules-v0.1` reads either module's findings... a minimal conformant implementation — correct shape, correct `unevaluable` handling, findings populated from evidence — satisfies every architectural requirement until a rule consumes them. This removes roughly two person-days from Durga's Stage 1... Not an architecture change; a scheduling decision. Requires Jayanth's approval as Architecture Owner."*

**[N]** One number doesn't match. `How-To-Start-Coding.md` cites *"the 2.0 person-days between 41.5 required and 41.9 available"* — I can't source 41.5/41.9 anywhere in the corpus. `Implementation-Ownership-Plan.md` §7's totals sum to 43.5 person-days (16.5 + 12.5 + 14.5), not 41.9. The "~2 person-days" figure matches; the specific totals around it don't. Worth a sanity check, not a blocker — the decision doesn't depend on the exact total.

**Recommendation:** Sign as worded in the Ownership Plan — this is literally already a "requires sign-off" item waiting for exactly this signature.

**Decision:** ☐ Signed ☐ Refused
**Signed by:** _______________ **Date:** _______________

---

## DEC-6 — "Review is not a release"

**[I]** Inferred from two facts read together. `Stage0-Completion-Pack.md` §3 places `G-9` (property tests) at Stage 1b and `G-10` (deterministic replay) at Stage 6 — both explicitly *not* available now. `MANIFEST.md` §2–3 marks the only schema-generation tooling in the corpus (`archive/generate-canonical-schemas.py`) as writing outside the repository (`/tmp/canonical-schemas.json`) and superseded — there is no working schema generator today.

**Recommendation:** DEC-6 should state plainly: passing `G-1`…`G-8`/`G-11` and Jayanth's rule-set review is what Stage 0 requires for "review." It does **not** mean the replay gate (`G-10`) or a real schema generator exist yet, and nobody should treat Stage 0 sign-off as implying either is done. This keeps week 1–2 scope from silently expanding.

**Decision:** ☐ Approved as scoped above
**Signed by:** _______________ **Date:** _______________

---

## DEC-7 — "Implementer" means accountability, not authorship-of-convenience

**[R]** `Implementation-Ownership-Plan.md` §1's Responsibility Matrix defines four distinct roles per component — Architecture Owner, **Implementer** ("writes the code"), Reviewer, Integrator — and assigns a named Implementer to every one of the ten evaluation modules individually (e.g., `url`→Durga, `loginForm`→Varun), each with its own named Reviewer.

**[I]** Batch-generating several modules in one Claude Code session, with one person nominally attached, would put a name on components that person didn't actually engage with — undermining the review structure §1.2 depends on ("Jayanth is a mandatory reviewer only where a frozen invariant is at stake; everything else is peer-reviewed A↔B"). That peer review only works if the *named* implementer genuinely produced and understands the code being reviewed.

**Recommendation:** Sign DEC-7 as: each module is implemented in its own session by its assigned owner, reviewed by its assigned reviewer per the matrix. Batch-generation across multiple modules in a single pass is out per this reading of §1/§2.6.

**Decision:** ☐ Approved
**Signed by:** _______________ **Date:** _______________

---

## DEC-8 — PSL version placement

**[I]** `ruleset_format_v1.ts`'s `sameSite`/`notSameSite` predicate operators compare **already-extracted** registrable-domain fields at Stage 2 — the PSL resolution itself happens upstream, at evidence-extraction time, not inside the rule engine. `capture.py` separately uses a **bundled, no-network-fetch** PSL snapshot (`tldextract` with `suffix_list_urls=()`) for corpus split-keying, with an explicit self-test because a silently-stale PSL "collapses the corpus into one split" — and `snapshot_format_v1.ts` S-2b already freezes `splitKey` specifically so a later PSL update can't retroactively move a snapshot.

Corpus splitting already has its immutability answer (freeze `splitKey`). The rule engine's use of PSL for `sameSite` doesn't yet have an equivalent record of *which* PSL version a rule set's registrable-domain comparisons were authored/validated against — which matters for `G-10` replay determinism later (a PSL update could shift an eTLD+1 boundary and change a `sameSite` outcome under otherwise-identical evidence).

**Recommendation:** Add `pslVersion` to `RuleSet` (D0.3), not to `Snapshot`/`Evidence` — the snapshot side already has its own frozen mechanism (`splitKey`). This is Annex A-6.

**Decision:** ☐ Approved — `pslVersion` added to `RuleSet`
**Signed by:** _______________ **Date:** _______________

---

## DEC-9 — `B1.5` (property test) ownership — deliberately open

Per the guide: not due now, due week 4. `Implementation-Ownership-Plan.md` §3 currently assigns `B1.5` to Jayanth (property tests, depends on `B1.2`/`B1.3`). Leave open; revisit at week 4.

---

## Corpus rollup (fill in after Step 0)

Per Step 7's later check, record here once `spec/` is populated:

```
cd spec && for f in $(ls -1 | sort); do echo "$f"; md5sum "$f" | cut -d' ' -f1; done | md5sum
```

**Rollup:** _______________
**File count:** _______________ (expect 46 — see the file-count note from our readiness check: this project's spec corpus has 46 clean spec files plus one extra, `GAP3_Reconstruction.pdf`, which appears to be a raw scan behind `GAP-3-Persistence-Reconstruction.md` rather than a distinct 47th spec file. Confirm this before computing the rollup, or the digest won't match anyone else's.)

---

## Sign-off

I have read, and either signed or explicitly amended, all eight decisions above.

**Name:** _______________ **Date:** _______________
