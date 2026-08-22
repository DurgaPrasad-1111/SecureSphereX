# Defect register

Recorded from Steps 0–5 verification. Each entry states the evidence, the
owning step, and — where applicable — what it blocks. This is a record, not a
fix list: nothing here is resolved by editing around it silently.

---

## DEFECT-1 — CI gate G-1 verifies nothing

`ci.yml` line 37 runs `npx tsc --noEmit` at the repo root. Root
`tsconfig.json` is solution-style (`"files": []`, `references` only), so a
bare `tsc --noEmit` at root compiles **zero files** and exits 0 regardless of
any error in `packages/contracts`. Confirmed directly: `npm run typecheck`
(`tsc -b`) walks the reference and performs a real check; `npx tsc --noEmit`
at the same root, same tree, prints nothing and exits 0 whether or not the
first command finds anything.

Gate G-1 is labelled "contract integrity, strict." As wired, it verifies
nothing.

- **Owner:** Step 12 (CI wiring)
- **Blocks:** DEC-4
- **Recommended:** G-1 should invoke `npm run typecheck`, not bare
  `tsc --noEmit`.
- **Do NOT** edit root `tsconfig.json` to work around this — the fix belongs
  in `ci.yml`, at Step 12, not in the tsconfig shape.
- **Status:** RESOLVED (DEC-4, working CI). Working `.github/workflows/ci.yml`
  runs `npm run typecheck` (`tsc -b`, proven live) instead of the vacuous
  `npx tsc --noEmit`. `spec/ci.yml` unchanged — divergence is the correct
  governance shape for frozen artifacts. The same commit also adds a `G-11`
  step, per DEC-4's naming ruling, running `contract-conformance-check.py`
  in CI — an independent piece of DEC-4 implementation, not the closure of
  a separately-numbered audit finding.

---

## DEFECT-2 — Both decisions documents record a wrong spec/ rollup

Rev 1 of the decisions document records `f9b45d15…`. Rev 2 records
`0c812940…`. Neither matches a rollup actually computed from the files in
this repo's `spec/` directory, and neither was computed from the build
machine that holds the real corpus.

**Value of record:** `3b105afb9abd8c22efca0fa150ec7cba` — computed directly
from this tree's 46 `spec/` files, and cross-checked against `MANIFEST.md`'s
Ruling R13 table (the five frozen `d0_*_schema.json` SHA-256 digests), which
matched exactly.

- **Owner:** Step 1, before signature. Whoever signs off on Step 1 needs the
  correct rollup, not either recorded value.

---

## DEFECT-3 — Guide draft divergence

Five copies of `How-To-Start-Coding.md` exist in `Downloads/`, across two
revisions. The pre-Rev-3 draft (533 lines) numbers this pipeline's
capability-spike step as Step 9; the canonical Rev 3 (828 lines, md5
`716695118ea238c858f697a8a57e68ab`) numbers it Step 10 — every step number
from there on differs by one between the two drafts.

The decisions document was written against the 533-line draft: its internal
step cross-references (e.g. "Step 6 Annex A-1…A-5", "createSession at line
210") use the older numbering.

- **Owner:** Step 1.
- **Resolved for the repo** by committing the canonical Rev 3 copy to
  `docs/How-To-Start-Coding.md` (this run's Phase 1). The Downloads copies
  themselves remain unresolved — anyone opening one of the wrong five still
  works the wrong step numbering.

---

## DEFECT-4 — Hook Bash coverage is a heuristic tripwire, not a boundary

`.claude/hooks/block-frozen.mjs` intercepts Bash commands that redirect into,
or run `rm`/`mv`/`cp`/`tee`/`truncate`/`install`/`sed -i`/`dd of=` against, a
frozen path. It pattern-matches the command string; it does not parse or
sandbox the shell. A write via `python -c "..."`, a here-doc, `osascript`, or
any tool outside the matched command set is not intercepted.

- **Owner:** accepted risk, recorded not fixed. The mitigation already in
  place is that `spec/` and `packages/contracts/` are committed to git — any
  change made by any means still shows up in `git status`/`git diff` against
  a known-good baseline, so the hook's job is to catch the common case
  quickly, not to be the only line of defense.

---

## DEFECT-6 — `migrate_split_v2.py --dry-run`'s S-2a check is currently unfalsifiable

Run against a 25-snapshot corpus where every snapshot was already captured at
`split-v2` (no split-v1 legacy data to migrate): `--dry-run` reports 25
snapshots, 0 reassigned, 0 unchanged, 25 already-v2 — correct so far — but
then reports **0 domains** in the domain-level distribution, and "S-2a
straddling domains: 0 (must be 0)" passes.

The domain-tracking code (`domains_by_split`, `snapshots_per_domain`) is only
populated inside the branch that handles snapshots needing reassignment; the
`already_v2` branch `continue`s before reaching it. When every snapshot is
already `split-v2` — which will be true for this entire corpus going
forward, since `capture.py` assigns `split-v2` at capture time — the domain
count is 0 by construction, not because there are genuinely 0 domains.

A check over zero domains passes vacuously. §13.3 requires confidence
intervals reported against the domain count specifically because domains
carry unequal snapshot counts; an audit that silently reports 0 domains
gives no such basis. This is the same failure shape DEC-1 already flagged
for the gzip globs: a broken check that presents as success.

- **Owner:** Step 13.
- **Do not tick C0.6** ("the S-2a audit passes") until the domain count
  itself is non-zero and verified — the audit passing with 0 domains is not
  evidence C0.6's check is meaningful, it's evidence the check hasn't been
  exercised on real reassignment data yet.
- **Status:** FIXED, pending real-data verification. The `already_v2` branch
  now populates `domains_by_split` and `snapshots_per_domain`, keyed on the
  snapshot's stored `splitKey` (never re-derived — S-2b treats `splitKey` as
  immutable once assigned); a `split-v2` snapshot missing `splitKey` raises
  rather than being silently skipped. Correctness of this logic is confirmed
  via an isolated synthetic seeded-violation test (scratch directory outside
  the repo, synthetic schema-valid snapshots, one deliberate straddling
  violation): the pre-fix script reproduces the defect exactly (0 domains,
  `S-2a straddling domains: 0`, exit 0, despite the seeded violation); the
  patched script reports the correct non-zero domain count, flags the seeded
  domain under `FAIL`, and exits 1. The fix has **not** been verified
  against real captured corpus payload — no real payload is reachable from
  this environment (`corpus/` here holds only `INDEX.jsonl`; payload lives
  outside git per DEC-1, and no object-store endpoint or credentials exist
  in this environment to reach it). Real-data verification remains an open
  follow-up, to run whenever real `corpus/` payload becomes accessible here,
  or when Durga runs the same protocol independently on her own machine.

---

## DEFECT-8 (historical, mitigated by design) — jq/PATH fail-open in an earlier hook implementation

An earlier `.sh` implementation of the frozen-file hook resolved `jq` via
`PATH` and errored **before** checking the target path when `jq` was
unresolved — failing **open** (the edit proceeded uncaught). Root cause: the
Claude Code process's inherited `PATH` predated the `jq` install.

The current `.mjs`/Node hook is immune by construction — no shell, no `jq`,
no `PATH` lookup for a required external binary.

- **Owner:** none — historical, no action needed against the current hook.
- **Why recorded anyway:** it documents a silent-fail-open class for
  frozen-file hooks generally — a required external dependency resolved via
  an assumption about the calling environment's `PATH`, erroring closed on
  the *check itself* rather than on the *edit it was supposed to gate*, and
  thereby failing open. Relevant to DEFECT-4 (Bash coverage is a heuristic
  tripwire, not a boundary) as a second, independent way a frozen-file guard
  can silently stop working.
- **Source:** `origin/main:1b92d08`, pre-session history — a superseded
  parallel lineage, preserved here before the remote is overwritten.

---

## DEFECT-5 — Phantom module-authority document (identified and resolved 2026-08-21)

Finding: RuleEngine-Spec-v0_8.md cites an external "ECE Internal Module
Specifications" (lines 27, 195) not present in the 46-file corpus; the register
notes that document is itself already incomplete.

Impact: appeared to leave the module interface without an authority document,
blocking Step 15.

Resolution: RESOLVED (DEC-11). Module register is in §2.6 (closed at ten modules);
interface signature is in evaluation.contract.v1.ts. Modules 1–7 detail is supplied
by typed findings rather than prose — a recorded narrowing. No reconstruction
attempted; external doc deferred to Phase II.

- **Owner:** Architecture Owner.
- **Status:** RESOLVED.

---

## DEFECT-7 — Snapshot-identity collision (found and fixed 2026-08-21; recorded
retrospectively — documents an already-committed fix)

Finding: snapshot_id_for keyed identity on (url, day, attempt=1). A same-day
re-capture produced a colliding snapshotId, overwriting the prior snapshot file
while appending a duplicate INDEX.jsonl line — violating S-1 immutability.

Resolution: FIXED. Identity re-keyed on a full-precision UTC timestamp; capturedOn
kept day-granular (§20.3); attemptOrdinal left for genuine fetch retries; persist()
raises on any path collision; INDEX.jsonl rebuilt from on-disk truth. Commits
fa7694a, 69ec038, cf0210b (verified present, touching the capture pipeline).

- **Owner:** capture pipeline.
- **Status:** FIXED.

---

## DEFECT-9 — Partial typecheck coverage (identified 2026-08-21; latent)

Finding: root tsconfig.json references only packages/contracts. packages/engine,
apps/extension, apps/harness exist but have no tsconfig.json and are absent from
the references array, so `tsc -b` never type-checks them — the vacuous-gate failure
CLAUDE.md warns of, same class as DEFECT-1.

Impact: currently none — those packages have no consumers of the contracts yet
(verified by grep). Becomes active when Step 8/11/15 writes contract-consuming code
there.

Resolution: track now, fix at Step 12 — wire each package's tsconfig.json + root
references so the typecheck gate is total.

- **Owner:** Step 12.
- **Status:** OPEN (latent).

---

## DEC-12 candidate (Step 8 finding)

Five branded types have no sanctioned constructor; values enter via
unvalidated `as` cast at every boundary. Documented as DEC-12 (candidate,
open) in DECISIONS.md. Not a defect — a deliberate deferral of a decision
the corpus does not force. Revisit before the capture pipeline or engine
ingests untrusted string input.

---

## Working vs. `spec/` divergences (DEC-4, Step 12)

`spec/ci.yml` is the frozen audit baseline and is never edited. Applying
DEC-4 required a working CI configuration that differs from it in specific,
authorized ways. Recorded here per governance discipline for frozen
artifacts: every divergence from a frozen baseline is enumerated, not
silently introduced.

`.github/workflows/ci.yml` is that working configuration — a new file,
derived from `spec/ci.yml`. A header comment on the file itself records this
provenance and states that `spec/ci.yml` is not edited. Every job, trigger,
and step not listed below is copied verbatim.

1. **G-1 typecheck fix (DEFECT-1).** `run: npx tsc --noEmit` →
   `run: npm run typecheck`. The step name is unchanged
   (`'G-1  Typecheck (strict)'`). Rationale: `npx tsc --noEmit` at repo root
   compiles zero files against the solution-style root `tsconfig.json` and
   passes vacuously regardless of any contract error; `npm run typecheck`
   (`tsc -b`) walks the project references and performs a real check.

2. **G-11 conformance-check step added (DEC-4).** A new step,
   `'G-11  Contract ↔ LDD conformance'`, running
   `python3 spec/contract-conformance-check.py`, inserted immediately after
   the existing `G-8` step. This is an addition, not a rename: `spec/ci.yml`
   contains zero references to `contract-conformance`, `d0_`, or
   `schema.json` (confirmed by grep) — the check was never wired into CI.
   Per DEC-4, `G-8` in `ci.yml` correctly remains the name of the rule-set
   static validator and is **not** touched; `G-11` is the identity DEC-4
   assigns to `contract-conformance-check.py`'s CI step. Sanity-run locally
   before wiring: `python3 spec/contract-conformance-check.py` exits 0,
   `RESULT: CONFORMANT`, against the current corpus.

**Follow-up, not implemented now.** `G-8` (rule-set static validator,
V-1…V-13) has no runner in the working `ci.yml` yet — the existing step
still guards on `if: hashFiles('rulesets/*.json') != ''`, which is false
until Step 11 or later produces a rule set. Its absence of effect is
intentional at this stage, not an oversight; no action needed until a rule
set exists to validate.
