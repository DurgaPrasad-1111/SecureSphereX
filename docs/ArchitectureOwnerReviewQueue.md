# Architecture Owner Review Queue

Consolidated for Jayanth (Architecture Owner). Pulls the current, verbatim
text of every decision in `DECISIONS.md` that names an open architect
ruling, plus DEC-1 and DEC-3 for completeness — checked against the file
directly, not assumed. No new analysis beyond what `DECISIONS.md` already
records; this document routes, it does not decide.

Generated 2026-08-26. Regenerate by re-consolidating from `DECISIONS.md`
rather than hand-editing this file when items change status.

---

## ⚠️ Correction to this task's premise

This packet was requested on the premise that "DEC-1 and DEC-3 are already
open, awaiting Jayanth's (Architecture Owner) sign-off." Checked directly
against the current `DECISIONS.md`: **both are already signed.**

- **DEC-1** — `Decision: ☑ External store... Signed by: Jayanth
  (Architecture Owner)  Date: 2026-08-21` (`DECISIONS.md` line 70-71).
- **DEC-3** — `Decision: ☑ Approved... Signed by: Jayanth (Architecture
  Owner)  Date: 2026-08-21` (`DECISIONS.md` line 137-139).

Likely source of the mismatch: `DECISIONS.md`'s own top-of-file banner
still reads **"Status: Revision 1 — awaiting Architecture Owner
signature"** (line 3), which is stale relative to the individual entries
below it — every decision from DEC-1 through DEC-14 that has actually
been signed shows its own `☑ ... Signed by: Jayanth ... Date:` line, but
the document-level banner was never updated to reflect that. This exact
discrepancy was flagged once already, in an earlier audit of this repo.

Both are included below, verbatim, for completeness per instruction —
**not** as open items requiring action.

---

## OPEN — requires a ruling

### DEC-15 — Stage 1 orchestration envelope (4 of 5 fields remain open)

**How long open:** since 2026-08-26 (opened and amended the same day).

**What's being decided:** `SecurityEvaluation<M>`'s `moduleVersion`,
`indicators`, `consistency`, and `summary` fields have no documented
generation scheme anywhere in the 46-file `spec/` corpus or the Logical
Database Design Specification. (`evaluationId`, originally part of the
same open question, was resolved 2026-08-26 — see below — and is no
longer open.)

**Current recommendation, per field** (full reasoning in `DECISIONS.md`
DEC-15's 2026-08-26 amendment):

| Field | Recommendation | Confidence |
|---|---|---|
| `moduleVersion` | Two live options: (a) shared engine package version (simplest, already exists) or (b) a genuine per-module version constant with a stated bump convention. Lean (a) if forced to choose. | Low — real design question, not a mechanical default |
| `indicators` | Ship `[]` as an explicitly-marked placeholder (the storage schema's own documented default for "nothing derived yet") until a per-module indicator registry is designed. Who owns authoring that registry is the open question. | N/A — placeholder sanctioned, derivation logic is what's open |
| `consistency` | No safe default exists. `indeterminate`-always is a candidate but is a substantive interpretive claim, not a neutral placeholder — needs explicit sign-off, not inference. | N/A — no default proposed |
| `summary` | No recommendation. No template or safe default found anywhere. Open question: who reads this (operator-facing debug aid vs. eventual end-user-facing text)? | N/A — no default proposed |

**What resolving it unblocks:** A complete, real `SecurityEvaluation<M>`
envelope — `packages/engine/orchestrator.ts`'s `assembleSecurityEvaluation`
currently throws `Stage1EnvelopeBlockedError` for every module rather than
fabricate these four fields. Per the same amendment, resolving it does
**not** unblock Stage 2 predicate matching by itself (see this session's
separate Stage 2 dependency-check finding, recorded alongside DEC-15 in
`DECISIONS.md`) — Stage 2 predicate evaluation is a distinct blocker with
its own dependency check.

**Verbatim source:** `DECISIONS.md`, `## DEC-15` through its 2026-08-26
amendment (now followed by DEC-16 and DEC-17, below — formalized out of
that amendment's Stage 4 addendum, not part of DEC-15 itself).

---

### DEC-16 — A-01 / User-Trusted Origin evidence gap

**How long open:** since `rules-v0.1.0`'s authoring (Step 11) — the gap
was recorded in the rule set's own `changeLog` at that time, not
discovered when this entry was written (2026-08-26). No more precise
calendar date for Step 11 is recorded anywhere in the corpus.

**What's being decided:** A-01 (§6.4, User-Trusted Origin) has **zero**
guards in `rulesets/rules-v0.1.0.json` — it does not exist in the
`suppressions` array at all (only S-01 and S-02 are present). The rule
set's own `changeLog` explains why, verbatim: no evidence category
anywhere represents "a per-origin explicit user trust action"; the
frozen `trust_validity_days` `ParameterId` (§13.2) has nowhere for its
underlying guard data to live; shipping A-01 with `guards: []` would
silently violate §6.1's "no unguarded suppression" invariant, so it was
correctly omitted rather than shipped broken.

**Current recommendation:** None — genuinely two open paths, not one
obvious answer, exactly as the rule set's own text frames it: (a) an
evidence-contract amendment adding the missing evidence category, or (b)
confirmation that user-trust suppression is handled entirely outside the
rule-set predicate mechanism (a different architectural layer, never a
Stage 4 `SuppressionDefinition`).

**What resolving it unblocks:** A-01 becoming addable to a future
rule-set version. Its five target rules (CRED-01, CRED-04, CRED-07,
PM-01, DL-01) currently get no user-trust-based reduction at all — a
complete absence, not a partial one (contrast DEC-17/S-01, which is
present but narrowed).

**Verbatim source:** `DECISIONS.md`, `## DEC-16`.

---

### DEC-17 — S-01 guard narrowing (missing drift-tolerance condition)

**How long open:** since `rules-v0.1.0`'s authoring (Step 11, commit
`fd61b76`) — S-01's own `rationale` field was written at that time,
flagging this for review then, not discovered today. Bounded between
DEC-3/DEC-8's 2026-08-21 signing and DEFECT-15's 2026-08-24
investigation (which already cites this as an established past fact); no
more precise date is recorded.

**What's being decided:** S-01 (§6.2, Prior Authentication) **is live
and shipping today**, but self-narrowed. §6.2 specifies three guard
conditions (`origin_present=true`, `lifecycleState=ESTABLISHED`, **and**
fingerprint drift within tolerance); the live rule set's S-01 encodes
only the first two. Its own `rationale` field states why, verbatim: "No
ParameterId exists for a drift-tolerance threshold... This guard checks
only origin_present and lifecycleState=ESTABLISHED, treating
drift-within-tolerance as already folded into the module's own
ESTABLISHED determination... This is a real narrowing of §6.2's literal
three-condition wording, not a full implementation of it."

**Current recommendation:** None — should a drift-tolerance
`ParameterId` be added (closing the gap to match §6.2 literally), or is
the current narrowing an accepted, permanent interpretation? Both are
defensible; the rule set's own rationale deliberately flagged this for
review rather than picking one.

**What resolving it unblocks:** Nothing functionally today — S-01
validates cleanly and Stage 4 could scaffold against it as-is. This is a
spec-vs-implementation gap, not a functional blocker: **anyone relying
on S-01 today (CRED-02 nullification, CRED-01/CRED-04 halving) is
relying on the narrowed two-condition version**, which is worth Jayanth
knowing even though nothing is currently broken by it.

**Verbatim source:** `DECISIONS.md`, `## DEC-17`.

---

### DEC-18 — `blockedBy` has no domain-scoping mechanism

**How long open:** found while implementing Stage 4
(`packages/engine/stage4.ts`, 2026-08-26) — not a dedicated dependency-
check finding this time, but a real implementation-time discovery,
formalized here the same day it was found.

**What's being decided:** §6.3 (S-02) requires "CRED-03 has not fired
**against the action domain**" — a domain-scoped negative guard. The
actual type, `SuppressionDefinition.blockedBy: readonly RuleId[]`, is
bare rule IDs with no domain-scoping mechanism, and `CorrelationFinding`
carries no domain field at all. Implemented as the coarser, type-
supported check — did the named rule fire at all this pass — matching
`ruleset.format.v1.ts`'s own simpler doc-comment framing, not a stricter
interpretation the types don't support.

**Current recommendation:** None — genuinely open, the same way DEC-16
is for A-01. Two shapes present themselves (a domain field on
`CorrelationFinding`, or a richer `blockedBy` entry shape pairing a rule
ID with a domain-bearing `FindingPath`), but which is right, or whether
the coarser check is an accepted permanent narrowing instead, is not
decided here.

**What resolving it unblocks:** Nothing observably today — confirmed
against the real fixture pipeline, the one live case (S-02's
`blockedBy: ['CRED-03']`, exercised by `off-origin-post`) happens to give
the same answer under either the coarse or domain-scoped check, since
only one domain is in play in that fixture. **This affects S-02
specifically and is shipped/live today**, same framing as DEC-17 —
worth knowing even though nothing is currently observed to be wrong.
Becomes relevant the moment a real pass has CRED-03 firing on a
different domain than the one S-02 is evaluating.

**Verbatim source:** `DECISIONS.md`, `## DEC-18`.

---

### DEC-12 — Sanctioned constructors for the five brands

**How long open:** no explicit open-date recorded in `DECISIONS.md`.
Contextually tied to Step 8 (fixture authoring) — the same working
session as DEC-3's 2026-08-21 signing, per its own text ("fixtures do
this today (Step 8, commit 6060d63)").

**What's being decided:** `AnalysisSessionId`, `TargetResourceId`,
`PassResultId`, `FindingId`, and `DayStamp` were branded as TYPES ONLY by
DEC-3's Annex A-3/A-4 — no sanctioned constructor exists for any of the
five (unlike `Origin`, which has `toOrigin()`). They currently enter the
type system via unvalidated `as` cast at every boundary.

**Current recommendation:** None recorded — `DECISIONS.md` poses the
question without a stated lean: do the five brands get parse-validated
constructors modelled on `toOrigin()` (all five, or only the ones with an
enforceable format, e.g. `DayStamp` vs. opaque IDs), or is `as`-cast at
boundaries deliberately accepted with validation deferred to producer-side
testing?

**What resolving it unblocks:** Nothing today (`DECISIONS.md`: "Blocks
nothing today — the current `as`-cast pattern compiles and Step 8 is
closed against it"). Becomes relevant when the capture pipeline ingests
external data, the engine reads corpus payloads, or any producer of these
values runs outside a fixture.

**Verbatim source:** `DECISIONS.md`, `## DEC-12` (lines 379-417).

---

### DEC-13 — Cross-environment corpus payload access mechanism

**How long open:** since at least 2026-08-22 (its own text: "surfaced
concretely on 2026-08-22 during DEFECT-6's verification").

**What's being decided:** DEC-1 named "on disk (and/or an external
store)" as corpus payload's home but never specified a mechanism —
no endpoint, bucket, mount path, or credential scheme is recorded
anywhere. Is cross-environment access to real payload ever needed, and if
so by what mechanism — or is "payload lives only on the capture machine,
`INDEX.jsonl` is the portable record" the permanent intended shape?

**Current recommendation:** None recorded — `DECISIONS.md` states the
question without a stated lean.

**What resolving it unblocks:** Nothing today (current practice is fully
sufficient and matches DEC-1 as written). Becomes relevant if CI or any
automated process needs to validate against real payload, someone other
than Durga needs read access, or Durga's machine becomes unavailable.

**Verbatim source:** `DECISIONS.md`, `## DEC-13` (lines 421-434).

---

### DEFECT-11 — 456 orphaned `corpus/INDEX.jsonl` entries

**How long open:** since 2026-08-22 (its own header: "found 2026-08-22").

**What's being decided:** 456 `INDEX.jsonl` entries dated before
2026-08-22 have no corresponding payload file on disk — a genuine
payload-write gap in whatever produced index entries before that date's
dependency fix, not a fetch-failure artifact (confirmed: the
`fetchOutcome` breakdown is proportionally identical between the missing
and present sets). Purge the 456 orphaned entries, or retain them as an
explicit "known lost/never-written" record?

**Current recommendation:** None recorded — `docs/DEFECTS.md` states
"Decision needed" without a stated lean. Owner recorded as "TBD — capture
pipeline / corpus reconciliation," not yet assigned to a person.

**What resolving it unblocks:** Nothing today (does not affect DEFECT-6's
resolution, which reads `corpus/` files directly, never `INDEX.jsonl`).
Affects anything that trusts `INDEX.jsonl` as ground truth without
cross-checking real files — Step 13's `--report` flag, future metrics
harness work.

**Verbatim source:** `docs/DEFECTS.md`, `## DEFECT-11` (lines 308-333).

---

### DEFECT-19 — `RedirectFindings` ungroundable domain fields (CRED-04 dead, PM-01 degraded)

**How long open:** since 2026-08-26 (found and logged this session).

**What's being decided:** `RedirectEvidence` has no registrable-domain
fields, only raw URL strings — `RedirectFindings.initialRegistrableDomain`
and `.finalRegistrableDomain` are reported unconditionally `null`.
Confirmed directly against `rulesets/rules-v0.1.0.json`: **CRED-04 is
structurally unable to fire** (its `notSameSite` conjunct can never
match), and **PM-01 is degraded** to its page-age arm only. Two live
fix paths: an evidence-contract amendment adding registrable-domain (or
same-site-boolean) fields to `RedirectEvidence`, or Stage 1 producer-side
extraction computing them before evidence reaches the module.

**Current recommendation:** None recorded — `docs/DEFECTS.md` presents
both paths without a stated lean, explicitly deferring to "the same
Architecture Owner ruling" DEC-14 used for the analogous CRED-05/CRED-A1
gap.

**What resolving it unblocks:** CRED-04 (currently non-functional) and
full PM-01 functionality (currently degraded to one arm).

**Verbatim source:** `docs/DEFECTS.md`, `## DEFECT-19` (lines 721-805).

---

### DEFECT-20 — `PermissionContextFindings.requestingRegistrableDomain` ungroundable (not currently load-bearing)

**How long open:** since 2026-08-26 (found and logged this session).

**What's being decided:** Same shape of gap as DEFECT-19 —
`PermissionContextEvidence.requestingOrigin` is a raw origin string, no
registrable-domain field exists to ground
`PermissionContextFindings.requestingRegistrableDomain`. **Unlike
DEFECT-19, confirmed by grep that no live rule reads this field** — lower
priority.

**Current recommendation:** None recorded.

**What resolving it unblocks:** Nothing today — recorded for completeness
and in case a future rule version starts reading it.

**Verbatim source:** `docs/DEFECTS.md`, `## DEFECT-20` (lines 809-828).

---

### Ruleset filename/version mismatch (not a DEC or DEFECT entry — flagged separately)

**How long open:** mismatch created 2026-08-25 (`docs/DEFECTS.md`
DEFECT-15's resolution commit `5dc4c4885bb338613054a71500b112317cddf143`
bumped the internal `ruleSetVersion` from `rules-v0.1.0` to
`rules-v0.2.0`, authorized by Jayanth as Architecture Owner, without
renaming the file); first flagged as a naming inconsistency 2026-08-26.

**What's being decided:** `rulesets/rules-v0.1.0.json`'s filename still
reads `v0.1.0`; its own `ruleSetVersion` field reads `"rules-v0.2.0"`.
Two scripts (`tools/ci/compute-ruleset-digest.mjs`,
`tools/ci/validate-ruleset.py`) default-path to the `v0.1.0` filename.
Everything currently works because nothing enforces filename↔content
agreement, not because the mismatch is resolved.

**Current recommendation:** None offered — this has been explicitly
reserved by standing instruction across multiple prior sessions ("Do not
rename `rulesets/rules-v0.1.0.json` or touch its version field... leave
the fix to me"), not attempted here either, in compliance with that
standing instruction.

**What resolving it unblocks:** Nothing functionally today (both
scripts' defaults still resolve correctly since the file hasn't moved) —
this is a hygiene/consistency question, not a functional blocker.

**Verbatim source:** `rulesets/rules-v0.1.0.json` line 3
(`"ruleSetVersion": "rules-v0.2.0"`) vs. the file's own name; not
recorded as a numbered DEC or DEFECT entry anywhere in `DECISIONS.md` or
`docs/DEFECTS.md`.

---

## ALREADY RESOLVED — included for completeness only

### DEC-1 — Corpus storage: external object store vs. Git-LFS

**Status:** ☑ Signed by Jayanth (Architecture Owner), 2026-08-21.

**Verbatim conclusion:** "External object store. The captured corpus
never enters git — not the repository, not Git-LFS. Payload lives on disk
(and/or an external store) outside version control. A committed
`INDEX.jsonl` records provenance for every snapshot... Snapshots are
gzip-compressed at capture. `.gitignore` names `corpus/**` with an
exception for `corpus/INDEX.jsonl`."

**Verbatim source:** `DECISIONS.md`, `## DEC-1` (lines 45-74).

### DEC-3 — Five contract amendments (Annex A-1 … A-5)

**Status:** ☑ Signed by Jayanth (Architecture Owner), 2026-08-21.

**Verbatim conclusion:** "Approve all five. Direction is sound and
low-risk; the only real failure mode is *incomplete application*,
addressed by the staged Step 6 procedure (A-3 fully before A-4, since A-3
shifts A-4's line positions; verify by field name, not line number). This
decision gates Step 6 and therefore Steps 7, 8, and 11."

**Verbatim source:** `DECISIONS.md`, `## DEC-3` (lines 100-142).

---

## Queue summary

| Item | Status | Open since | Blocks |
|---|---|---|---|
| DEC-1 | ☑ Resolved | — | nothing (already resolved) |
| DEC-3 | ☑ Resolved | — | nothing (already resolved) |
| DEC-15 (`moduleVersion`, `indicators`, `consistency`, `summary`) | 🚧 Open | 2026-08-26 | A complete Stage 1 envelope; does not by itself block Stage 2 (see DEC-15 amendment) |
| DEC-16 (A-01 evidence gap, zero guards) | 🚧 Open | ~Step 11 authoring | A-01 addable to a future rule-set version; 5 target rules get zero user-trust reduction today |
| DEC-17 (S-01 guard narrowing, live+shipped) | 🚧 Open | ~Step 11 authoring | Nothing functionally — spec-vs-implementation gap in a rule already live and relied upon |
| DEC-18 (`blockedBy` no domain-scoping, S-02 live) | 🚧 Open | 2026-08-26 (found during Stage 4 build) | Nothing observably today; a future domain-divergent CRED-03/S-02 case |
| DEC-12 (brand constructors) | 🚧 Open | ~2026-08-21 (Step 8) | Nothing today; relevant when the engine ingests corpus payloads or capture ingests external data |
| DEC-13 (cross-environment payload access) | 🚧 Open | 2026-08-22 | Nothing today; relevant if CI/a teammate/disaster recovery ever needs real payload |
| DEFECT-11 (456 orphaned index entries) | 🚧 Open | 2026-08-22 | `INDEX.jsonl`-trusting tooling (Step 13 `--report`, future metrics harness) |
| DEFECT-19 (redirect domain fields) | 🚧 Open | 2026-08-26 | CRED-04 (dead), PM-01 (degraded to one arm) |
| DEFECT-20 (permissionContext domain field) | 🚧 Open, low priority | 2026-08-26 | Nothing today — no live rule reads it |
| Ruleset filename/version mismatch | 🚧 Open, reserved | 2026-08-25 | Nothing functionally today — hygiene/consistency only |

This table is regenerated whenever an item resolves or a new one folds
in — see `DECISIONS.md` and `docs/DEFECTS.md` for the authoritative,
timestamped record behind every row.
