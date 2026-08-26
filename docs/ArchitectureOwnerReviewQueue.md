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

This table is regenerated whenever an item resolves or a new one folds
in — see `DECISIONS.md` for the authoritative, timestamped record behind
every row.
