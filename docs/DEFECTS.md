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
