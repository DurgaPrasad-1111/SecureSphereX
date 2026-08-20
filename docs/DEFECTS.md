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
