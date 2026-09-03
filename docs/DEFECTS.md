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

## DEFECT-19 — `RedirectFindings` has two ungroundable fields; makes CRED-04 structurally unable to fire (found 2026-08-26; RESOLVED 2026-09-03 via Option B)

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
- **Status:** RESOLVED 2026-09-03 via Option B (Architecture-Owner ruling,
  docs/DEC-19-CRED04-fix-path-REVIEW.md). Annex A amendment added
  `RedirectEvidence.initialRegistrableDomain` / `.finalRegistrableDomain`
  (`Observation<string>`), hand-typed by the Architecture Owner. Both
  producers derive them via the shared PSL resolver — the extension collector
  (`apps/extension/redirect-observer.ts`) and the harness extractor
  (`apps/harness/extract/redirect.ts`, un-stubbed). `redirect.ts` now READS
  them, mirroring DEFECT-15's `url.registrableDomain` fix. **CRED-04 fires on
  real cross-domain data** (`tools/conformance/cred04-live-path.test.ts`),
  stays silent same-site (`notSameSite(x, x)` false) and without a credential
  form. PM-01's redirect arm is likewise restored. No ruleset change: both
  predicates already expected this shape. ⚠️ **S-10 is NOT lifted** — CRED-04
  remains DIVERGENT; its corpus recall must still be reported separately and
  MUST NOT be folded into a headline. This fix lets CRED-04 fire; it does not
  make CRED-04 corpus-validatable.

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

### Shared pattern: `STATIC_EXTRACTION_RECALL_FLOOR` (named 2026-08-29)

A SECOND, independent reason CRED-03's corpus numbers will understate the
truth — distinct from the `tau_collision` gap above, and not fixed by fixing
it.

`apps/harness/extract/domainRepresentation.ts` implements
`confusableSkeleton` over a BOUNDED confusable map — the Cyrillic and Greek
homoglyphs of ASCII Latin — not the full UTS-39 `confusables.txt` table
(~6,000 entries, not bundled). A confusable built from a script outside that
core (Armenian `ա`, Cherokee `Ꭰ`, fullwidth forms) produces no skeleton, so
CRED-03 does not fire.

**The bias is one-directional.** Every entry in the bounded map is a genuine
visual confusable, so the implementation does not OVER-detect. It only
UNDER-detects. Measured CRED-03 recall on the corpus is therefore a **FLOOR**
for the homograph attack subtypes outside the core, never a true measurement.

This is the same pattern as [[DEFECT-31]]'s `CredentialField.hidden` finding:
**static extraction structurally cannot observe some sophisticated attack
techniques that a live browser can** — CSS/JS-based concealment there,
confusable scripts outside the bounded core here. Both bias measured recall
DOWNWARD, never upward, and both affect a rule DEC-26 lists as fully
corpus-validatable.

⚠️ **Any future CP-2 report of CRED-03's or CRED-07's recall MUST cite this
limitation alongside the number.** For the affected attack subtypes the figure
is a floor, not a measurement, and presenting it without the caveat would
overstate what the corpus establishes — in the direction that flatters the
system.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** OPEN, not a work item tonight. Recorded so `tau_collision`
  is not mistaken for a live tunable, and so the distance between
  CRED-03's `rationale` and its actual predicate is on the record before
  anyone tunes the parameter expecting it to do something. The
  `STATIC_EXTRACTION_RECALL_FLOOR` note above is a REPORTING obligation on
  CP-2 rather than a code fix, and stands independently of whether
  `tau_collision` is ever wired up.
- **Related:** [[DEFECT-31]] (same pattern, CRED-07 side), [[DEC-26]]
  (which rules are corpus-validatable), [[DEC-27]] (CP-2 sample-size
  scoping).

---

## DEFECT-24 — `homograph.ts`'s `scriptsUsed` doc comment contradicts all four fixtures' actual usage (found 2026-08-28; RESOLVED 2026-08-29)

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

### Resolution (2026-08-29) — the FIXTURES' reading is adopted

`scriptsUsed` lists **EVERY Unicode script present in the domain, including
the default/ASCII one.** A pure-ASCII domain is `present(['Latin'])`. The
module comment was the site that changed; **no fixture data was touched.**

Re-reading `homograph.ts:38-48` in full context settles it, and this entry's
original framing was slightly wrong about what the comment was doing. The
passage's SUBJECT is the tri-state mapping — its whole job is to establish
that `present([])` is not a synonym for `absent()` under I-2. The words "zero
non-default scripts" are an incidental parenthetical inside that argument,
not a considered ruling on script-listing semantics.

Three reasons for this direction:

1. **The "non-default" reading is unimplementable.** *Default relative to
   what* — the TLD, the user's locale, Latin? No definition exists anywhere
   in the repository. An extractor cannot implement an undefined predicate,
   and DEC-27's extractor has to implement one of the two.
2. **It is what the contract plainly says.** `// Unicode script names`
   (`evidence.contract.v1.ts:263`), and it is what every Unicode
   script-property API returns. The other reading needs a subtraction step
   nothing specifies.
3. **It unblocks DEC-21's relation**, below.

**Changes applied in the same commit — the resolution is not documentation
only:**

- `packages/engine/modules/homograph.ts` — header corrected; "zero
  non-default scripts" replaced, and the adopted semantics stated explicitly
  with its reasoning. The I-2 argument is preserved verbatim in substance,
  since it was correct and is load-bearing.
- `packages/engine/consistency.ts` — [[DEC-21]]'s homograph relation
  STRENGTHENED from `isMixedScript && scriptsUsed.length === 0` to
  `isMixedScript && scriptsUsed.length < 2`. The weaker form existed only
  because it was the one holding under both readings; with the ambiguity gone,
  `length >= 2` is the exact relation. It subsumes the old check.
- `packages/engine/consistency.fixture.test.ts` — the assertion that
  `scriptsUsed: ['Cyrillic']` with `isMixedScript: true` is NOT flagged was
  **inverted to `true`**, because under the adopted reading that combination
  is a genuine self-contradiction. ⚠️ This is the part worth noticing:
  resolving the ambiguity made a previously-passing assertion WRONG, and it
  was fixed in the same change rather than left broken. A boundary case was
  added alongside it (two scripts with `isMixedScript: false` is not judged
  by this relation).

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** RESOLVED 2026-08-29. Never load-bearing on a rule — CRED-03
  reads `isMixedScript` and `confusableSkeleton`, never `scriptsUsed` itself
  (re-confirmed against `rulesets/rules-v0.1.0.json`). It WAS load-bearing on
  the strength of DEC-21's homograph relation, which is now strengthened.
  Binding on DEC-27's extractor, which will emit the adopted form.

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

---

## DEFECT-26 — `ScoringEntry.suppressionsApplied` order followed the input array, not a canonical order (found and FIXED 2026-08-29)

Finding: `packages/engine/stage5-6.ts` built each entry's
`suppressionsApplied` by filtering and mapping `suppressionApplications`
directly, inheriting that array's order:

```ts
const suppressionsApplied = suppressionApplications
  .filter((a) => a.targetFindingId === finding.findingId && a.applied)
  .map((a) => a.suppressionId);
```

The same pass, with its applications reordered on the way in, therefore
produced a different — though semantically equivalent — record. Minimal
reproduction, one finding and two applied suppressions:

```
order A  suppressionsApplied: ["S-01","S-02"]
order B  suppressionsApplied: ["S-02","S-01"]
score identical?       true (20)
effectiveWeight ident? true
FULL OUTPUT identical? false
```

**Severity: low. Record-stability only.** No score, no `effectiveWeight`, no
`rawTier` is affected — confirmed in the reproduction above. The list is a SET
of suppression IDs whose order carries no meaning. What it does affect is
byte-comparison: `passresult.contract.v1.ts` P-13 requires replay to reproduce
"identical scoring", which is a byte comparison, and a Pass Result whose
`suppressionsApplied` ordering varies is not byte-identical.

**How it was found — worth recording.** Not by inspection. It was the first
failure of the B1.5 property test on its first run, before any deliberate
sabotage. Every example-based test in this package passed against it, because
each supplies applications in one fixed order.

**Fix:** `.sort()` appended to the projection. SuppressionIds are unique within
a rule set (V-4), so lexicographic order is total and needs no tie-breaker.

**Verified by negative control**, not by the fix passing once: reverting the
`.sort()` makes the property fail, shrunk over 43 steps to the minimal case —
ONE finding with TWO applied suppressions (`S-01`, `S-02`, both
`declaredReduction: 0.0001`), failing on "per-finding scoring entries must be
permutation-invariant". Restored; byte-identical to the fixed file; green.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** RESOLVED 2026-08-29 in `packages/engine/stage5-6.ts`, with the
  regression property in `packages/engine/b1-5.properties.test.ts`.

---

## DEFECT-27 — score/`primarySum` were order-dependent through floating-point summation (found and FIXED 2026-08-29)

Finding: `computeScoringAndAggregation` accumulated `primarySum` and
`aggravatorSum` inside its per-finding loop, i.e. **in input order**. IEEE-754
addition is not associative, so the same finding set permuted produced a
different score in the final bits. Measured on the generated counterexample:

```
primarySum   base=139.93345381530986   permuted=139.93345381530983
score        base=169.93345381530986   permuted=169.93345381530983
rawTier      High                      High
```

**Severity: higher than DEFECT-26 — this is a determinism failure, and the
mechanism it undermines is the verification mechanism itself.**

§9.1 requires aggregation to be "a pure function over the complete finding
set... SHALL NOT be implemented as an incremental accumulator". P-13 requires
replay to reproduce identical scoring. **Gate G-10 is the deterministic-replay
gate.** The consequence is specific and worth stating plainly: a rule set that
has not changed at all, replayed against the same evaluations, could FAIL
replay purely because the findings or applications were reordered in
persistence, serialisation, or any future parallel or streaming
implementation. The failure would not indicate a wrong score — it would
indicate nothing at all, while looking exactly like a genuine replay
divergence. That corrupts confidence in G-10 rather than merely producing a
wrong number, which is why this is filed above DEFECT-26.

**Tier-flip: possible in principle, NOT demonstrated.** The observed
divergence is ~3e-14 on a score of ~170. Flipping `rawTier` would require the
score to fall within that distance of `threshold_medium` (30) or
`threshold_high` (60). With integer thresholds and real-valued reductions this
is not impossible, but no such case was constructed and none is claimed.

**Reachability today: latent, not live.** `stage3.ts` emits findings in
rule-set order and `stage4.ts` emits applications from a deterministic nested
loop, so within a single pipeline run the order is stable and the four
committed fixtures are unaffected. It becomes live wherever order can vary
between the original pass and its replay.

**How it was found.** Generated input, not inspection — and notably, a
hand-built reproduction attempt FAILED to expose it: five weights across all
120 orderings produced one distinct sum, spread 0. It took `fast-check`'s
generated values to surface. This is the concrete justification for DEC-22's
argument that shrinking and seeding, not popularity, were the reasons to
adopt a property-testing library.

**Fix:** summation moved out of the per-finding loop into a separate pass over
a `findingId`-sorted copy of the scoring entries. Sorted by `findingId`
specifically, NOT by `effectiveWeight`: ties in weight are real and common
(two findings of the same rule, unsuppressed), so a weight sort would fall
back to input order for exactly those entries and silently reintroduce the
bug. `findingId` is a UUIDv4 minted per finding (`packages/engine/id.ts`) and
the PRIMARY KEY of `skr.correlation_finding` in the Logical Database Design
Specification §5.17 — genuinely unique, so the order is total with no
tie-breaker.

**Verified by negative control:** reverting to input-order summation makes the
property fail, shrunk over 39 steps, on "§9.1: aggregation is a pure function
over the SET — order must not matter", with the diff
`primarySum: 104.99315299414123` vs `104.99315299414124`. Restored; green.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** RESOLVED 2026-08-29 in `packages/engine/stage5-6.ts`, with the
  regression property in `packages/engine/b1-5.properties.test.ts`.

---

## DEFECT-28 — §9.3's aggravator parent-qualification is ambiguous when several findings share the parent rule (found 2026-08-29; UNREACHABLE today, deliberately OPEN)

Finding: `packages/engine/stage5-6.ts` resolves an aggravator's parent with

```ts
const parentFinding = findings.find((f) => f.ruleId === parentRuleId);
```

`Array.prototype.find` returns the FIRST match in input order. Where two
findings share the parent rule and differ in qualification, the aggravator's
`parentQualified` — and therefore the score — depends on which one appears
first. Minimal reproduction, one aggravator (weight 15) and two findings of
its parent rule, one suppressed to zero and one healthy:

```
suppressed-parent FIRST : parentQualified = false  aggravatorSum = 0   score = 40
healthy-parent    FIRST : parentQualified = true   aggravatorSum = 15  score = 55

SCORE DIFFERS BY : 15   — a whole aggravator weight, not floating-point noise
```

**This is a different root cause from DEFECT-26/27 and is NOT fixed by their
fixes.** Those were ordering/canonicalisation defects with a single correct
answer. This is a CARDINALITY ambiguity: §9.3 states an aggravator contributes
"only where its parent is present, unsubsumed, and has non-zero effective
weight", and says nothing about which parent applies when several exist.
Choosing one silently would be inventing aggregation semantics the
specification does not state.

**UNREACHABLE today — established by construction, not by "seems unlikely":**

- `packages/engine/stage2.ts`'s `matchAllRules` returns
  `ruleSet.rules.map(...)` — exactly one `RuleMatchResult` per rule in the
  rule set, never two.
- `packages/engine/stage3.ts`'s `generateCorrelationFindings` iterates those
  results and emits at most ONE `CorrelationFinding` per MATCHED result.
- Therefore a finding set containing two findings of the same rule cannot be
  produced by the pipeline at all.
- Confirmed empirically as well as by reading: `clean-login` yields `[]`;
  `off-origin-post` yields `[CRED-01]`. Both distinct.

The defect was surfaced only because the B1.5 property generator initially
produced finding sets with duplicate `ruleId`s — input the pipeline cannot
emit. That generator has since been constrained to unique `ruleId` per
finding, matching Stage 3's real contract, with a comment pointing here so the
constraint is not mistaken for concealment.

**Two readings, NEITHER chosen here:**

- **(a) Existential** — any qualifying parent finding suffices; implemented as
  `.some(...)` over all findings of the parent rule. Order-independent by
  construction.
- **(b) Canonical selection** — pick a specific parent deterministically, e.g.
  the lowest `findingId`. Deterministic, but the choice among genuinely
  different parents is arbitrary and carries no real-world meaning.

**LEANING TOWARD (a), LABELLED EXPLICITLY AS A LEANING FOR A FUTURE RULING,
NOT A DECISION MADE HERE.** The rationale: this rule set already expresses
"does any member satisfy this" existentially elsewhere — `ruleset.format.v1.ts`'s
`exists` operator, used by CRED-01, CRED-07 and S-02's guard, quantifies over
a collection and matches when ANY item qualifies. Reading §9.3's "parent is
present" the same way is consistent with the format's own established idiom,
where (b) would introduce a selection rule that appears nowhere else. This is
an argument for a ruling, not the ruling.

**What would make this live:** per-instance findings — one finding per login
form, or per download, rather than one per matched rule. Nothing in the
current design does that, and nothing in scope proposes it. If it is ever
introduced, this becomes a live score-correctness defect immediately, which is
why it is recorded now rather than left for rediscovery.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** OPEN, deliberately unresolved. Not a work item unless and until
  per-instance findings make it reachable. Requires an Architecture Owner
  ruling on §9.3's meaning, not a code fix chosen by an implementer.

---

## DEFECT-29 — G-9's `--if-present` made the gate pass vacuously if `test:properties` were removed (found and FIXED 2026-08-29)

Finding: `.github/workflows/ci.yml`'s G-9 step invoked
`npm run test:properties --if-present`. That flag makes `npm run` exit 0 when
the named script does not exist. So deleting `test:properties` from
`package.json` — by accident, by a bad merge, or by someone removing a script
they thought was still the old stub — would leave G-9 **green while running
nothing at all**.

Measured, not assumed:

```
npm run <missing-script>                 -> exit 1   (build fails, correct)
npm run <missing-script> --if-present    -> exit 0   (silent pass, the defect)
```

**This is DEFECT-1's shape.** That entry recorded G-1 as "wired into CI,
always green, verifying nothing"; the pre-Step-8 G-7 was the same, and
DEFECT-17 was the same principle at the validator level — `compute-ruleset-digest.mjs`
could verify an `integrityDigest`, but nothing on the CI path called it, so
G-8 reported CONFORMANT regardless. V-14 closed that by making the check run
where it matters. The principle each of those converges on: **a check that
cannot fail is not a check.** `--if-present` is that failure mode expressed as
a CLI flag.

**Severity: latent, and specifically a gate-integrity defect rather than an
engine defect.** No score, tier, or finding is affected. What is affected is
the trustworthiness of G-9's green — the same category of harm DEFECT-27
records for G-10, one layer up: the signal stops meaning what a reader takes
it to mean.

**Found during B1.5 closure**, while confirming the G-9 wiring ran the real
`test:properties` script rather than the stub it replaced. It was noticed
precisely because the stub had just been replaced — the flag had been harmless
for as long as the script was a no-op `echo`, and became a hole the moment the
script started carrying a real gate.

**Fix:** `--if-present` removed from the G-9 step only. The script now exists
and is REQUIRED to exist; its absence fails the build.

**Deliberately NOT changed — the other `--if-present` in this file.** The
"Unit tests" step (`npm test --if-present -- --coverage`) relies on the
silent-skip genuinely: no `test` script exists in `package.json`, and that
step's own comment records the omission as intentional ("No unit-test suite
exists yet — that's Stage 1b scope... Placeholder that no-ops honestly rather
than failing on a script never meant to exist yet"). Removing the flag there
would fail every build immediately. Verified before editing: `package.json`
has no `test` script, and G-9's step is the only other use. The distinction is
recorded inline in `ci.yml` so the two are not "tidied" into consistency
later.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** RESOLVED 2026-08-29 in `.github/workflows/ci.yml`.

---

## DEFECT-30 — `runAnalysisPass` dispatches Stage 1 twice, minting two sets of `evaluationId`s for one logical pass (found and FIXED 2026-08-29)

Finding: `packages/engine/pass.ts` calls both Stage 1 entry points:

```ts
const evaluations = await assembleEvaluationSet(evidence, storeReader);
const dispatch    = await evaluateAllModules(evidence, storeReader);
```

Each runs the full ten-module dispatch independently, and `evaluateModule`
mints a fresh `evaluationId` per call (`packages/engine/id.ts` —
`randomUUID()`, DEC-15's resolution). So a single logical pass produces **two
distinct sets of ten `evaluationId`s** for the same ten module evaluations.

**Why both calls exist.** They return different things, and both are needed:

- `assembleEvaluationSet` produces the ten complete `SecurityEvaluation`
  envelopes — E-8's unit ("Exactly one evaluation per module per pass"), and
  what a persisted `AnalysisPassResult` references.
- `evaluateAllModules` produces `ModuleDispatchResult`s, which is what Stages
  2–4 actually consume. DEC-15's Stage 2 dependency check established this
  directly: `FindingPath` "MUST resolve against D0.2's FindingsByModule",
  never the surrounding envelope, so predicate matching needs only
  `moduleId` + `result`.

**Currently harmless — stated precisely, not hand-waved.** Nothing downstream
compares an envelope's `evaluationId` against anything else.
`CorrelationFinding.evaluationRefs` is built in `stage3.ts` from the DISPATCH
results (`evaluations[moduleId].evaluationId`), consistently, so findings
reference a coherent set. The envelopes' ids are simply never read by Stages
2–8. All four fixtures produce identical scores and tiers with the duplication
in place.

**The real risk, precisely:**

1. **Cross-reference breakage.** The moment anything correlates a persisted
   `SecurityEvaluation.evaluationId` with a `CorrelationFinding.evaluationRefs`
   entry — which is exactly what
   `spec/Logical-Database-Design-Specification-v1_1.md`'s
   `finding_evaluation: (finding_id, evaluation_id)` join table exists to do —
   the two will not match. Findings would reference evaluationIds that appear
   nowhere in the pass's own persisted evaluations. That is a referential
   integrity failure at the storage layer, not a cosmetic one.
2. **Wasted computation, at minimum.** Every module runs twice per pass. Today
   that is ten extra pure function calls; once `authContext` has a real store
   behind it (A1.3), it is a second store round-trip per pass — against
   §13.4's Tier 2 latency budget (≤200 ms local, ≤1000 ms p95 with backend).
3. **P-13/G-10 exposure is NOT claimed here.** Replay compares a persisted
   Pass Result against a recomputation; since `evaluationId` is a random
   UUIDv4 by design (DEC-15), it can never be reproduced by replay regardless
   of this defect. This entry does not assert a G-10 impact — that is a
   separate, already-known consequence of non-deterministic ids.

**Fix, deliberately OUT OF SCOPE for the commit that introduced this.** The
correct shape is to dispatch once and thread the results into envelope
assembly — `assembleSecurityEvaluation` would take a `ModuleDispatchResult`
rather than re-dispatching internally. That changes `orchestrator.ts`'s public
signature, which is a change to an existing, tested boundary and belongs in
its own commit with its own verification, not folded into the first wiring of
the pipeline. Recorded here at the moment it was introduced rather than
discovered later.

**FIX, 2026-08-29 — the architectural change named above, not a relabelling.**
Stage 1 now runs **exactly once per pass**, threaded rather than duplicated.

Mechanism, precisely:

- `assembleSecurityEvaluation(evidence, dispatch: ModuleDispatchResult)` — no
  longer takes `moduleId` or `storeReader`, and no longer calls
  `evaluateModule` internally. `moduleId` comes from `dispatch.moduleId`.
- `assembleEvaluationSet(evidence, dispatch: Readonly<Record<ModuleId,
  ModuleDispatchResult>>)` — maps over the supplied dispatch one-to-one
  instead of re-dispatching per module.
- **Both became SYNCHRONOUS.** With dispatch threaded in, neither function
  touches the store, so neither needs to be `async` — the signature now states
  what the function actually does rather than carrying a vestigial `Promise`.
- `pass.ts` calls `evaluateAllModules` ONCE and feeds that single result set
  into both envelope assembly and Stages 2-4.

Dispatch count per pass: **20 → 10.**

**POSITIVE PROOF, asserted directly rather than inferred from tests still
passing** (`packages/engine/pass.fixture.test.ts`, all four fixtures): every
`CorrelationFinding.evaluationRefs` entry must be found among the ten
`SecurityEvaluation.evaluationId`s in the same pass's envelopes. Those two
come from opposite ends of the pipeline — `stage3.ts` builds refs from the
DISPATCH results, while the envelopes are built by `assembleEvaluationSet` —
so before this fix they were drawn from two independent dispatches and could
never intersect. Their agreement now IS the duplication being gone, observed
rather than assumed.

The proof was verified to actually fire: reintroducing a second dispatch makes
it fail with
`off-origin-post: finding CRED-01 references evaluationId 67a5192d-…, which is
in NO envelope — Stage 1 dispatched more than once (DEFECT-30)`. Restored and
re-verified green.

A second, narrower assertion covers the single-module level in
`orchestrator.fixture.test.ts`: an envelope's `evaluationId` equals that of the
dispatch it was built from.

**E-8 is now satisfied BY CONSTRUCTION, not empirically.** A single
`evaluateAllModules` call yields exactly one `ModuleDispatchResult` per
`ModuleId`, and `assembleEvaluationSet` maps those one-to-one — no code path in
`runAnalysisPass` can produce a second evaluation for any module. Stated in a
comment at the E-8 assertion, which is retained regardless: a structural
guarantee nothing checks is one refactor away from being untrue.

**All six call sites updated**, none left on the old signature:
`orchestrator.ts` (inside `assembleEvaluationSet`),
`orchestrator.fixture.test.ts` ×4, `e2e.sso-flow.fixture.test.ts` ×1,
`pass.ts` ×1.

One test assertion was RELOCATED rather than deleted, and the distinction
matters: `orchestrator.fixture.test.ts` asserted that two envelope assemblies
produce different `evaluationId`s. Envelope assembly no longer mints ids —
`evaluateModule` does — so the same property is now asserted against two
`evaluateModule` calls, where the behaviour actually lives. Its original
intent, that an id is generated fresh per dispatch and never derived from the
evidence, is intact; two further assertions were added confirming each
envelope faithfully carries its own dispatch's id.

**Zero behaviour change.** All four fixtures unchanged: `clean-login` 0/Low,
`no-credential` 0/Low, `off-origin-post` 45/Medium, `sso-flow` 0/Low. Full
suite green — `tsc -b`, 10/10 module tests, 10/10 engine tests, G-7 7/7, G-8
CONFORMANT, G-9 property tests green.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** RESOLVED 2026-08-29 in `packages/engine/orchestrator.ts` and
  `packages/engine/pass.ts`, with the positive proof in
  `packages/engine/pass.fixture.test.ts`.

---

## DEFECT-31 — `FABRICATION_FORCED_BY_SHAPE`: `Observation<T[]>` cannot express a per-element capability gap, so a producer must assert facts it cannot observe (found 2026-08-29)

Finding: `LoginFormObservation` places runtime-only facts as **plain
non-nullable fields inside an array element**, while the tri-state that would
let a producer decline to answer sits on the array as a whole
(`evidence.contract.v1.ts:215-222`, `:245`):

```ts
export interface LoginFormObservation {
  readonly fields: readonly CredentialField[];
  readonly method: FormMethod;
  readonly actionUrl: string | null;
  readonly actionRegistrableDomain: string | null;
  readonly injectedAfterLoad: boolean;            // <- plain boolean
  readonly injectingScriptOrigin: string | null;  // <- plain union
}

readonly forms: Observation<readonly LoginFormObservation[]>;   // tri-state HERE
```

`injectedAfterLoad` is a runtime observation — whether the form appeared
after `load` fired. A static extractor working from a serialised post-render
DOM cannot know it. **There is no position at which to write
`notCollected`**, and no `NotCollectedReason` applies, because the field is
not an `Observation`.

### Why this is a NEW category, not an instance of DEFECT-15/18/19

Those three are all *"the value is unavailable or ungroundable"* —
DEFECT-19's `initialRegistrableDomain` is permanently `null`, and `null`
reads honestly as "not established".

This is different in kind: **the value is unavailable AND the contract
offers no way to say so**, so the producer must emit a positive truth-claim
it cannot support. `injectedAfterLoad: false` does not read as "unknown"; it
reads as *verified not injected*. That is the exact I-2 failure the contract
warns against in `homograph.ts`'s header — "conflating them silently converts
a capability gap into a clean bill of health" — except here it is **forced by
the contract's own shape**, not chosen by a careless producer.

Naming it: `FABRICATION_FORCED_BY_SHAPE`. The tri-state discipline is applied
at the wrong GRANULARITY — array-level, when the capability gaps are
element-level and per-field.

### The three options, and why option 3 is taken

1. **Emit `false`.** Fabricates. The I-2 conflation above.
2. **Make the whole `forms` observation `notCollected`.** Honest, and
   destroys `fields`, `method` and `actionRegistrableDomain` along with it —
   which kills CRED-01, CRED-06 and CRED-07, the rules the corpus exists to
   validate. Not viable.
3. **Emit `false`, record the limitation out-of-band** via `extractorVersion`
   and a documented convention. **Taken**, because 2 is worse and 1-without-a-
   record is worst.

### Affected fields, verified against the rule set — not assumed

Each consumer below was confirmed by scanning every rule in
`rulesets/rules-v0.1.0.json`, not by recollection.

| Field | Only consumer | Consumer live? |
|---|---|---|
| `injectedAfterLoad` | **CRED-A1** | ❌ [[DEC-14]] non-functional |
| `injectingScriptOrigin` | **CRED-A1** | ❌ [[DEC-14]] non-functional |
| `CredentialField.hidden` | **CRED-07** | ⚠️ **LIVE and corpus-validatable** |
| `CredentialField.autocompleteDisabled` | *(none)* | — |

**`injectedAfterLoad` / `injectingScriptOrigin` — real but NOT urgent.**
CRED-A1 is their **only** consumer (exhaustive scan of all rules; both fields
appear in exactly one rule body). DEC-14, signed 2026-08-25, accepts CRED-A1
as **non-functional for Phase I**. So the fabricated `false` currently
corrupts no live rule — it is latent, and becomes load-bearing the moment
DEC-14 is revisited. Severity is "real but not urgent" for that specific
reason, and for no other: the defect is fully present, only its consumer is
switched off.

⚠️ **`CredentialField.hidden` is the exception, and it is worse than the
other two.** Verified: `loginForm.ts:71` computes
`hasHiddenCredentialField: form.fields.some((f) => f.hidden)`, and CRED-07's
predicate reads `$.hasHiddenCredentialField`. **CRED-07 is live, enabled, and
one of the four rules DEC-26 identifies as fully corpus-validatable.**

`hidden` is only PARTIALLY derivable statically. `type="hidden"`, the `hidden`
attribute and inline `style="display:none"` are all detectable from
serialised markup; **hiding via a stylesheet rule or CSS class is not**,
because `raw.renderedDom` carries markup, not computed styles. Emitting
`false` where the extractor cannot tell means **under-reporting hidden
fields, i.e. false negatives on CRED-07 — measured on the very corpus being
used to establish CRED-07's recall.** That is a measurement-validity problem
for CP-2, not only a contract-shape complaint.

This raises the defect's practical severity above what the CRED-A1 analysis
alone would suggest, and it is recorded here rather than filed separately
because it is the same root cause: a fact the producer cannot fully observe,
with no contractual way to say so.

### Shared pattern: `STATIC_EXTRACTION_RECALL_FLOOR` (named 2026-08-29)

`hidden`'s markup-only derivation is one instance of a pattern that is not
specific to this defect: **static extraction structurally cannot observe some
sophisticated attack techniques that a live browser can.**

| Instance | Technique invisible to static extraction | Rule affected |
|---|---|---|
| `CredentialField.hidden` (here) | CSS/JS-based concealment — stylesheet rules, injected classes, scripted `display:none` | **CRED-07** |
| `confusableSkeleton` ([[DEFECT-23]]) | confusables outside the bounded Cyrillic/Greek core — Armenian, Cherokee, fullwidth | **CRED-03** |

**The bias is one-directional in both cases.** Markup-only `hidden` detection
misses concealed fields but never invents them; the bounded confusable map
misses skeletons but every entry it has is genuine. Neither over-detects.
So both **understate** recall — measured numbers are a **FLOOR** for the
affected attack subtypes, never a true measurement.

The sophistication correlation is what makes this matter rather than being a
rounding error: the attacks these misses hide are precisely the *more*
sophisticated ones. An attacker concealing a credential field through a
stylesheet, or building a homograph from a less common script, is doing
something more advanced than the baseline the corpus will happily measure. So
the error is not merely downward — it is concentrated in the subpopulation a
detection system most needs to be judged on.

⚠️ **Any future CP-2 report of CRED-07's or CRED-03's recall MUST cite this
limitation alongside the number.** Publishing either figure without it would
overstate what the corpus establishes, in the direction that flatters the
system.

### Fix paths (none taken here — this is a contract-shape issue)

1. **Contract amendment** — make the affected fields `Observation<T>` at
   element level. Correct, and touches FROZEN `packages/contracts/`, so it is
   an Annex A amendment by hand, never by tooling.
2. **A per-element capability descriptor** alongside `forms`, saying which
   element fields the producer could actually observe. Avoids re-typing the
   existing fields.
3. **Status quo + convention**, as option 3 above. What ships today.

### Priority — TWO DIFFERENT PRIORITIES, deliberately not averaged

This defect has one root cause and two consequences of very different weight.
Collapsing them into a single severity would either overstate the dead half or
bury the live one, so they are tracked separately.

**🟢 LOW — `injectedAfterLoad`, `injectingScriptOrigin`**

Sole consumer is **CRED-A1** (confirmed by exhaustive scan of every rule in
`rulesets/rules-v0.1.0.json`; both fields appear in exactly one rule body).
CRED-A1 is **[[DEC-14]] non-functional for Phase I**, signed 2026-08-25.

The fabricated `false`/`null` therefore corrupts **no live rule today**. The
defect is fully present — the producer still asserts a runtime fact it cannot
observe — but its only consumer is switched off. Severity is low **for that
specific reason and no other**: not because the fabrication is acceptable, but
because nothing currently reads it. It becomes live the moment DEC-14 is
revisited, and DEC-14's reviewer should be pointed here.

**🟠 TRACKED — REQUIRED CAVEAT — `CredentialField.hidden`**

Consumer is **CRED-07**, which is **enabled, live, and one of the four rules
[[DEC-26]] identifies as fully corpus-validatable**. Verified chain:
`loginForm.ts:71` computes `hasHiddenCredentialField: form.fields.some((f) =>
f.hidden)`; CRED-07's predicate reads `$.hasHiddenCredentialField`.

This is not a latent issue. It has a **measurement-validity impact on CP-2**:
markup-only derivation cannot see stylesheet- or class-based concealment, so
CRED-07's measured recall carries an unquantified false-negative floor,
concentrated in the more sophisticated attacks (see
`STATIC_EXTRACTION_RECALL_FLOOR` above).

**The required caveat is the deliverable here, not a code fix.** Until the
contract shape changes, the obligation is that **CP-2 MUST publish CRED-07's
recall with this limitation cited alongside the number.** A fix would need
either computed-style capture (a CAPTURE-stage change) or the contract
amendment in fix path 1 — neither is in scope tonight, and neither is required
for the caveat to be discharged.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** OPEN, split priority as above — 🟢 LOW for the CRED-A1 pair
  (dead consumer), 🟠 TRACKED with a required CP-2 caveat for `hidden` (live
  consumer, real measurement-validity impact). Recorded BEFORE `loginInterface`
  extraction is written, so the emit-`false` convention is a documented choice
  rather than an accident discovered later.
- **Related:** [[DEC-14]] (CRED-A1 non-functional), [[DEC-26]] (extraction
  scope), [[DEC-27]] (extraction toolchain), [[DEFECT-19]] (the
  ungroundable-value category this is distinguished from), [[DEFECT-23]] (the
  CRED-03 instance of `STATIC_EXTRACTION_RECALL_FLOOR`).

---

## DEFECT-32 — `CredentialField.kind` is heuristic, and its error is BIDIRECTIONAL — it can inflate `credentialFormPresent`, which gates 6 of 11 rules (found 2026-08-29)

Finding: `CredentialFieldKind` is a closed union —
`'password' | 'otp' | 'pin' | 'username' | 'email'` — but nothing in the
captured material declares which one a given `<input>` is. The extractor must
INFER it from `type`, `autocomplete`, `name` and `id` attributes. That
inference is a heuristic, and no part of the contract, the rule set or the
corpus constrains it.

### Why this is filed separately from DEFECT-31, and not folded into it

[[DEFECT-31]]'s `STATIC_EXTRACTION_RECALL_FLOOR` covers `CredentialField.hidden`
and `confusableSkeleton`, whose errors are **one-directional**: markup-only
detection misses concealed fields but never invents them, and the bounded
confusable map misses skeletons but every entry it has is genuine. Because
they only ever under-report, a measured figure derived from them is a FLOOR —
imprecise, but with a known direction, and safe to publish as a lower bound.

**`kind` has no such guarantee. Its error runs BOTH WAYS:**

| Direction | Mechanism | Effect |
|---|---|---|
| **Over-classification** | a non-credential field matched by a name/id pattern — a search box named `user_query`, a hidden `pin` tracking parameter, a newsletter `email` capture | a field is wrongly classified as credential-bearing, so `credentialFormPresent` is **INFLATED** |
| **Under-classification** | a genuine credential field the patterns miss — obfuscated or randomised `name`/`id` (common in kits), a custom widget not using `<input type=password>`, a non-English attribute | a real credential interface is missed, so `credentialFormPresent` is **DEFLATED** |

A floor is a usable number. A figure with unbounded error in **both**
directions is not a floor at all, and must not be reported as one. This is
why it is a separate defect rather than another row in DEFECT-31's table: the
mitigation is different (empirical validation, not a reporting caveat) and the
reporting obligation is different (cannot be published as a bound).

### The stakes — precisely

`credentialFormPresent` is **the single highest-leverage field in the entire
extractor**. Verified by scanning every rule in `rulesets/rules-v0.1.0.json`:

| Rule | Reads `credentialFormPresent` |
|---|---|
| CRED-01 | ✅ |
| CRED-02 | ✅ |
| CRED-03 | ✅ |
| CRED-04 | ✅ |
| CRED-06 | ✅ |
| CRED-07 | ✅ (via `forms[]`, gated on the same classification) |

**Six of eleven rules.** Every rule DEC-26 identifies as fully
corpus-validatable — CRED-01, CRED-03, CRED-06, CRED-07 — is downstream of
this one boolean, and the boolean is downstream of a heuristic.

A misclassification does not degrade one field's precision; it changes whether
the rules fire at all for that snapshot. Over-classification manufactures
false positives across six rules simultaneously; under-classification
manufactures false negatives across the same six. Both corrupt CP-2's
confusion matrix in ways that no per-rule analysis would separate, because the
error is upstream of all of them.

Compounding it: only **76 of 617 snapshots (12.3%)** carry a credential
interface at all ([[DEC-27]] §4). With a credential-bearing negative class of
roughly 14 benign snapshots, a handful of misclassifications is not noise — it
is a material fraction of the measured population.

### ⚠️ Required: EMPIRICAL validation, not design review

**The heuristic must not be assumed correct from its design.** Reading the
patterns and agreeing they look sensible establishes nothing about their
behaviour on real phishing markup, which is adversarial, frequently
obfuscated, and often non-English. The classification rules were written by
reasoning about well-formed login pages; the corpus is largely not that.

**Concrete C1.5-adjacent validation task — a work item, not a note:**

1. Run the completed extractor across a corpus sample.
2. Draw a stratified sample of classified fields — both labels, and
   deliberately including forms where the classifier found NO credential field
   (the under-classification arm is invisible if you only inspect positives).
3. Hand-label each against the rendered markup as ground truth.
4. Report a confusion matrix **for the classifier itself**, per
   `CredentialFieldKind` value, with the over- and under-classification arms
   reported **separately** — a single accuracy figure would hide the
   direction, which is the whole point of this defect.
5. Feed the result into CP-2 as a stated error bound on
   `credentialFormPresent`, not as a footnote.

Step 2 is the part most likely to be skipped and the part that matters most:
sampling only what the classifier flagged measures precision and is blind to
recall.

**Sequencing.** This cannot be done before extraction runs, so it is not a
blocker on building `loginInterface` — it is a blocker on **trusting the
numbers that come out of it.** Recorded now so that it is scheduled, rather
than discovered when CP-2's figures are already circulating.

### ⚠️ EMPIRICAL CONFIRMATION, same day — the over-classification arm is real and measurable

The extractor was built and run across the 617-snapshot store immediately
after this entry was written. **The predicted over-classification appeared at
once, and it is not marginal.**

| | benign | phishing |
|---|---|---|
| `credentialFormPresent = true` | 22 | 85 |
| — has `password`/`otp`/`pin` | 14 | 66 |
| — **`email`-ONLY** | **8 (36% of positives)** | **16 (19% of positives)** |
| — `username`-only | 0 | 3 |

**24 of 107 positives (22%) carry no password, OTP or PIN field at all** — just
an email input. Those are overwhelmingly newsletter signups and contact forms,
not login interfaces.

**The bias falls in the worst possible direction.** It is nearly twice as
concentrated in the BENIGN class (36% of benign positives vs 19% of phishing),
so it inflates precisely the negative class that CRED-01/03/06/07 are measured
against — manufacturing false positives across six rules simultaneously, on a
class that only contains ~14–22 snapshots to begin with.

**Cross-validation, which makes the finding trustworthy rather than an
artifact:** the `password`-bearing counts (14 benign / 66 phishing) match an
independent regex probe run before the extractor existed (14 / 62) almost
exactly. Password detection is sound; the divergence is entirely in the
`email` tier.

**The root question this exposes is semantic, not a coding error.**
`CredentialFieldKind` includes `'email'`, so classifying `<input type="email">`
as an email credential field is contract-CORRECT. What is unsettled is whether
a form containing ONLY an email field constitutes a *credential interface* for
`credentialFormPresent`'s purposes. Nothing in the contract, the rule set or
§7 says. The extractor currently says yes, by taking the contract literally.

**RULED 2026-08-29 (Architecture Owner): option 2 adopted and APPLIED.**
`credentialFormPresent` is now true only if some field has kind in
`{password, otp, pin}`. `email`- and `username`-only forms no longer count.
Implemented in `apps/harness/extract/loginInterface.ts` with the reasoning
recorded at the site.

Re-measured immediately after: `credentialFormPresent` fell from **107 to 80**
across the 617-snapshot store (17.3% → 13.0%), benign from 22 → **14**,
phishing from 85 → **66**. All 24 email/username-only positives were removed;
the password/otp/pin-bearing counts are unchanged, as intended.

The classification of individual fields is UNCHANGED — `forms[].fields` still
records `email` and `username` kinds, so CRED-01 and CRED-07 still see them.
What changed is only the page-level question the boolean answers.

**This narrows DEFECT-32 but does not close it.** The largest measured
instance of over-classification is gone. Two things remain: tier-3 name/id
matching can still over-classify WITHIN the secret kinds (a field named `pin`
that is a postal PIN), and the **under-classification arm is still entirely
unmeasured** — it is invisible from the classifier's own output and needs the
hand-labelling task below.

The three options as they stood when the ruling was made:

1. **Status quo.** `credentialFormPresent` is true for any credential-kind
   field. Contract-literal; over-reports by ~22%.
2. **Require a secret-bearing field** — `password`, `otp` or `pin`. A form
   asking only for an email address is not asking for a credential. Would cut
   benign positives from 22 to 14.
3. **Require ≥2 credential kinds, or one secret-bearing field.** Catches
   username+password and email+password, excludes lone-email, but also
   excludes genuine single-field password prompts (step-two login pages),
   which phishing kits do use.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** OPEN. Not a code defect — the heuristic is the best available
  approach from static markup and no alternative is proposed. What is OPEN is
  the **validation obligation**: until the empirical check above is run,
  `credentialFormPresent`'s error rate is unknown in both directions, and any
  CP-2 figure downstream of it carries that unquantified uncertainty. Distinct
  from [[DEFECT-31]], whose one-directional errors at least yield a publishable
  bound. **The over-classification arm was measured and then RULED ON — see the
  RULED block above: option 2 adopted and applied, `credentialFormPresent`
  now benign 14 / phishing 66, with zero email- or username-only positives
  remaining. The under-classification arm
  remains unmeasured** and needs the hand-labelling task, since it is invisible
  from the classifier's own output.
- **Related:** [[DEFECT-31]] (`STATIC_EXTRACTION_RECALL_FLOOR`, one-directional
  by contrast), [[DEC-26]] (which rules are corpus-validatable), [[DEC-27]] §4
  (the 12.3% population rate that amplifies this).

---

## DEFECT-33 — `readSnapshot`'s unchecked cast asserted `scriptRuntimeObservations: null` over 26,700 snapshots where the key was ABSENT — correct only by an unrelated guard's incidental strictness (found and FIXED 2026-08-29)

Finding: `RawMaterial.scriptRuntimeObservations` is declared `{...} | null`,
and its own docstring states "null for every snapshot captured before this
field existed". **On disk that was false.** Pre-amendment snapshots have no
such key at all, so the runtime value was `undefined`, not `null`.

Verified directly against a real snapshot rather than assumed — `raw` carries
exactly nine keys:

```
dnsRecords, domContentHash, finalUrl, redirectChain, renderedDom,
requestedUrl, responseHeaders, screenshotRef, tlsCertificateChain
```

`scriptRuntimeObservations` is not among them, on any of the 26,700 entries
the committed index describes.

The gap was invisible because `apps/harness/extract/snapshot-store.ts:34` read
the file through an unchecked assertion:

```ts
return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as Snapshot;
```

An `as` cast performs no runtime check. TypeScript therefore believed every
snapshot satisfied the amended contract, and every consumer downstream was
type-checked against a promise the data did not keep.

### Why nothing broke — and why that is the actual defect

Behaviour was correct. `scriptRuntime.ts`'s `isObservations()` guard rejects
`undefined` for the same reason it rejects a malformed object, so extraction
returned `notCollected` and the S-6 tests passed.

**But it was correct because an unrelated guard happened to be strict enough,
not because anything guaranteed it.** Had `isObservations()` been written as a
truthiness check, or had any future consumer read
`raw.scriptRuntimeObservations?.transmissionEndpoints ?? []` and treated the
empty array as an observation, the bug would have surfaced as silently wrong
evidence rather than as an error.

**This is the same shape this project has flagged repeatedly, not a new
pattern** — a check that passes for a reason other than the one it appears to
test:

- [[DEFECT-1]] / the `tsc --noEmit` vacuity: a gate that type-checked ZERO
  files and passed.
- [[DEFECT-17]]: `integrityDigest` had a documented algorithm and nothing
  verified it; a stale digest passed CONFORMANT. Closed by V-14.
- [[DEFECT-29]]: V-15's own first draft reported OK when `version.ts` was
  absent — a green check that had verified nothing.
- [[DEFECT-30]]: E-8 held "in the sense that ten envelopes existed", while
  Stage 1 was dispatching twice.

Each was found by asking *why* something passed rather than *whether* it
passed. This one was found the same way, while enumerating the compile errors
the amendment produced.

### Fix

`readSnapshot` now NORMALISES at the boundary: if `raw.scriptRuntimeObservations`
is `undefined` after parsing, it is set to `null`. Every consumer then sees
what the type promises, and the promise is kept once, in one place.

**Widening the type to `{...} | null | undefined` was explicitly REJECTED.**
That would encode the gap rather than close it, and it would blur "we did not
look" against "we looked and there is nothing" — the exact distinction S-7 and
I-2 exist to keep sharp.

**Present-but-MALFORMED is deliberately left alone.** Only `undefined` becomes
`null`. A key that exists with the wrong shape is a PRODUCER BUG, not a version
gap; it must reach `isObservations()` and degrade to `notCollected` rather than
being quietly rewritten to `null`, which would disguise a broken producer as an
ordinary pre-amendment snapshot.

### Proof, not inference

`apps/harness/extract/read-boundary.test.ts` asserts
`snap.raw.scriptRuntimeObservations === null` **directly on the parsed
snapshot**, over 20 real snapshots.

It deliberately does NOT test through `extractEvidence`: that path returns
`notCollected` whether the normalisation exists or not, so it would pass
either way — precisely the inference this defect is about. The test also
establishes its own premise first, by reading the raw JSON and confirming the
key is genuinely absent (20/20), so it reports honestly rather than asserting
a normalisation with nothing to normalise if the store is ever re-captured.

Negative controls, both confirmed to fire:

| Seeded fault | Caught |
|---|---|
| Revert to the unchecked cast | ✅ "must normalise … not leave it undefined" |
| Normalise malformed input to null too | ✅ "must be left ALONE … so a producer bug stays visible" |

### ⚠️ Residual gap, NOT fixed here

Only the amendment field is normalised. The remaining `as Snapshot` still
asserts the REST of the shape unchecked — a snapshot with a missing
`capturedOn`, a malformed `fetch` record, or a `redirectChain` that is not an
array would still pass unnoticed. A full runtime validator for D0.5 is a
larger piece of work and is deliberately out of scope for this fix.

That gap is the same class as this defect and should be treated as open: the
corpus is an on-disk artifact written by tooling that has changed over time,
and nothing validates it at the point of read.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** FIXED 2026-08-29 in `apps/harness/extract/snapshot-store.ts`,
  proven by `apps/harness/extract/read-boundary.test.ts`
  (`npm run test:readboundary`) with two negative controls. ⚠️ The residual
  whole-Snapshot validation gap above remains **OPEN** and is not addressed by
  this fix.
- **Related:** [[DEC-29]] / [[DEC-30]] (the Tier 1 amendment that exposed it),
  [[DEFECT-17]] and [[DEFECT-29]] (the V-14/V-15 "verified nothing" precedents),
  [[DEFECT-30]] (invariant holding for the wrong reason).

---

## DEFECT-34 — PSL CONFIGURATION divergence: the extractor ran ICANN-only while `capture.py` runs private-domains-included, disagreeing on 32.5% of phishing snapshots — and the V-15 conformance fixture passed anyway (found and FIXED 2026-08-29)

Finding: `tools/capture/capture.py:86-92` constructs its PSL extractor with
`include_psl_private_domains=True`, deliberately and with a documented
rationale. `apps/harness/extract/psl.ts` used `tldts` at its LIBRARY DEFAULT,
which is ICANN-only. The two therefore computed different registrable domains
for exactly the hosting platforms phishing depends on.

```
                                        capture.py            extractor (before)
cancelcardiffbahora.vercel.app   cancelcardiffbahora.vercel.app   vercel.app
qg77.chris-x.workers.dev         chris-x.workers.dev              workers.dev
facebook-qa.blogspot.com         facebook-qa.blogspot.com         blogspot.com
evil1.github.io                  evil1.github.io                  github.io
```

`capture.py`'s own rationale, verbatim, and it is the correct one:

> "Without it every `*.github.io`, `*.web.app`, `*.pages.dev` and
> `*.blogspot.com` host collapses to the platform domain — placing every
> phishing page hosted on that platform, and every legitimate one, into a
> single split. Phishing leans heavily on these platforms, so the ICANN-only
> view produces a badly-grouped corpus."

**Measured blast radius on the 617-snapshot corpus: the two configurations
disagree on 32.5% of phishing snapshots (111/342) and 4.0% of benign
(5/126).** Re-measured after the fix across all snapshots including those
without a DOM: **147 snapshots changed registrable domain**, 19 of which carry
a credential form.

**Two independent consequences, both real:**

1. **`notSameSite` was computed on the wrong notion of "site".** A credential
   form on `evil.vercel.app` posting to `attacker.vercel.app` is cross-domain
   under `capture.py`'s view and SAME-SITE under the extractor's — so CRED-01
   would silently not fire. Same for CRED-05's `transmissionEndpointDomains`
   and CRED-07's action comparison.
2. **The extractor's "site" disagreed with the corpus SPLIT KEY.** `capture.py`
   computes `splitKey = registrable_domain(url)` with private domains
   included. Split independence (D0.5 §3, S-2) was therefore being reasoned
   about on one definition while findings were computed on another.

---

### ⚠️ The meta-defect: the conformance fixture built to prevent this PASSED

This is the more important half, and it is why this is filed separately from
[[DEFECT-33]] despite sharing a family.

`tools/ci/psl-reference.py` called `tldextract.extract()` at **library
defaults**. `psl.ts` called `tldts` at **library defaults**. The fixture
compared them, found agreement, and reported:

```
PSL conformance: LIVE CROSS-CHECK passed — tldts vs tldextract 5.3.0,
5 boundary cases agree, pinned baseline re-validated.
```

Every word of that was true. It was also worthless. Its `user.github.io ->
github.io` assertion recorded what BOTH libraries return at defaults, while
the producer this project actually runs returns `evil1.github.io`.

**The gate verified internal consistency between two things that were both
wrong in the same way.**

### The recurring shape, named

**"A verification mechanism confirms internal consistency between two things
that both happen to be wrong the same way, rather than confirming either one
matches the actual authoritative configuration."**

This is the fourth instance:

| Defect | What was compared | What was never checked |
|---|---|---|
| [[DEFECT-17]] | `integrityDigest` present and well-formed | whether it matched a fresh recomputation |
| [[DEFECT-29]] | V-15 returned "no violations" | whether the extractor it checks even existed |
| [[DEFECT-33]] | types agreed across the codebase | whether the DATA matched the type |
| **DEFECT-34** | tldts-default vs tldextract-default | whether either matched **`capture.py`'s runtime configuration** |

In each case the check was internally coherent and externally ungrounded.

### 📌 STANDING PRINCIPLE for every future gate in this project

> **A conformance check MUST verify against the PRODUCER'S ACTUAL RUNTIME
> CONFIGURATION — never against a second implementation's default, however
> reasonable that default looks in isolation.**
>
> Two defaults agreeing with each other proves only that two libraries ship
> the same opinion. It says nothing about what this system runs. Where a
> producer takes configuration, the check must read or assert that
> configuration explicitly, and must FAIL when it cannot.

Applies to V-1…V-15 and to anything added after them.

### Fix

- **`apps/harness/extract/psl.ts`** — `PSL_OPTIONS = { allowPrivateDomains: true }`,
  pinned to `capture.py:86-92` with a comment forbidding reversion to a
  library default.
- **`tools/ci/psl-reference.py`** — now builds
  `tldextract.TLDExtract(suffix_list_urls=(), fallback_to_snapshot=True,
  include_psl_private_domains=True)`, matching `capture.py` exactly, and
  ECHOES `includePrivateDomains: true` in its JSON output.
- **`psl-conformance.fixture.test.ts`** — asserts `ref.includePrivateDomains
  === true`, so a default-configured oracle FAILS rather than silently
  verifying the wrong question. Its boundary table now leads with four
  PSL-PRIVATE cases chosen because they fail if either side reverts, with a
  comment saying not to "simplify" them back to the ICANN answers.

Three negative controls, all confirmed to fire:

| Seeded fault | Caught by |
|---|---|
| `psl.ts` reverted to default | ✅ boundary assertion |
| **BOTH sides reverted to defaults** — the exact original bug | ✅ boundary assertion (**the old fixture PASSED here**) |
| Only the oracle mis-configured | ✅ the new `includePrivateDomains` assertion |

### ⚠️ Effect on the corpus metrics: NONE, and the reason matters

The full 617-snapshot confusion matrix is **byte-identical after the fix** —
still 9 TP / 0 FP / 57 FN, CRED-06 the only rule firing.

**CRED-01 did not begin firing on any of the 111 previously-miscategorised
snapshots.** Measured directly:

```
credential forms with OFF-SITE action  BEFORE(icann): 0
credential forms with OFF-SITE action  AFTER (fixed): 0
credential forms with NULL action (no <form>)       : 11
```

The reason is [[DEC-28]]'s finding, not this one: **no credential form in the
corpus declares an off-site action at all.** Every action is absent or
relative, so both sides of the `notSameSite` comparison move together — a
relative action resolves against the page URL, so `actionRegistrableDomain`
equals `url.registrableDomain` under ANY PSL configuration.

**So this defect was real, load-bearing, and currently latent.** It would have
corrupted results the moment a form with an absolute cross-platform action
appeared — and on shared hosting, where attacker and victim pages sit on the
same platform suffix, that is exactly the case ICANN-only cannot see. It also
means split-independence reasoning was being done on a different definition
than findings, which no metric would have revealed.

- **Owner:** Unassigned — solo execution, DEC-7 context applies.
- **Status:** FIXED 2026-08-29 in `apps/harness/extract/psl.ts`,
  `tools/ci/psl-reference.py` and
  `apps/harness/extract/psl-conformance.fixture.test.ts`, with three negative
  controls. ✅ **`rulesets/rules-v0.1.0.json`'s `pslVersion` string NOW RECORDS
  the configuration**, as of `409171d`: it reads `tldextract==5.3.0
  include_psl_private_domains=true (bundled snapshot sha256:b693…)`. [[DEC-31]]
  drafted that correction and it was hand-typed into the frozen path by Jayanth
  (Architecture Owner) per [[DEC-7]], with `integrityDigest` recomputed and
  V-14 verified. V-15 gates the configuration clause for free, as DEC-31
  predicted, because it already compares the declaration against the
  extractor's `PSL_RECONCILED_AGAINST` for exact equality.
  *(This line previously read "still does NOT record WHICH configuration … the
  file is frozen, so it is drafted only" — true when written, false from
  `409171d` onward. Corrected rather than left standing.)*
- **Related:** [[DEFECT-17]], [[DEFECT-29]], [[DEFECT-33]] (same pattern
  family), [[DEC-27]] (V-15 and the conformance fixture this corrects),
  [[DEC-28]] (why CRED-01 still does not fire).

---

## DEFECT-35 — `CORPUS_DIR`'s unanchored relative path silently created a second, separate corpus when `capture.py` was run from `tools/capture/` instead of the repo root (found and FIXED 2026-08-30)

Finding: `tools/capture/capture.py:50` declared `CORPUS_DIR = Path("corpus")`
— a plain relative path, resolved against whatever the process's current
working directory happened to be at launch, never anchored to the repo root
or to the script's own location.

A real invocation surfaced it directly: `python capture.py --tranco
..\..\tranco_top10k.csv --limit 20`, run from `tools\capture\` (not the repo
root), silently created `tools/capture/corpus/` — a second, independent
corpus tree with its own `INDEX.jsonl` — rather than writing into the real
`corpus/` at the repo root or erroring. Two prior invocations (one phishing
batch via `--feed openphish`, one benign batch via `--tranco`) landed there
unnoticed: 40 real, live captures — 20 phishing, 20 benign, both tiers
(Tier 1 `scriptRuntimeObservations` and Tier 3 `listenerObservations`)
populated correctly — sitting in a location nobody was checking, simply
because the command was run from the "obvious" directory (`tools/capture/`,
where the script itself lives) rather than the repo root.

**This is the SAME root-cause class as an already-fixed defect, just never
extended to this constant.** `load_feed_urls`'s `tranco` branch already
carries this exact fix and says so in its own comment (`capture.py:967-973`,
verbatim): *"Resolved relative to this script's own location, not cwd —
CORPUS_DIR's cwd-relative path already caused one wrong-location bug this
session; not repeating that pattern here."* That comment correctly predicted
the failure mode by name and then the fix was applied to the CSV path only —
`CORPUS_DIR` itself, the more consequential of the two since every persisted
snapshot and every `INDEX.jsonl` append depends on it, was left exactly as
vulnerable as before.

**No data was lost.** The 40 misplaced snapshots were recovered: verified
zero `snapshotId` and zero destination-path collisions against the real
corpus, moved the `.json.gz` files into `corpus/{phishing,benign}/2026-08-30/`
preserving their date subfolders, appended the 40 `INDEX.jsonl` lines to the
real index (34,447 → 34,487, exactly +40, verified), spot-checked merged
entries' `relativePath` fields resolve to real files (40/40), then deleted
`tools/capture/corpus/` once confirmed empty of anything not yet merged.

**Fix:** `CORPUS_DIR = Path(__file__).resolve().parent.parent.parent /
"corpus"` — anchored to the script's own location exactly as the `tranco`
CSV path already was, so it resolves to the same repo-root `corpus/`
regardless of the caller's working directory. Verified by importing the
module with `tools/capture` as the working directory (the exact scenario
that caused this) and confirming `CORPUS_DIR` still resolves to the repo
root.

**Related:** [[DEC-1]] (the split-v2 identity/collision discipline this
constant underpins), same unanchored-relative-path root cause the `tranco`
CSV branch already fixed for a different variable.

- **Status:** FIXED 2026-08-30 in `tools/capture/capture.py`. Verified with
  `python -m py_compile` and by reproducing the original cwd scenario
  directly. The 40 real captures this bug produced were recovered and merged
  into the real corpus, not discarded.

---

## DEFECT-36 — CI was red for ~4 days (every push failed at G-1 Lint), unnoticed because no local workflow ran the lint gate (found and FIXED 2026-09-01)

**Finding.** GitHub Actions `CI` failed on every push from 2026-08-28 through
2026-09-01 — 42 consecutive failed runs — while local development continued
against a working tree that was never linted. The failing gate was **G-1 Lint
(eslint)**, which runs FIRST in the CI job and fails fast, so no later gate
(typecheck, architectural G-2/G-3, dependency-cruiser, tests) even executed:
the whole pipeline read red on the strength of one un-run gate, and a red run
proved only that eslint failed — nothing about the health of anything behind it.

**Evidence (Actions run history, verified via `gh run list` / `gh run view`):**
- Last GREEN run: `33191027034`, commit `0c4e987`, 2026-08-28T16:39.
- First RED run: `33191063644`, commit `f3520ea` (the commit IMMEDIATELY after
  `0c4e987`), 2026-08-28T16:40 — failing step confirmed `G-1  Lint`.
- Red window: 2026-08-28 → 2026-09-01, 42 failed runs, all at G-1 Lint.
- Fixed by `8a68e1a` (G-1) + `4e3726e` + `87630b1`; `verify:all` exits 0 on
  `main` at `87630b1`, CI green on that commit 2026-09-01.

**Two corrections to the finding as originally described to me ("red since
0c4e987, unnoticed for months"):**
1. `0c4e987` was the **last GREEN** commit, not the first red one. Red began at
   `f3520ea`, the next commit — so the honest phrasing is "red since `f3520ea`."
2. The red window was **~4 days** (2026-08-28 → 2026-09-01), **NOT months** —
   the first-failing commit is only four days older than the fix. Both
   corrections are recorded rather than parroting the original framing.

**Root cause.** eslint's ignore list carried `dist/**`, which does NOT match the
NESTED build output `apps/extension/dist/**`; eslint therefore linted the built
browser bundles and raised 38 spurious `no-undef` errors, plus a handful of real
source lints (unused catch binding, control-regex, useless-escape). CI enforced
the gate, but no local workflow ran `npm run lint`, so the failures were
invisible to the implementing sessions — the "CI enforces what local never runs"
gap, made worse by a first-position fail-fast gate that masks the true state of
every gate behind it.

**Owning step.** CI configuration / G-1 (`.github/workflows/ci.yml` Lint step;
`eslint.config.js`).

**Impact.** For ~4 days "is `main` green?" was unanswerable from CI. Because G-1
fails fast, the determinism/architecture gates (G-2/G-3), dependency-cruiser
(G-4/G-5), and the whole test suite were effectively **un-observed** across the
window — not known-passing, not known-failing, just never reached.

**Fix / status.** FIXED 2026-09-01. eslint ignore corrected to `**/dist/**`;
browser/webextension globals scoped to `apps/extension/**` only (engine config
untouched, so G-3's "engine is provably free of chrome/window/document" claim is
preserved); real source lints fixed at source, no suppressions. `verify:all`
exits 0 on `87630b1`.
- **Status:** FIXED (fix landed on `main`, CI green, `8a68e1a`/`4e3726e`/`87630b1`).
  **Preventive control now CLOSED (2026-09-02):** a git `pre-commit` lint gate
  runs eslint (CI's `--max-warnings=0` strictness) on the staged lintable files
  at commit time and blocks the commit on any error — `tools/hooks/pre-commit-lint.mjs`
  (logic), `tools/hooks/pre-commit` (git entry), `tools/hooks/install.mjs` +
  package.json `prepare` (activates `core.hooksPath` on clone). Node/.mjs, not
  shell, per DEFECT-8's fail-closed reasoning. **This control would have caught
  `f3520ea` at commit time — blocking it locally — instead of the break
  surfacing only in CI 4 days and 42 red runs later.** Verified end-to-end:
  a staged unused-var violation was blocked (no commit created); the clean
  hook commit itself passed the gate.

---

## DEFECT-37 — `resolveFindingPath` split only on the FIRST dot, so CRED-02's nested finding paths silently resolved to `undefined` (latent; unmasked and FIXED 2026-09-02 by the authContext read-path wiring)

**Finding.** `packages/engine/stage2.ts`'s `resolveFindingPath` resolved a
`FindingPath` by taking everything after the FIRST `.` as a single object key:
`findings[path.slice(dot + 1)]`. For a two-level path (`url.registrableDomain`)
that is correct. For CRED-02's **three-level** paths —
`authContext.bestCrossOriginMatch.similarity` and
`authContext.bestCrossOriginMatch.registrableDomain` — it looked up
`findings['bestCrossOriginMatch.similarity']` (a key that does not exist) and
returned `undefined`. The `gte`/`notSameSite` operands then saw a non-number /
non-string and returned `noMatch`, so the CRED-02 `and` never matched.

**Why it was latent (never observed until now).** CRED-02 is the only rule with
a nested finding path, and it reads `authContext` — which was **always
unevaluable** because the extension's `collectLoginInterface` returned
`fingerprint: notCollected`. The `requiredModules` pre-check (§15.2) short-
circuited CRED-02 to `unevaluable` before the predicate was ever evaluated, so
the broken path resolution was never reached. Wiring the read-path fingerprint
(this session) made `authContext` evaluable for the first time and immediately
exposed it: CRED-02 evaluated, but its predicate could not read its own inputs.

**Evidence.** With the fingerprint wired, a direct `AuthStore.lookup` returned a
correct `bestCrossOriginMatch` (similarity 1.0) and the engine's `authContext`
evaluation showed the same nested object — yet `runAnalysisPass` fired `[]`.
Tracing the predicate showed `resolveFindingPath('authContext.bestCrossOriginMatch.similarity')`
returning `undefined`. The contract intends nested paths: `FindingPath` is
`` `${ModuleId}.${string}` `` (dots allowed in the tail) and
`tools/ci/validate-ruleset.py` V-2 explicitly whitelists
`authContext.bestCrossOriginMatch.{origin,registrableDomain,similarity}` — so
the ruleset was valid and the runtime resolver was wrong, not the reverse.

**Owning step.** Stage 2 predicate evaluation (`packages/engine/stage2.ts`).

**Impact.** CRED-02 — "no other rule reads the Authentication History Store",
the platform's strongest zero-hour impersonation signal — could not have fired
against ANY input, even with a correct store and a wired fingerprint. A silent
false negative on the whole rule, hidden behind an unrelated unevaluable module.

**Fix / status.** FIXED 2026-09-02. `resolveFindingPath` now walks the dotted
tail segment by segment over the findings object; a `null`/`undefined`
intermediate is returned as-is (a genuine `null` `bestCrossOriginMatch` yields a
`noMatch`, never an unevaluable module). Two-level paths are unchanged (one
segment), so no other rule's behavior moves; `verify:all` green. Proven firing
end-to-end by `tools/conformance/cred02-live-path.test.ts` (positive ESTABLISHED
impersonation fires; PROVISIONAL-only, no-credential-form, version-mismatch, and
cold-start all correctly do not).
- **Status:** FIXED.
