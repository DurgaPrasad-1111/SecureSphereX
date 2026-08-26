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

**Verbatim source:** `DECISIONS.md`, `## DEC-15` through the end of the
file (currently the last entry).

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
| DEC-12 (brand constructors) | 🚧 Open | ~2026-08-21 (Step 8) | Nothing today; relevant when the engine ingests corpus payloads or capture ingests external data |
| DEC-13 (cross-environment payload access) | 🚧 Open | 2026-08-22 | Nothing today; relevant if CI/a teammate/disaster recovery ever needs real payload |
| DEFECT-11 (456 orphaned index entries) | 🚧 Open | 2026-08-22 | `INDEX.jsonl`-trusting tooling (Step 13 `--report`, future metrics harness) |
| DEFECT-19 (redirect domain fields) | 🚧 Open | 2026-08-26 | CRED-04 (dead), PM-01 (degraded to one arm) |
| DEFECT-20 (permissionContext domain field) | 🚧 Open, low priority | 2026-08-26 | Nothing today — no live rule reads it |
| Ruleset filename/version mismatch | 🚧 Open, reserved | 2026-08-25 | Nothing functionally today — hygiene/consistency only |

This table is regenerated whenever an item resolves or a new one folds
in — see `DECISIONS.md` and `docs/DEFECTS.md` for the authoritative,
timestamped record behind every row.
