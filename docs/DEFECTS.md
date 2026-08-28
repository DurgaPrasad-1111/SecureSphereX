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

- **Owner:** Step 13 — closed via real-data verification on Durga's machine.
- **C0.6 can now be ticked** — the domain count is non-zero and verified
  against 337 real captured snapshots (2026-08-22).
- **Status:** RESOLVED. The `already_v2` branch
  now populates `domains_by_split` and `snapshots_per_domain`, keyed on the
  snapshot's stored `splitKey` (never re-derived — S-2b treats `splitKey` as
  immutable once assigned); a `split-v2` snapshot missing `splitKey` raises
  rather than being silently skipped. Correctness of this logic is confirmed
  via an isolated synthetic seeded-violation test (scratch directory outside
  the repo, synthetic schema-valid snapshots, one deliberate straddling
  violation): the pre-fix script reproduces the defect exactly (0 domains,
  `S-2a straddling domains: 0`, exit 0, despite the seeded violation); the
  patched script reports the correct non-zero domain count, flags the seeded
  domain under `FAIL`, and exits 1. At the time of the code fix, this could
  not be verified against real captured corpus payload — no real payload
  was reachable from that environment.
  Real-data verification completed 2026-08-22: --dry-run against 337 real
  captured snapshots (all already split-v2, exercising the exact fixed code
  path) shows 282 real domains tracked (non-zero, confirming domain-tracking
  is genuinely active, not vacuous) and S-2a straddling domains: 0 — a
  meaningful pass, since this same check logic was already proven capable of
  failing on seeded violations earlier. All three original verification gaps
  (synthetic straddling test, both missing-splitKey variants, real-data
  dry-run) are now closed.

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
Confirmed against real captured data 2026-08-22: independent duplicate-key check
across 793 real INDEX.jsonl entries (Counter-based, keyed on snapshotId) found
zero collisions.

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

---

## DEFECT-10 — G-11 validated the frozen pre-amendment contracts, not the amended ones (found 2026-08-22; reconciled clean)

Finding: commit abb9286 ("Step 12: apply DEC-4 to working CI configuration")
wired gate G-11 to run `spec/contract-conformance-check.py` directly.
That script's *.ts glob is BASE-anchored to its own file's directory (E-21's
fix) — correct in isolation, but since the only copy of the script lived in
spec/, BASE resolved to spec/, and spec/ also holds the six FROZEN ORIGINAL
contract .ts files (pre-DEC-3-amendment: unbranded IDs/dates, no FetchRecord
discriminated union, no pslVersion). So G-11 was validating enum shapes
against contracts nothing in the actual codebase builds against — the
amended packages/contracts/ versions were never checked.

Impact: reconciled clean. Independently diffed all ten enum-bearing types
(ModuleId, EvidenceCategory, PassTrigger, ConsistencyAssessment,
UnevaluableReason, NotCollectedReason, CollectorKind, RedirectMechanism,
RiskTier, RuleType) between spec/*.ts and packages/contracts/*.ts — all ten
are set-identical. DEC-3's amendments (A-1…A-6) touched ID/date branding,
FetchRecord's shape, and pslVersion, none of which are simple string-literal
union types this check inspects, so no divergence was actually hiding
behind the gap. The risk was real even though nothing was currently wrong:
a future amendment touching one of these ten types would have gone
unchecked by G-11 silently.

Resolution: new working copy at tools/ci/contract-conformance-check.py,
scanning packages/contracts/*.ts instead. G-11 in .github/workflows/ci.yml
repointed to it. spec/contract-conformance-check.py is untouched (frozen);
its own scope (E-21) is unaffected by this — the bug was in what G-11 ran
against, not in spec/'s copy itself. Verified the new check can actually
detect drift: seeded a mismatch (skr.risk_tier: high→severe), confirmed
NON-CONFORMANT/exit 1 with the exact mismatched values reported both
directions, reverted, confirmed CONFORMANT/exit 0 on real unmodified state.

- **Owner:** CI conformance tooling (G-11).
- **Status:** RESOLVED.

---

## DEFECT-11 — corpus/INDEX.jsonl carries pre-fix entries with no corresponding payload (found 2026-08-22)

Finding: reconciling corpus/INDEX.jsonl against real corpus/**/*.json.gz files on
disk shows 456 entries with no matching file anywhere — every one of them dated
capturedOn 2026-08-20 (333) or 2026-08-21 (123). Every entry dated capturedOn
2026-08-22 (315 and climbing, as capture is running live at time of writing) has
a real file on disk. The split is exact and clean: nothing from before today has
payload, everything captured today after today's dependency fix (httpx/playwright/
tldextract install) does. The missing set is not explained by fetch failures — its
fetchOutcome breakdown (success/http_error/dns_resolution_failed/timeout/etc.) is
proportionally the same as the present set's, including 242 "success" outcomes
with no file, so this isn't "failed fetches don't get files," it's a genuine
payload-write gap from whatever produced index entries before today.

Impact: does NOT affect DEFECT-6 (migrate_split_v2.py reads corpus/ files
directly, never INDEX.jsonl). DOES affect anything that trusts INDEX.jsonl as
ground truth without cross-checking real files — Step 13's --report flag, future
metrics harness work.

Not yet resolved — logged only. Decision needed: purge the 456 orphaned
pre-2026-08-22 entries, or retain them as an explicit "known lost/never-written"
record.

- **Owner:** TBD — capture pipeline / corpus reconciliation.
- **Status:** OPEN.

---

## DEFECT-12 — G-1's Lint sub-check has no eslint.config.js to run against (found 2026-08-23)

Finding: the frozen CI baseline specifies G-1 as two separate steps under one
"contract integrity" header — 'G-1 Typecheck (strict)' and 'G-1 Lint' — both
present from the start, unchanged since before Step 12. The working CI config
correctly carries both over. No eslint.config.js has ever been authored, so
the Lint step fails immediately (`npx eslint . --max-warnings=0` finds no
config) regardless of source content — every CI run has failed here since the
lockfile/typecheck fixes let earlier steps finally succeed.

Caught by checking the frozen baseline directly instead of trusting
Stage0-Completion-Pack.md's rollup table, which omits the Lint sub-step
entirely — the same "verify against the primary source, not the summary"
discipline that caught several other issues this session (DEFECT-6/7/11's
real-data reconciliation, A-3's targetFindingId over-match), not a one-off.

Impact: currently deferred via `if: hashFiles('eslint.config.js') != ''`
(matching G-8's existing not-yet-available pattern for rulesets/*.json), so
CI no longer fails on it — but this means G-1's Lint check has never actually
run, not once. It is a genuine, acknowledged gap, not scope creep correctly
pruned (that was an earlier misdiagnosis in this same change, corrected here).

Not yet resolved — logged only. A real minimal eslint.config.js (TypeScript-
aware, matching this project's actual tsconfig conventions — strict, no
unused locals — not maximally strict for its own sake, not an empty
pass-through) should be authored before Stage 0 is considered fully closed.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** OPEN.

---

## DEFECT-13 — tools/ci/architectural-gates.mjs has never existed (found 2026-08-23)

Finding: tools/ci/architectural-gates.mjs has never existed at any point in
this repo's history — `git log --all --follow` for this exact path returns
nothing. It is referenced unconditionally at two call sites in the frozen CI
baseline (lines 48, 109) and the working ci.yml (lines 59, 141) — inherited
faithfully from the baseline, not invented at Step 12 or later.

docs/How-To-Start-Coding.md:630-656 (Step 12) explicitly assigns this file to
Jayanth by name, to implement G-2 (no `as Origin`/`as unknown as Origin`
casts outside `toOrigin()`), G-3 (no browser globals in packages/engine), and
G-6 (nothing transmits Authentication History Store data). Step 12's CI-wiring
portion landed (commit abb9286, DEC-4), but this specific assigned deliverable
did not — a named, tracked gap, not an undiscovered one.

Impact: both call sites are unguarded — no hashFiles conditional, unlike G-1
(DEFECT-12) and G-8, which now have one. Every CI run fails here
unconditionally, with a module-not-found error rather than a graceful skip,
once earlier steps clear.

Caught via the same discipline that caught DEFECT-12 and, earlier this
session, the isSecureScheme/CRED-06 false premise — checking the frozen
source directly rather than trusting a prior claim, including this session's
own: the ci.yml comment this defect's fix corrects had itself claimed G-2 was
"already implemented separately... via architectural-gates.mjs," which was
untrue. The audit register's D-24b (spec/SecureSphereX-Audit-Report.md, not
normative but a real prior finding) documents the same defect shape in a
different check: a gate demonstrated to work in isolation but never actually
wired into CI, claimed as an operating control regardless.

Resolution: RESOLVED. tools/ci/architectural-gates.mjs written, implementing
G-2 and G-3 as real TypeScript-AST-based static checks (using the `typescript`
compiler API already a project dependency, not text/regex matching), and G-6
as an explicitly-labeled co-occurrence heuristic — see DEFECT-14 for why real
reachability analysis was not attempted and is tracked separately.

Verified against seeded violations, not just run clean once:
- G-2: a throwaway file with `raw as unknown as Origin` outside `toOrigin()`
  was NOT caught on the first attempt — a real bug, `__gatecheck__` had been
  put in the scanner's own directory-exclude list, which would have also
  silently defeated ci.yml's existing G-3 boundary-violation-check job (same
  directory convention). Fixed by removing that exclusion; re-run caught the
  seeded violation at the correct file:line, then passed clean after deletion.
- G-3: a throwaway file with the EXACT violation ci.yml's own
  boundary-violation-check job seeds (`(globalThis as any).window.location.href`)
  was also NOT caught on the first attempt — the scanner excluded
  property-name positions of member-access expressions to avoid flagging
  unrelated `.window` properties, which also excluded this exact evasive
  form. Fixed by removing that exclusion (over-flagging a hypothetical
  unrelated `.window` property is the correct tradeoff for a purity gate);
  re-run caught it, then passed clean after deletion.
- G-6: a throwaway file referencing `AuthStoreReader` and calling `fetch()`
  in the same file was correctly flagged as REVIEW (not FAIL — the heuristic
  does not fail the build by design), then passed clean after deletion.
- Real, current codebase: confirmed clean (G-2 OK, G-3 OK, G-6 OK) both
  before seeding and after cleanup, and again under a full clean-install
  (rm -rf node_modules && npm ci && npm run typecheck, both exit 0).

Both hashFiles guards added for this defect (gates job step, and the
boundary-violation-check job) removed — the script now genuinely exists.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** RESOLVED.

---

## DEFECT-14 — G-6's transmission audit is a co-occurrence heuristic, not reachability analysis (found 2026-08-23)

Finding: §20.2 of the rule engine spec requires G-6 to "assert that no code
path reachable from a network request constructor can read the store" — real
interprocedural call-graph reachability analysis. tools/ci/architectural-gates.mjs
does not implement this. It implements a weaker, explicitly-labeled heuristic:
flag any file that both references `AuthStoreReader`/`AuthStoreWriter` and
contains a network-call construct (`fetch(`, `XMLHttpRequest`, `axios`,
`http(s).request(`) in the same file, as a manual-review trigger — not a
proven violation, and it does not fail the build.

Why real reachability analysis was not attempted: it requires building an
actual call graph across packages/engine, resolving calls through interface
dispatch (`AuthStoreReader`/`AuthStoreWriter` are interfaces with no concrete
implementation yet — the store does not exist until week 4 per
How-To-Start-Coding.md), higher-order functions, and async chains, then
tracing dataflow from a network-constructor call site through that graph to
a store read. That is a multi-day static-analysis effort, and there is
currently no real call graph to trace against in the first place, since the
store-reading code the audit is meant to protect doesn't exist yet. Attempting
something that merely looks like reachability analysis tonight would have
produced a shallow AST walk dressed up as more rigorous than it is — the
exact "looks thorough, isn't" failure this session has spent all night
catching in other places.

Impact: G-6 currently provides no proof, in either direction, that §20.2
holds. It is honest about this (code comment, ci.yml comment, this entry) —
it is not silently presented as satisfying the gate.

Not yet resolved — logged only. Real reachability analysis for G-6 should be
built once the Authentication History Store has a concrete implementation to
trace against (week 4+), when there is an actual call graph to analyze rather
than interfaces alone.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** OPEN.

---

## DEFECT-15 — LoginFormFindings.pageRegistrableDomain is permanently null; makes four live rules' comparisons vacuous (found 2026-08-24)

Finding: `LoginInterfaceEvidence` (evidence.contract.v1.ts) carries exactly
three fields — `credentialFormPresent`, `forms`, `fingerprint` — none of
which represents the page's own URL or registrable domain. Per §2.6, the
Login Form Evaluation module consumes only its own evidence category
(`loginInterface`); it has no access to `UrlEvidence`, a different category,
and no other field within `loginInterface` supplies a page-domain value
either. There is no source anywhere in this module's input from which
`LoginFormFindings.pageRegistrableDomain` can be genuinely derived.

Implemented as: `pageRegistrableDomain` is unconditionally `null`
(`packages/engine/modules/loginForm.ts`, documented at the assignment and in
the module's header comment). The module otherwise stays evaluable —
`credentialFormPresent` and `forms` are both genuinely derivable and are not
withheld on account of this gap.

**This null must not be conflated with `UrlFindings.registrableDomain`'s
null.** That one is a confirmed-absent fact — an IP-literal URL genuinely
has no registrable domain, positively observed. This one is a structural
limitation of the `loginInterface` evidence category — the module was never
given anything to observe in the first place. Same value, opposite meaning,
depending on which module produced it.

**This is load-bearing, not a footnote — four live rules read
`loginForm.pageRegistrableDomain`** (confirmed directly against
`rulesets/rules-v0.1.0.json`, not assumed from the contract's inline
comments): **CRED-01**, **CRED-02**, **CRED-07**, and **CRED-A1**, each via a
`notSameSite` comparison against it. With the field permanently `null`,
every one of those comparisons is permanently vacuous — `notSameSite(x,
null)` can never meaningfully resolve the "is this off-site" question these
four rules depend on for their off-origin/injection-corroboration logic.
This silently narrows all four rules' actual detection surface versus what
§7.2 specifies, in a way no `V-` static check catches (V-2 confirms the path
*resolves*; it says nothing about whether the resolved value is ever
non-null).

Resolution does **not** belong in this module, which correctly cannot see
across evidence categories — narrowing its scope further to "fix" this would
violate §2.6 in the other direction. Two live paths were identified:
- A future evidence-contract amendment (a new DEC) adding a page-domain field
  to `LoginInterfaceEvidence`, mirroring how `UrlEvidence.registrableDomain`
  already works for the `url` category; or
- Stage 2/3 correlation reads `url`'s `registrableDomain` finding separately
  and joins it against `loginForm`'s output at the point a rule predicate
  actually needs both — analogous to how CRED-05/CRED-06 already read `url`
  fields alongside their own module's findings (DEFECT-16 names this as the
  general pattern; corrected 2026-08-25 from an earlier, wrong citation of
  DEFECT-10 here, which is unrelated).

**Resolution — 2026-08-25, commit `5dc4c4885bb338613054a71500b112317cddf143`.**
The second path was taken, authorized by Jayanth as Architecture Owner:
CRED-01, CRED-02, CRED-07, and CRED-A1's `notSameSite` right-hand operand
swapped from `loginForm.pageRegistrableDomain` to `url.registrableDomain`;
`url` added to each rule's `requiredModules`, appended at the position
matching that rule's existing first-appearance-order convention (verified
individually per rule against how the other nine rules order theirs, not
assumed). `ruleSetVersion` bumped `rules-v0.1.0` → `rules-v0.2.0` (MINOR per
§14.1 — predicate meaning changed, not merely a weight/threshold); each
affected rule's `lastModifiedIn` bumped to match; a new `changeLog` entry
records the change. Verified before commit: the literal string
`loginForm.pageRegistrableDomain` no longer appears anywhere in the file
(grep-confirmed); all four rules now read `url.registrableDomain`, alongside
CRED-05's pre-existing, untouched fifth occurrence; `npm run validate:ruleset`
still reports `CONFORMANT` across all thirteen checks, with rule/parameter/
refinementSet/suppression/subsumption counts unchanged (11/11/3/2/0).

The first path (an evidence-contract amendment) remains open as a longer-term
option — this resolution does not foreclose it, it just wasn't the one
authorized here.

- **Owner:** Jayanth (Architecture Owner) — authorized and directed this fix.
- **Status:** RESOLVED.

**Related, minor — contract-comment drift against the live rule set.**
Found while confirming which `loginForm.*` fields the rule set actually
consumes (same investigation as above), not blocking anything today, but
worth a permanent record since it's real drift between documentation and
behavior:
- `LoginFormFinding.hasAutocompleteDisabledCredential`
  (evaluation.contract.v1.ts) carries no rule-tag comment at all, but
  CRED-07's real predicate does read it (alongside
  `hasHiddenCredentialField`, which *is* tagged `// CRED-07`).
- `LoginFormFindings.credentialFormPresent` is commented `// CRED-01..07
  gate`, implying all seven CRED rules read it. The live rule set shows only
  five do — CRED-01, CRED-02, CRED-03, CRED-04, CRED-06. CRED-05 doesn't
  touch `loginForm` at all (it's gated by `javascript`/`url` fields
  instead), and CRED-07 relies entirely on its `exists(forms, …)` check
  rather than a top-level `credentialFormPresent` gate.

Neither discrepancy is a defect in the rule set or the module — both are
implemented correctly against their own logic. The comments in the frozen
contract are simply stale relative to how the rules were actually authored.
Not actionable without touching a frozen file; recorded so a future reader
doesn't trust the inline tags as ground truth without checking the live
rule set.

**Correction, 2026-08-25:** the line above originally cited "the same lesson
DEFECT-10 already established" — wrong. DEFECT-10 is about G-11's CI
conformance script scanning the frozen pre-amendment `spec/*.ts` instead of
`packages/contracts/*.ts` for TypeScript enum types — unrelated to rule-set
predicate field sourcing. Checked against DEFECT-10's actual entry before
leaving this correction, not from memory. See DEFECT-16 for the real
precedent this section's finding is part of.

---

## DEFECT-16 — `requiredModules` must reflect real `FindingPath` dependencies, not §7.1's summary column (pattern, bitten twice)

Finding: §7.1's "Required Evaluations" table column reads as a rule's
complete module dependency list, but it is a **summary**, not an exhaustive
one. At least two separate rule-authoring passes have needed a module beyond
what that column names, because the rule's actual predicate reads a "page"
fact (registrable domain, transport scheme) that isn't available within the
column's named module(s) alone. This has now happened twice, independently,
which makes it a pattern worth naming rather than two unrelated one-off
fixes:

**Occurrence 1 — CRED-05 and CRED-06, found and resolved at rule-set
authoring time** (commit `fd61b76`, "Step 11: rule-set authoring"). §7.1
lists CRED-05's Required Evaluations as "JavaScript" only and CRED-06's as
"LoginForm" only. Neither module's Findings type carries a page-domain or
transport-scheme field: CRED-05's `¬same-site(transmission endpoint, page)`
needed `url.registrableDomain` for "page"; CRED-06's `page scheme is HTTP`
needed `url.isSecureScheme` (itself tagged `// CRED-06 reads this` directly
in `evaluation.contract.v1.ts`, confirming the need was anticipated even
though §7.1's column doesn't reflect it). Resolved at authoring by adding
`url` to both rules' `requiredModules` — `requiredModules` was derived from
which modules each predicate's `FindingPath`s actually touch, a proper
superset of §7.1's column for these two, and documented as such at the time.

**Occurrence 2 — CRED-01, CRED-02, CRED-07, CRED-A1, found during DEFECT-15's
investigation, resolved 2026-08-25.** All four referenced
`loginForm.pageRegistrableDomain` for the same kind of "page" comparison —
but that field is permanently `null` (DEFECT-15: `LoginInterfaceEvidence`
has no domain field to derive it from). Fixed the same shape as occurrence
1: swapped to `url.registrableDomain`, added `url` to each rule's
`requiredModules`. Authorized by Jayanth as Architecture Owner; see
DEFECT-15's resolution note for the full detail (diffs, verification,
commit).

**The pattern, stated once:** §7.1's table names a rule's *headline* module
dependency, not necessarily its complete one. A "page" reference inside a
predicate is a recurring signal that a second module (almost always `url`)
is actually required, regardless of what the table's column says. Worth
checking explicitly the next time any rule referencing "page," "the
page URL," or similar generic language is authored or audited — don't trust
§7.1's column as exhaustive without tracing the predicate's actual
`FindingPath`s.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** Both known occurrences now resolved and live in
  `rulesets/rules-v0.1.0.json` (occurrence 1 at v0.1.0 authoring; occurrence
  2 at v0.2.0, see DEFECT-15). This entry is kept open as a standing note,
  not closed — the pattern itself (§7.1's column being a summary, not
  exhaustive) can recur the next time a rule references a "page" fact, and
  is worth checking explicitly then, not just documented after the fact
  twice.

---

## DEFECT-18 — JavaScriptFindings has two ungroundable fields; makes CRED-05 and CRED-A1 both structurally unable to fire (found 2026-08-25)

Finding: two of `JavaScriptFindings`' six fields cannot be honestly
populated from `ScriptRuntimeEvidence`. This is the same *shape* of gap as
DEFECT-15's `pageRegistrableDomain` (a `Findings` field with no groundable
evidence source) — **not** DEFECT-16's shape (a rule's `requiredModules`
missing a module its own predicate actually needs). Recording it separately
rather than folding into DEFECT-16 as originally planned while investigating
this module (`packages/engine/modules/javascript.ts`'s header comment now
cites this entry, corrected before commit rather than left stale): even
naming every module in a rule's `requiredModules` cannot fix either gap
below, because §2.6 forbids a *module* — not a rule — from crossing
evidence categories, regardless of
what the rule that consumes its output lists.

**`transmissionEndpointDomains`** — `ScriptRuntimeEvidence` has exactly one
transmission-related field, `transmissionEndpoints: Observation<readonly
string[]>` (raw endpoint strings — every field in this contract that
genuinely holds a registrable domain says so explicitly in its name, e.g.
`actionRegistrableDomain`, `downloadRegistrableDomain`; this one does not).
Deriving a domain from a raw endpoint string requires PSL-equivalent
registrable-domain extraction — exactly the class of logic a module must
not perform (hard constraint, restated explicitly for this module).
Reported as `[]` unconditionally.

**`injectingScriptOriginDomain`** — the only evidence field that plausibly
answers "which script's origin injected this" is
`LoginFormObservation.injectingScriptOrigin` (`evidence.contract.v1.ts:221`)
— but it lives inside `LoginInterfaceEvidence` (the `loginInterface`
category, nested per-form), not `ScriptRuntimeEvidence`. Per §2.6 this
module cannot reach into a different evidence category to get it.
`ScriptRuntimeEvidence`'s own `dynamicScriptOrigins` is a flat, unlinked
list — nothing ties any entry to `credentialInterfaceInjected`. Reported as
`null` unconditionally. Confirmed adversarially, not assumed: even with a
real injection event and real, plausible `dynamicScriptOrigins` data
present (`packages/engine/modules/javascript.fixture.test.ts`, case 2), the
module still correctly reports `null` rather than guessing.

**Load-bearing consequence — both rules that read these fields are
structurally unable to fire, for two different reasons:**

- **CRED-A1** compares `notSameSite(javascript.injectingScriptOriginDomain,
  url.registrableDomain)`. Tonight's DEFECT-15 fix made the *right* operand
  real and groundable. This entry confirms the *left* operand independently
  — it is always `null`, regardless of what the module observes
  (`javascript.fixture.test.ts` case 6, an explicit reproducible record, not
  just this defect-log claim). Fixing one side without the other left
  CRED-A1 exactly where it started: unable to ground both sides of its own
  comparison.
- **CRED-05** is worse off, not just similarly affected: its only reference
  to `transmissionEndpointDomains` is `exists(javascript.transmissionEndpointDomains,
  notSameSite($, url.registrableDomain))` (confirmed the sole reference —
  grepped `rulesets/rules-v0.1.0.json` directly). An `exists` quantifier over
  a permanently-empty collection is vacuously false on every evaluation —
  not "one ungroundable operand," but the entire third conjunct
  permanently unsatisfiable. CRED-05 can never match, full stop, as long as
  this field stays `[]`.

Both consequences hold independent of whether a Stage 2 predicate evaluator
exists yet (it doesn't — no engine anywhere in this repo currently executes
`notSameSite`/`exists` against real data). This describes what *will* happen
once one is built, not a live runtime bug today.

Resolution does not belong in this module, for the same reason DEFECT-15's
doesn't: narrowing scope further to "fix" this would violate §2.6 in the
other direction. Same two live paths as DEFECT-15 — an evidence-contract
amendment (adding a registrable-domain-bearing transmission-endpoint field,
and a real link between `dynamicScriptOrigins` and
`credentialInterfaceInjected`, possibly by moving/duplicating
`injectingScriptOrigin` into `ScriptRuntimeEvidence` itself), or Stage 1
producer-side extraction (computing domains before evidence is even
handed to this module, so `transmissionEndpoints`/the injecting-origin
field arrive pre-resolved).

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** DEC-14 (2026-08-25). CRED-05 and CRED-A1 accepted as
  non-functional for Phase I, signed by Jayanth (Architecture Owner) —
  both rules remain SIGNED and PRESENT in `rules-v0.2.0.json`, not
  removed or disabled. The fix (an evidence-contract amendment adding
  producer-extracted domain fields, mirroring `url.registrableDomain`'s
  precedent, plus corresponding producer-layer implementation) is
  deferred to a future decision — logged, not started. This closes the
  question of what to do about the gap; it does not close the gap
  itself, which remains real until that future amendment lands.

---

## DEFECT-19 — `RedirectFindings` has two ungroundable fields; makes CRED-04 structurally unable to fire (found 2026-08-26)

Finding: `RedirectEvidence` (evidence.contract.v1.ts:198-204) carries
`initialUrl` and `finalUrl` as raw URL strings only — no field in this
contract represents either as a registrable domain (every field that
genuinely holds one says so explicitly in its name, e.g.
`actionRegistrableDomain`, `downloadRegistrableDomain`; these two do
not). `RedirectFindings.initialRegistrableDomain` and
`.finalRegistrableDomain` (evaluation.contract.v1.ts:141-142) ask for
exactly that, though. This is the same *shape* of gap as DEFECT-15's
`pageRegistrableDomain` and DEFECT-18's two `JavaScriptFindings` fields
— a Findings field with no groundable evidence source — not DEFECT-16's
shape (a rule missing a module in `requiredModules`); both rules
already correctly list `redirect` in `requiredModules`.

Deriving a domain from a raw URL string would require PSL-equivalent
registrable-domain extraction inside this module — exactly the class of
logic §2.6 forbids a module from performing; that derivation belongs at
Stage 1 in the evidence producer, never here (restated identically for
`javascript.ts`'s equivalent gap, DEFECT-18).

**Unlike DEFECT-15/16's fix, no cross-module substitute exists.**
DEFECT-15 resolved by swapping the vacuous operand to
`url.registrableDomain` — available because the comparison needed one
*current-page* domain, which the `url` module already supplies
independently. Here, CRED-04 and PM-01 both compare
`redirect.finalRegistrableDomain` against
`redirect.initialRegistrableDomain` — two values from this module's own
category, describing two different points in the SAME redirect chain
(before vs. after). No other module's Findings type carries "the page's
registrable domain before this specific redirect chain started," so
there is nothing to swap in for the `initial` side, and swapping only
the `final` side would compare two operands sourced inconsistently
(one genuinely grounded, one still structurally null) without actually
restoring the comparison CRED-04's predicate expresses.

Implemented as: both fields are unconditionally `null`
(`packages/engine/modules/redirect.ts`, documented at the assignment
and in the module's header comment). The module otherwise stays
evaluable — `hopCount`, `mechanisms`, and `chainLength` are all
genuinely derivable from `hopCount`/`chain` and are not withheld on
account of this gap.

**Worth noting for whichever fix path is chosen:**
`RedirectEvidence.crossedRegistrableDomain` (evidence.contract.v1.ts:203)
already exists as a producer-computed same-site verdict — a boolean,
not the two domain strings `RedirectFindings` asks for. It is not read
by this module and cannot be, today: `RedirectFindings` has no field
shaped to receive a boolean same-site verdict, only the two domain
strings. Whether a future fix threads `crossedRegistrableDomain`
through as a new Findings field (a smaller contract change than adding
two domain-string fields, but changes what the predicate can express —
same-site vs. not, rather than the two domains themselves) or extracts
real domains producer-side (mirroring DEFECT-18's suggested path) is an
open question for whoever resolves this, not decided here.

**Load-bearing consequence — confirmed directly against
`rulesets/rules-v0.1.0.json`, not assumed:**
- **CRED-04**'s predicate is a three-way `and`
  (`redirect.hopCount ≥ redirect_hop_min` ∧
  `notSameSite(redirect.finalRegistrableDomain, redirect.initialRegistrableDomain)`
  ∧ `loginForm.credentialFormPresent`). With both operands of the
  `notSameSite` conjunct permanently `null`, that conjunct can never
  match — CRED-04 is structurally unable to fire, full stop, regardless
  of hop count or credential-form presence.
- **PM-01** is degraded, not disabled: its predicate's third conjunct is
  an `or` between the same `notSameSite` comparison and
  `permissionContext.pageAgeMs < page_age_max_ms`. The `notSameSite` arm
  is permanently unsatisfiable for the same reason as CRED-04, but the
  page-age arm does not depend on `redirect` at all — PM-01 can still
  fire through it alone.

Resolution does not belong in this module, for the same reason
DEFECT-15/18's doesn't: narrowing scope further to "fix" this would
violate §2.6 in the other direction. Two live paths, same shape as
DEFECT-15/18: a future evidence-contract amendment adding
registrable-domain (or same-site-boolean) fields to `RedirectEvidence`,
or Stage 1 producer-side extraction computing them before evidence
reaches this module.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** OPEN. CRED-04 accepted as structurally non-functional and
  PM-01 as degraded for the same reason DEC-14 accepted CRED-05/CRED-A1
  — flagged here for the same Architecture Owner ruling, not
  independently decided.

---

## DEFECT-20 — `PermissionContextFindings.requestingRegistrableDomain` is ungroundable (found 2026-08-26; not currently load-bearing)

Finding: `PermissionContextEvidence.requestingOrigin`
(evidence.contract.v1.ts:284) is a raw origin string; deriving a
registrable domain from it requires the same PSL-equivalent extraction
DEFECT-15/18/19 already establish a module must not perform. Same
*shape* of gap as those three. Implemented as unconditionally `null`
(`packages/engine/modules/permissionContext.ts`), `requestingOrigin`
never read.

**Unlike DEFECT-15/18/19, this is not currently load-bearing.** Grepped
directly against `rulesets/rules-v0.1.0.json`:
`requestingRegistrableDomain` appears nowhere outside its own contract
declaration (evaluation.contract.v1.ts:229) — no rule, including PM-01
(the only rule this module serves), reads it. Recorded for completeness
and consistency with the other three occurrences of this exact gap
shape, and in case a future rule version starts reading it.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** OPEN, low priority — no live rule currently affected.

---

## DEFECT-17 — G-8's rule-set validator has no integrity-digest check; verification exists but isn't wired in (follow-up, found 2026-08-25)

Finding: `tools/ci/compute-ruleset-digest.mjs` (added 2026-08-25, alongside
the DEFECT-15 fix) can both compute and `--verify` a rule set's
`integrityDigest` against its actual content — but `tools/ci/validate-ruleset.py`
(the V-1…V-13 static validator wired to `npm run validate:ruleset` / gate G-8)
does not call it. A rule set with a stale or hand-edited `integrityDigest`
currently passes G-8 CONFORMANT regardless — none of V-1 through V-13 touches
the digest field at all.

This is exactly the failure shape §12.2 exists to prevent: "Integrity is
checked at load; failure is fail-closed (§15.3)" — but nothing in this
repo's CI path currently performs that check before release. The standalone
script is a necessary precondition for closing this, not the closure itself;
a human has to remember to run it by hand today.

Resolution (not implemented now — deliberately out of scope for tonight's
fix, per explicit instruction): wire `compute-ruleset-digest.mjs --verify`
into `validate-ruleset.py` as a fourteenth check, `V-14`, alongside the
existing thirteen. Needs a decision first, not just an implementation: does
`V-14` live in the Python validator by shelling out to the `.mjs` script
(cross-language dependency, but reuses the one committed, documented
algorithm rather than reimplementing it twice), or does the digest algorithm
get ported natively into `validate-ruleset.py` (no shell-out, but now two
implementations of the same canonicalization to keep in sync)? Recommend the
former unless there's a reason CI shouldn't have both Python and Node
available in the same step (it already does — `tools/ci/run-python.mjs`
proves Node invoking Python already works in this repo's toolchain).

**Resolution — 2026-08-25, commit `f0f83402080387b603b15fb1ea8a8240e2253573` (short: `f0f8340`).**
Wired `compute-ruleset-digest.mjs --verify` into `validate-ruleset.py` as
`V-14`. Design choice resolved as recommended above: shells out via
`subprocess`, rather than porting the SHA-256/canonicalization logic
natively into Python — confirmed, not just asserted, that this is safe:
`validate-ruleset.py` only ever runs as a child of
`node tools/ci/run-python.mjs tools/ci/validate-ruleset.py`, so `node` is
already resolved and already ran successfully before this process even
started — shelling back out to it adds no new runtime dependency. Porting
was reconsidered and rejected on a concrete basis: the `.mjs` script's own
header documents that Python's `json.dumps` defaults to `ensure_ascii=True`
(escaping non-ASCII to `\uXXXX`), the opposite of the `.mjs` canonicalization
— and this rule set's prose fields use non-ASCII characters (`§`, `→`, `—`)
extensively, so a naive port would silently diverge on identical content.
One source of truth stays in the `.mjs` script.

Tested properly, not just a clean pass: ran against the current, correct
file (`V-14 OK`, `CONFORMANT`, all fourteen checks); temporarily corrupted
the stored `integrityDigest` by one character (`...bec` → `...bea`),
re-ran — `V-14 FAILS` with a message citing both the corrupted stored value
and the correctly-recomputed value side by side, `RESULT: NON-CONFORMANT`,
exit 1; restored the exact original byte-for-byte (`diff`-confirmed against
a pre-corruption backup) and re-ran — `V-14 OK` again. File was never left
corrupted.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** RESOLVED.

---

## DEFECT-21 — `RuleMatchResult` conflates an unevaluable required module with a genuine non-match (found 2026-08-26, while building Stage 3)

Finding: `RuleDefinition.requiredModules`'s own doc comment (§15.2,
`ruleset.format.v1.ts:176-183`) states the requirement directly: "if ANY
required module is `unevaluable` for this pass, the rule outcome is
`unevaluable` — NOT a non-match. A rule that could not be tested MUST NOT
be recorded as a rule that found nothing." `RuleOutcome`
(`passresult.contract.v1.ts:70-77`) is typed for exactly this: three
variants, `matched` / `notMatched` / `unevaluable` (the last carrying a
`reason` and `unevaluableModules`).

`packages/engine/stage2.ts`'s `RuleMatchResult` does not make this
distinction. It has three statuses too, but a different three:
`'matched'` / `'unmatched'` / `'blocked'` (the last reserved for
`priorFindingActive`, DL-01 only). A rule whose predicate could not be
evaluated because a required module was genuinely `unevaluable`, and a
rule whose predicate WAS fully evaluated and simply didn't match, both
currently surface as `'unmatched'` — collapsing §15.2's required
three-way distinction into two.

Impact: does NOT corrupt `packages/engine/stage3.ts`'s
`generateCorrelationFindings` output. `stage3.ts` only ever produces a
`CorrelationFinding` for a `'matched'` `RuleMatchResult`, and `'matched'`
can only occur when every conjunct the predicate actually needed was
genuinely evaluated — §5.6 ("Where the evidence required by a predicate
is absent, the predicate simply does not match") is implemented in
`stage2.ts`'s `matchPredicate` so that any path resolving against an
unevaluable module makes its containing check `false`, which can never
produce a `true` result for a conjunct that depended on it. An
unevaluable required module can therefore never cause a false
`'matched'`; at worst it causes a `'matched'`-shaped rule to instead
report `'unmatched'` when it should more precisely report
`'unevaluable'` — a mislabeling of the REASON a rule produced no
finding, never a fabricated finding.

> **CORRECTION (2026-08-27) — the paragraph immediately above is WRONG and
> is retained only so the error is legible, per this register's "record,
> not a fix list" rule.** Its reasoning holds for a check read directly,
> but not through `not()`. `matchPredicate` returned a two-state
> `boolean`, so `is` collapsed the UNEVALUABLE sentinel to `false` before
> `not` ever saw it, and `!false` fabricated a match. An unevaluable
> required module therefore COULD cause a false `'matched'` and a real,
> fabricated `CorrelationFinding` — demonstrated on all four committed
> fixtures, where `DL-02` (`requiredModules: ['downloadContext']`) fired
> with `downloadContext` unevaluable and no download evidence of any kind.
> `CRED-06` was latently exposed the same way and is far more serious: a
> PRIMARY at weight 40 that counts in the score, so a fabricated match
> there corrupts the tier directly. Logged and fixed as **DEFECT-22**;
> see that entry for the full analysis. What survives of DEFECT-21 is only
> the `'unmatched'`-vs-`'unevaluable'` conflation described below, which
> the DEFECT-22 fix deliberately did NOT close.

DOES affect: the full three-state `RuleOutcome` cannot yet be built
correctly from `stage2.ts`'s output alone — `'unmatched'` is ambiguous
between "genuinely evaluated, no match" and "a required module was
unevaluable, never actually tested." `RuleOutcome` is part of the
broader `AnalysisPassResult` (`passresult.contract.v1.ts:236`,
`ruleOutcomes: readonly RuleOutcome[]`) — a later, wider concern than
Stage 3's `CorrelationFinding`, not yet scaffolded.

Not yet resolved — logged only. Fixing it means `stage2.ts`'s
`matchAllRules` (or a layer above it) checking each rule's
`requiredModules` against the evaluation set's per-module
`result.status` BEFORE attempting to evaluate the predicate, and
reporting `'unevaluable'` (with which modules, per §15.2's
`unevaluableModules` field) when any required module is `unevaluable` —
distinct from, and checked before, the existing `'unmatched'` outcome of
a fully-evaluated predicate. Full cross-reference:
`packages/engine/stage3.ts`'s header comment points here rather than
repeating this analysis.

> **AMENDMENT (2026-08-27) — THE INVARIANT THIS VIOLATES, NOW IDENTIFIED.**
> This entry was filed and analysed against §15.2 alone. It is in fact a
> violation of a **frozen-contract invariant**, which the original entry
> never cited: `packages/contracts/evaluation.contract.v1.ts:304`,
> invariant **E-6** — "`unevaluable` is a produced evaluation, not a
> missing one. **Stage 2 MUST distinguish it from
> evaluated-with-negative-findings.**" That is normative contract text,
> not a spec preference, and `packages/contracts/` is FROZEN. The same
> requirement is restated at `passresult.contract.v1.ts:64-67` ("`unevaluable`
> is an OUTCOME, not an absence — §15.2's whole mechanism depends on
> distinguishing 'tested, no match' from 'could not test'") and at
> `ruleset.format.v1.ts:176-183` (§15.2, "CRITICAL"). Filing this as a
> §15.2 shortfall understated it: shipped code was violating a frozen
> invariant, not merely missing a nicety.

**FIX (2026-08-27) — `packages/engine/stage2.ts`.** Two changes at the
reporting boundary, the collapse point DEFECT-22's fix deliberately left
in place:

1. **`RuleMatchResult` gained a first-class `'unevaluable'` variant**,
   carrying `reason` and `unevaluableModules` — shaped to feed
   `passresult.contract.v1.ts`'s `RuleOutcome.unevaluable` directly, whose
   own fields are exactly `reason: UnevaluableReason` and
   `unevaluableModules: readonly ModuleId[]`. The reason reported is the
   FIRST unevaluable required module's own `Evaluability.reason`, not a
   rule-level invention.
2. **§15.2's `requiredModules` pre-check now runs BEFORE the predicate**,
   as that section's text requires. Order is load-bearing, not incidental:
   evaluating the predicate first would let `and`-short-circuiting report
   `'unmatched'` for a rule that was never actually testable.

`'blocked'` is deliberately NOT folded into `'unevaluable'`: it means the
predicate reached `priorFindingActive`, i.e. a missing store DEPENDENCY,
not an unevaluable module. Collapsing them would lose the distinction the
error message carries. A residual case is also reported honestly rather
than downgraded — if every declared required module was evaluable but the
predicate still read an unevaluable one, the rule's `requiredModules`
under-declares what it reads (DEFECT-16's shape); that surfaces as
`unevaluable` with reason `'undeclared_required_module'` and an empty
module list.

**No score changed — verified, not assumed.** E-6 governs REPORTING, not
weight: `stage3.ts` produces a `CorrelationFinding` only for `'matched'`,
and nothing that previously reported `'matched'` now reports otherwise.
Checked before implementing, by computing the pre-check against every rule
on all four fixtures: the sole matched rule (`CRED-01` on
`off-origin-post`) has all required modules evaluated. After the fix, all
four fixtures produce byte-identical scores and tiers to the
post-DEFECT-22/DEC-20 values: `clean-login` 0/Low, `no-credential` 0/Low,
`off-origin-post` 45/Medium (CRED-01 alone), `sso-flow` 0/Low.

**What changed is what the pass now SAYS.** On `sso-flow`, `CRED-02`
(requires `authContext`) and `DL-01`/`DL-02` (require `downloadContext`)
now report `'unevaluable'` naming the responsible module, where they
previously claimed to have been tested and found nothing. On
`no-credential`, seven rules move from `'unmatched'` to `'unevaluable'` —
that fixture has no login form, so most rules genuinely could not be
tested at all.

**Three tests had encoded the violation as expected behaviour** and were
corrected alongside the fix — the same pattern DEC-20 documents:
`stage2.fixture.test.ts` asserted `'unmatched'` for a rule whose own
inline comment already read "url module unevaluable in baseEvaluations()";
its integration loop whitelisted only `matched|unmatched|blocked`; and its
DEFECT-19 check asserted the literal status `'unmatched'` rather than the
property DEFECT-19 actually established ("never MATCHED"), which is now
asserted directly. `e2e.sso-flow.fixture.test.ts` gained assertions that
each unevaluable outcome names its module and carries the module's reason.

**No new defect number was opened for this fix, deliberately.** DEFECT-21's
own heading already names this exact subject — "`RuleMatchResult` conflates
an unevaluable required module with a genuine non-match" — so a new entry
would duplicate it. This differs from DEFECT-22, which earned its own
number because it was a distinct root cause (`not()` inverting a collapsed
boolean) that this entry had explicitly claimed was impossible. Current
highest defect number verified as 23 before deciding; no DEFECT-24 was
created.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** **FIXED 2026-08-27** in `packages/engine/stage2.ts`. E-6 is
  now satisfied at Stage 2's reporting surface. `RuleOutcome` /
  `AnalysisPassResult` construction remains unstarted, but is no longer
  BLOCKED by this defect — `matchAllRules` now emits everything
  `RuleOutcome`'s three variants require.
- **Amended 2026-08-27 (earlier, same day):** impact analysis corrected
  (see the CORRECTION block above). The fabricated-match half became
  DEFECT-22, FIXED. That amendment stated the remaining conflation was
  still OPEN and listed what a fix would need — "the `requiredModules`
  pre-check and the `RuleMatchResult`/`RuleOutcome` surface to report it
  on." Both are now implemented; this entry is closed.

---

## DEFECT-22 — `not()` over an unevaluable module fabricates a match; §5.6 did not survive negation (found and FIXED 2026-08-27)

Finding: `packages/engine/stage2.ts`'s `matchPredicate` returned a
two-state `boolean`. `resolveFindingPath` correctly returns an
`UNEVALUABLE` sentinel for any path into a module whose result is not
`'evaluated'`, and every leaf operator correctly refused to match on it
— but each did so by returning plain `false`, discarding the distinction
between "evaluated, and the answer is no" and "could not evaluate."
`not` then inverted that `false` into `true`:

```ts
case 'is': {
  const value = resolveValuePath(predicate.path, evaluations, boundItem);
  return value === true;          // UNEVALUABLE -> false
}
case 'not':
  return !matchPredicate(predicate.operand, ...);   // !false -> TRUE
```

The file's own header asserted the invariant it then failed to hold:
"any `ValuePath` that resolves against an `unevaluable` module ... makes
the containing check false, not an error and not a guessed default."
True of the containing CHECK; false of any `not()` wrapping it. §5.6
("Where the evidence required by a predicate is absent, the predicate
simply does not match") was therefore enforced everywhere except through
negation — the one place it inverts into its opposite.

**Load-bearing consequence — measured, not reasoned about.** All three
`not()` nodes in `rulesets/rules-v0.1.0.json` were enumerated by walking
every rule's predicate AST (including `exists.where` subtrees) and both
suppression guard sets. Exactly three exist, each wrapping a bare `is`:

| Rule | Negated path | Module | Exposed? |
|---|---|---|---|
| `CRED-06` (primary, w=40) | `url.isSecureScheme` | `url` | **YES — latent, severe** |
| `DL-02` (aggravator, w=20) | `downloadContext.extensionMimeConsistent` | `downloadContext` | **YES — firing on every fixture** |
| `PM-01` (primary, w=25) | `permissionContext.precededByUserGesture` | `permissionContext` | No — accidentally protected |

- **`DL-02` fired on ALL FOUR committed fixtures**, none of which
  contains any download evidence (`clean-login`, `no-credential`,
  `off-origin-post`, `sso-flow` all carry `downloadContext` entirely
  `notCollected('not_applicable')`, making the module `unevaluable`). A
  real `CorrelationFinding` was minted asserting a download's extension
  and MIME type disagreed, on pages where no download was ever observed.
  It scored 0 only because its parent `DL-01` never fires
  (`parentQualified` false, §9.3) — containment by accident, not design.
- **`CRED-06` is the serious one.** It is a PRIMARY at weight 40 that
  counts directly in `primarySum`. Any evidence set with an evaluable
  `loginForm` and an unevaluable `url` module fabricated a 40-point
  match — enough on its own to cross `threshold_medium` (30). Confirmed
  by construction: setting `url.scheme` to `notCollected` on
  `clean-login` produced `CRED-06: matched`. No committed fixture
  triggers it, which is exactly why no test caught it.
- **`PM-01` was protected only by conjunct ORDER** — its first conjunct
  `neq(permissionContext.requestedPermission, null)` returns false on an
  unevaluable module and short-circuits before the `not()` is reached.
  Reordering the conjuncts would have exposed it. Not a structural
  protection.

**Why the existing tests all passed.** Every per-module and per-stage
test built its own inputs and asserted its own unit; none ran a real
fixture through dispatch → Stage 2 → Stage 3 → Stage 5/6 in one pass.
`tools/ci/test-fixtures.ts`'s four "round-trip" checks (gate G-7) do not
import the engine at all — they are JSON serialization identity checks
(`JSON.stringify(f) === JSON.stringify(JSON.parse(JSON.stringify(f)))`)
plus three Observation-state spot checks. The defect lived in the seam
between units, where nothing was looking.

**Fix, implemented 2026-08-27** (`packages/engine/stage2.ts`): a new
internal three-state `PredicateResult` (`'match' | 'noMatch' |
'unevaluable'`) and `evaluatePredicate`, which propagates `'unevaluable'`
through every operator instead of collapsing it. `not('unevaluable')` is
`'unevaluable'`, never `'match'`. `matchPredicate` is retained as a thin
boolean wrapper (`evaluatePredicate(...) === 'match'`) so no caller
changes — `stage4.ts`'s guard evaluation and every existing test keep
their current signature, and an unevaluable guard now correctly declines
to suppress rather than suppressing on unknown data.

Two deliberate non-changes, both to keep the fix narrow:

1. **Operand evaluation order is preserved exactly** (`and` stops at the
   first non-`match`, `or` at the first `match`, mirroring the previous
   `Array.every`/`Array.some`). This is not cosmetic:
   `priorFindingActive` throws, and `DL-01`'s first conjunct reads the
   unevaluable `downloadContext`. Evaluating operands the old code
   short-circuited past would have converted `DL-01` from `'unmatched'`
   to a thrown `PriorFindingActiveUnavailableError` on every fixture —
   a behaviour change unrelated to this defect.
2. **A genuine `null` Findings value still yields `'noMatch'`, never
   `'unevaluable'`.** Only the UNEVALUABLE sentinel — an unevaluable
   MODULE — produces `'unevaluable'`. DEFECT-19's settled semantics
   (`notSameSite(null, null)` is not a match) are unchanged, as are
   `permissionContext`'s nullable-field readings.

**Verification** (`packages/engine/e2e.sso-flow.fixture.test.ts`, new):
all three `not()` rules asserted on BOTH an evaluable and an unevaluable
operand — `CRED-06` still fires on a genuinely `http` scheme and no
longer fires when `url` is unevaluable; `DL-02` still fires on a
genuinely inconsistent extension/MIME pair and no longer fires on any of
the four fixtures; `PM-01` still fires on a real no-gesture permission
request and is now asserted against the unevaluable case so conjunct
reordering cannot silently expose it. Full suite green afterwards: `tsc
-b` clean, 16/16 test files pass, `test:fixtures` 7/7,
`validate:ruleset` CONFORMANT.

**Relationship to DEFECT-21.** Distinct and more severe, not a
duplicate. DEFECT-21 is about the `RuleMatchResult` SURFACE conflating
`'unmatched'` with `'unevaluable'`; it explicitly claimed an unevaluable
module "can never cause a false `'matched'`." That claim is what this
entry disproves, and DEFECT-21 has been amended with a correction block
pointing here. DEFECT-21's own subject — the missing `requiredModules`
pre-check and the two-state `RuleMatchResult` — remains OPEN and
untouched by this fix.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** FIXED 2026-08-27 in `packages/engine/stage2.ts`, with the
  regression matrix in `packages/engine/e2e.sso-flow.fixture.test.ts`.
  No rule-set change was required — the defect was in the evaluator, not
  in any rule's predicate.

---

## DEFECT-23 — CRED-03 detects "has a distinct skeleton", not UTS-39 homograph attack; `tau_collision` is declared but unreferenced (found 2026-08-27)

Finding: `tau_collision` is registered in `rulesets/rules-v0.1.0.json`'s
`parameters` array with `value: 0.95`, and is referenced by **nothing**.
Verified by parsing the rule set and searching the serialised `rules` and
`suppressions` arrays directly (not by eyeballing the file): exactly one
occurrence of the string in the whole document — its own declaration.
No predicate, no guard, no `blockedBy`, no subsumption entry reads it.

That dangling parameter is the visible symptom of a wider gap. CRED-03's
first conjunct is:

```json
{ "op": "neq", "path": "homograph.confusableSkeleton", "value": null }
```

which asks only whether a confusable skeleton EXISTS. UTS-39's actual
notion of a homograph attack is a **collision**: a domain is deceptive
when `skeleton(suspect)` equals `skeleton(some legitimate brand)` — the
suspect is confusable *with something specific*. "Has a skeleton
distinct from itself" is a necessary precondition for that, not the
attack itself. A domain can carry a distinct skeleton and collide with
nothing at all (any single-script non-Latin domain, which CRED-03's own
`knownLimitations` already flags: "Single-script non-Latin domains are
legitimate and common").

`tau_collision: 0.95` reads as the threshold for exactly the missing
comparison — a similarity or collision score against a registry of
protected brands — but no registry exists to compare against. The three
`refinementSets` in the rule set are `executableTypes`,
`sensitivePermissions`, and `identityProviders`; none is a protected-brand
list, and `identityProviders` is an exact-match allowlist consumed by
S-02, explicitly documented there as "by exact string equality only —
never substring, suffix, or similarity."

**Scope — this is NOT DEC-20's fixture bug.** DEC-20 records that the
four fixtures emitted `confusableSkeleton` as `present(<the domain
itself>)` instead of `absent()`, making CRED-03's `neq(..., null)`
conjunct true for every domain; that was an evidence-production defect,
fixed in the fixtures on 2026-08-27, and CRED-03 now behaves correctly
*against its own stated predicate*. This entry is about that predicate
being a weaker test than the rule's `rationale` claims ("Visual domain
deception..."). The two are independent: DEC-20's fix was necessary and
is complete on its own terms; neither it nor DEC-20's proposed Option B
(a contract field enabling an explicit skeleton-vs-domain comparison)
implements brand-collision detection. Option B would let CRED-03 ask
"does the skeleton differ from THIS domain" — still not "does it collide
with a KNOWN BRAND."

**Not load-bearing today, and deliberately not fixed here.** With the
fixtures corrected, CRED-03 fires only when a producer reports a
genuinely distinct skeleton, which is a defensible (if over-broad)
signal, and the rule additionally requires `loginForm.
credentialFormPresent` as its second conjunct — so it cannot fire on a
non-credential page regardless. The gap is that it will over-fire on
legitimate non-Latin credential pages, exactly as its own
`knownLimitations` predicts.

Closing it needs, at minimum: a protected-brand registry (which
`DECISIONS.md` DEC-12 — "Sanctioned constructors for the five brands",
CANDIDATE, unsigned — is plausibly the beginning of, though that entry
is about constructors rather than skeleton comparison and this is not
asserted as its intent), a `RefinementSet` or new rule-set structure to
hold it, and a predicate operator that can express a similarity or
collision test against it — `tau_collision`'s threshold implies a
similarity comparison, and no operator in `Predicate` (`ruleset.format.
v1.ts`) currently performs one. That is a rule-set format concern, not
an engine bug: `packages/engine` implements every operator the format
defines, correctly.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** OPEN, not a work item tonight. Recorded so `tau_collision`
  is not mistaken for a live tunable, and so the distance between
  CRED-03's `rationale` and its actual predicate is on the record before
  anyone tunes the parameter expecting it to do something.

---

## DEFECT-24 — `homograph.ts`'s `scriptsUsed` doc comment contradicts all four fixtures' actual usage (found 2026-08-28)

Finding: two incompatible readings of `HomographFindings.scriptsUsed` are
live in the repository at once, and nothing reconciles them.

**The module's own header comment** (`packages/engine/modules/homograph.ts`,
lines 44-47) says the array lists only NON-DEFAULT scripts — verbatim:

> "This applies equally to scriptsUsed even though it is an array:
> `scriptsUsed: present([])` is the correct way for a producer to report
> 'observed, zero non-default scripts'; `absent()` is not an unstated
> synonym for that"

Under that reading, `[]` is the correct value for a plain ASCII domain, and
a Latin+Cyrillic domain would report a single entry, `['Cyrillic']`.

**All four committed fixtures do the opposite** — they list EVERY script,
including the default one:

```
fixtures/clean-login.ts:121:      scriptsUsed: present(['Latin']),
fixtures/no-credential.ts:106:    scriptsUsed: present(['Latin']),
fixtures/off-origin-post.ts:116:  scriptsUsed: present(['Latin']),
fixtures/sso-flow.ts:127:        scriptsUsed: present(['Latin']),
```

Every one of those domains is pure ASCII (`accounts.example.com`,
`blog.example.com`, `login.idp-example.com`), so under the module's own
stated convention each should be `present([])`. Under the fixtures'
convention, `[]` would instead mean "a domain using no scripts at all",
which no domain can be.

**The contract does not settle it.** `DomainRepresentationEvidence.scriptsUsed`
is `Observation<readonly string[]>` with the sole comment
`// Unicode script names` (`evidence.contract.v1.ts:263`).
`HomographFindings.scriptsUsed` is `readonly string[]` with no comment at
all. Neither says whether the default/ASCII script is included.

**Load-bearing consequence — this blocked a real check.** DEC-21's
`homograph` coherence relation would naturally be "`isMixedScript` requires
at least two scripts", which is definitionally true under the fixtures'
reading and FALSE under the module comment's reading (one non-default script
alongside an unlisted default IS mixed script). Because the ambiguity is
unresolved, `consistency.ts` encodes only the weaker
`isMixedScript && scriptsUsed.length === 0`, which holds under both
readings, and `consistency.fixture.test.ts` asserts explicitly that
`scriptsUsed: ['Cyrillic']` with `isMixedScript: true` is NOT flagged. The
stronger check is available the moment this is decided.

Not resolved here — deciding it is a producer-semantics call, and the
producer (`tools/capture/`) does not yet emit this field for real
(`docs/ProducerCapabilityManifest.md` marks `scriptsUsed` **NOT OBSERVABLE**,
0/6, a bundled-Unicode-tables gap). Whichever reading is chosen, the other
site must change to match: either the four fixtures become `present([])`,
or `homograph.ts`'s comment is corrected.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** OPEN. Not currently load-bearing on any rule — CRED-03 reads
  `isMixedScript` and `confusableSkeleton`, never `scriptsUsed` itself
  (confirmed against `rulesets/rules-v0.1.0.json`). It IS load-bearing on
  the strength of DEC-21's homograph relation, as above.

---

## DEFECT-25 — `DnsFindings.resolves` has no definition anywhere in the corpus (found 2026-08-28)

Finding: `resolves` is the gating field of the `dns` module and nothing,
anywhere, says what it means.

Exhaustive search, all negative:
- `evidence.contract.v1.ts:179` — `readonly resolves: Observation<boolean>;`
  — no comment.
- `evaluation.contract.v1.ts` — `readonly resolves: boolean;` inside
  `DnsFindings` — no comment.
- `packages/engine/modules/dns.ts` — reads it as a bare pass-through
  (`resolves: evidence.resolves.value`), and its header does not gloss it.
- All four fixtures carry `resolves: notCollected('api_unavailable')`, so
  there is no empirical example of a real value anywhere in the repository
  either. (`docs/ProducerCapabilityManifest.md` marks the whole `dns.*`
  category PRODUCER_EXCLUSIVE — no content-script producer exists, so no
  captured value exists to inspect.)

**The two readings differ materially:**
1. "The name resolves to an ADDRESS" — then `resolves: true` with
   `aRecordCount: 0` and `aaaaRecordCount: 0` is a contradiction.
2. "The name EXISTS / the query returned NOERROR" — then a name with only
   MX records legitimately resolves while having no address at all, and the
   same combination is perfectly coherent.

**Load-bearing consequence.** DEC-21's `dns` coherence relation encodes only
the direction that holds under BOTH readings — `!resolves &&
(aRecordCount > 0 || aaaaRecordCount > 0)`, since address records prove the
name resolves however "resolves" is defined. The converse is deliberately
NOT encoded, and `consistency.fixture.test.ts` asserts that
`resolves: true` with zero addresses is not flagged, citing this entry. If
reading (1) is confirmed, that check should be added.

Not currently load-bearing on any rule: no predicate in
`rulesets/rules-v0.1.0.json` reads any `dns.*` path (the `dns` module is a
DEC-5 conformant stub for exactly that reason). This is a
definition gap to close before `dns` findings are first consumed, not a
live defect.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** OPEN, low priority. Blocks the stronger half of DEC-21's `dns`
  relation; blocks nothing else today.
