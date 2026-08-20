# SecureSphere X — How to Actually Start Coding
### Weeks 1 and 2 · Revision 3 · the only document you need open

Every step says **who**, **which plan task**, **what to type**, and **a check that can fail**.

> **Revision 3 changes.** Restructured into three parallel lanes so capture starts on day 1 rather than day 3. Rewritten for VS Code + Claude Code. Step 1 is now *sign* `DECISIONS.md`, not write it. New Step 6 applies the contract amendments. Three wrong section citations fixed. The tag criterion was circular and is fixed. Seven checks that could not fail were replaced.

---

# READ THIS FIRST — three lanes, not one sequence

The steps are numbered, but **they are not a queue.** Three streams run at the same time and only one of them needs the laptop.

| Lane | Who | Steps | Needs the laptop? |
|---|---|---|---|
| **A — build** | Jayanth then Varun | 0, 1, 3, 4, 5, 6, 7, 8 | **Yes** |
| **B — capture ⏰** | Durga, **on her own machine** | 0, **2**, 11, 13, 15 | No (own machine) |
| **C — off-laptop** | Jayanth · Varun | 9, 10, 14 | No — browser and writing |

**Lane B has a clock. Lanes A and C do not.** Phishing URLs die within hours; `capture.py`'s own header says *"a day not captured is positives that cannot be recovered."* A scaffold built on a bad day gets rebuilt. Two lost days of positives never come back.

> **If you can only do one thing today, do Step 2.**
> The only thing standing in front of it is `DEC-1` in Step 1. Answer that first, then start capture, then do everything else.

### What lands when

| | Week 1 | Week 2 |
|---|---|---|
| **Jayanth** | Sign decisions (1) · `CLAUDE.md` (3) · hook (4) · pipeline note (9) | Architectural gates (12) · approve rule set (11) · adjudicate spike (10) |
| **Varun** | Scaffold (5) · amendments (6) · `BASELINE.md` (7) · fixtures (8) | CI gates (12) · capability spike (10) · fingerprint note (14) |
| **Durga** | **Capture running day 1** (2) | Rule set (11) · report + migration + `G-11` (13) · start `url` (15) |

---

# STEP 0 — Machine setup (everyone, 45 min, once)

You have VS Code and Claude Code. Six things are still missing, and each one stops a later step dead.

### Lane A — the build laptop

```bash
node --version      # must be 22.x — ci.yml pins Node 22. Anything else and
                    # local behaviour diverges from CI in ways nobody debugs.
jq --version        # REQUIRED. Step 4's hook parses JSON with jq.
                    # No jq = the hook fails and you will think it worked.
git --version
```

Install anything missing before continuing. **`jq` is the one people skip.**

Then:

1. Make a folder `securesphere-x`, and inside it a folder `spec`
2. **Copy all 46 specification files into `spec/`**
3. **Create the GitHub repository now** and add it as a remote. Step 12 sets up GitHub Actions, and Actions do nothing without a remote — you will not find out until week 2 otherwise.
4. Open the folder in VS Code: **File → Open Folder → `securesphere-x`**
5. Open the integrated terminal: **`Ctrl+`` ** (Windows/Linux) or **`Cmd+`` ** (Mac)
6. Run `claude`
7. Run `/terminal-setup` once — this makes `Shift+Enter` insert a newline instead of sending. Long prompts are painful without it, and every prompt in this document is long.

**Two things about working in VS Code that are worth knowing now:**

- **Plan mode.** Claude writes the plan as a markdown document VS Code opens for you to review, and changes nothing until you approve. Steps 5, 7 and 11 tell you to plan first — use plan mode for those.
- **`@` file references.** Type `@` in the prompt to pick a file by fuzzy search instead of typing a path. Faster, and it does not silently mistype a filename.

### Lane B — Durga's machine

```bash
python3 --version
pip install playwright httpx
playwright install chromium     # capture.py will not run without this
jq --version
```

Also download **`tranco_top10k.csv`** from the Tranco list site — Step 2 passes it to `--tranco` and nothing in the repo provides it.

**Check before Step 2:** find out whether PhishTank currently requires a registered API key for its download endpoint. If it does and you don't have one yet, **start with OpenPhish and add PhishTank when the key arrives.** Do not let a registration form cost you day 1.

### Lane C — Varun's browser

Chrome with **developer mode** enabled (`chrome://extensions` → Developer mode on). Step 10 loads an unpacked extension.

### What the folder looks like after Steps 0–4

```
securesphere-x/
├── CLAUDE.md               ← Step 3. Loads every session.
├── DECISIONS.md            ← Step 1. The eight signed decisions.
├── .claude/
│   ├── settings.json       ← Step 4. Committed. Holds the hook.
│   ├── hooks/
│   │   └── block-frozen.sh ← Step 4. The hook script itself.
│   └── settings.local.json ← personal, gitignored
├── .gitignore
└── spec/                   ← 46 specification files. Read-only. Committed.
```

Everything else — `packages/`, `apps/`, `tools/`, `rulesets/`, `corpus/`, `fixtures/`, `docs/` — is created in Step 5 from `Stage0-Completion-Pack.md` §1. **You do not design it.**

---

# STEP 1 — Sign the decisions (Jayanth, ~2 h) ⚠ DO THIS FIRST

`DECISIONS.md` Revision 3 already contains eight decisions with evidence and rationale. **Your job is to read, agree or amend, sign and date — not to write them from scratch.** Budget two hours, not ninety minutes: three of them change frozen contracts.

Copy `DECISIONS.md` into the repo root. Then work through it in this order:

| | Decision | Must close before | Why it is urgent |
|---|---|---|---|
| **1** | **`DEC-1`** corpus storage | **the first commit and the first capture** | **Blocks Step 2 and Step 5.** Not revisitable after the first capture — switching to LFS later means rewriting git history or losing everything captured so far. |
| **2** | **`DEC-5`** `ssl`/`dns` stubs | Durga plans her Stage 1 | Releases the 2.0 person-days between 41.5 required and 41.9 available. **Refuse it and the six-week schedule does not fit.** |
| **3** | **`DEC-2`** dotted filenames | Step 5 | Wrong and `tsc` fails on the first commit. |
| **4** | **`DEC-8`** PSL placement | Step 11 | Adds `pslVersion` to `RuleSet`, so the rule-set file's shape depends on it. |
| **5** | **`DEC-3`** five contract questions | the `v1.0.0` tag | Three of the five change frozen contract types. Cheap now, a full consumer sweep later. |
| **6** | **`DEC-4`** the `G-8` name | Step 13 | Two CI steps otherwise share one name and a red build cannot be attributed. |
| **7** | **`DEC-7`** Implementer = accountability | week 3 | Batch-generating modules is a §2 violation under the other reading. |
| **8** | **`DEC-6`** review is not a release | week 5 | Keeps the replay gate and the missing schema generator out of scope. |

**`DEC-9`** — who owns `B1.5`, the property tests — is deliberately still open. It is due week 4, not now.

**Check — each of these is an artefact, not an opinion:**

- [ ] `DEC-1`: `.gitignore` names `corpus/**` with an exception for `corpus/INDEX.jsonl`, **or** `.gitattributes` exists. One or the other exists on disk.
- [ ] `DEC-5`: the word **signed** or **refused**, with a date.
- [ ] `DEC-3`: five answers, each a yes/no plus one line of reason.
- [ ] `DEC-8`: a decision recorded before anyone opens `rules-v0.1.0.json`.
- [ ] Your name and a date at the bottom.

> **The failure this prevents.** A `.gitignore` line that quietly excludes `corpus/` *is* `DEC-1` being decided by accident, in the worst direction, by someone who did not know they were deciding it.

---

# STEP 2 — Start collecting data (Durga, ~1.5 days) ⏰ DAY 1, OWN MACHINE

**This is the only step with a clock. Start it the moment `DEC-1` is answered.**

Copy `capture.py` and `migrate_split_v2.py` from `spec/` into `tools/capture/`. You do not need the scaffold to exist yet — this runs on Durga's machine, on Python, independently.

**Prompt 1 — the one unwritten function:**

```
Read tools/capture/capture.py in full. Also read spec/snapshot_format_v1.ts,
the D0.5 Snapshot Format it produces.

There is exactly one unwritten function: load_feed_urls(), at the
NotImplementedError on line 383. Everything else in the file works.

Plan first, write nothing yet. Write load_feed_urls() so it pulls from
PhishTank and OpenPhish and returns, per URL:
  - the url
  - the feed's own record id
  - the feed's verification flag, if the feed has one
  - the report date
  - the brand being impersonated

That last field becomes LabelProvenance.impersonatedBrand. Without it CRED-02
can never be validated, and it cannot be added later — the feed entry will
have rotated out.

When it runs, also report what FRACTION of the first 200 entries carry a
non-null brand. PhishTank supplies it "frequently", not always, and the field
is `string | null`. That fraction IS the size of CRED-02's entire future
validation set, and it is a week-1 finding, not a week-5 surprise.
```

**Prompt 2 — gzip, per `DEC-1`. This is six sites, not one line:**

```
Per DECISIONS.md DEC-1, snapshots are written gzipped. This is a SIX-SITE
change and two of the sites are in a different file. Apply all six:

  capture.py            320  filename -> f"{snapshot['snapshotId']}.json.gz"
  capture.py            321  path.write_text(...) -> gzip.open(path,'wt',encoding='utf-8')
  capture.py            337  rglob("*.json") -> rglob("*.json.gz")
  capture.py            338  path.read_text() -> gzip.open(path,'rt',encoding='utf-8').read()
  migrate_split_v2.py   162  rglob("*.json") -> rglob("*.json.gz")
  migrate_split_v2.py   176  read -> decompress
  migrate_split_v2.py   207  WRITE-BACK -> recompress

Line 207 is the one a partial fix misses. migrate_split_v2.py rewrites
snapshots after reassignment. Read compressed and write uncompressed and you
get a mixed corpus that every later glob half-reads.

Show me each edit before applying it.
```

**Then run it:**

```bash
python tools/capture/capture.py --feed phishtank --once --limit 25
```

Read the output. Record actual bytes per snapshot — `DEC-1`'s 120 GB disk estimate is an upper bound that needs replacing with a measurement. Then:

```bash
python tools/capture/capture.py --feed phishtank --poll 30      # leave running
python tools/capture/capture.py --tranco tranco_top10k.csv      # negatives
```

### Check — three things, all falsifiable

1. **A real brand name appears in `provenance.impersonatedBrand`** on at least one snapshot, **and** you can state the non-null fraction across the first 200. "At least one" is not enough — one lucky entry tells you nothing about the set.
2. **The gzip globs were updated.** Run `--report` after the first gzipped capture:

   ```bash
   python tools/capture/capture.py --report
   ```

   > **The failure signature is the literal string `Corpus is empty` appearing when you know you captured something.**
   > **Do not check the exit code.** Both `capture.py` and `migrate_split_v2.py` return **0** on an empty corpus, so any scripted check passes. And on day 1, "corpus is empty" is a *believable* message — that is exactly the window in which a broken glob survives. Read the output with your eyes.
3. **The poll is still running.** Do not stop it.

---

# STEP 3 — Give Claude Code its memory (Jayanth, 30 min)

Claude Code forgets everything between sessions unless it is in `CLAUDE.md`.

```
Read spec/Stage0-Completion-Pack.md sections 1, 2 and 3, and spec/MANIFEST.md.

Create CLAUDE.md at the repo root. Under 100 lines — it loads every session,
so only things that are always true.

It must state:
- What this project is, in two sentences
- The repository layout from Stage0-Completion-Pack §1
- The package dependency matrix from §2, as a table
- That packages/engine must never reference chrome.*, window, document,
  localStorage, or any DOM or browser API (§2.1) — the most important rule
- That nothing imports the Authentication History Store implementation;
  access is only via the AuthStoreReader / AuthStoreWriter interfaces (§2.2)
- That packages/contracts is FROZEN, and that DECISIONS.md records the
  amendments applied before the v1.0.0 tag
- Node 22 is required (ci.yml pins it)
- The CI gate list from §3 — one line each. Note two corrections:
    * G-8 is the RULE-SET validator. The contract-conformance check is G-11
      (DECISIONS.md DEC-4).
    * G-8 runs THIRTEEN static checks V-1..V-13, not twelve. §3 still says
      twelve; ruleset_format_v1.ts defines V-13.
- IMPORTANT — three different things share G- names. Always say which:
    * CI gates G-1..G-10 and G-11 (Stage0-Completion-Pack §3, ci.yml)
    * Store poisoning guards G-01..G-05 (Specification §20.6) — two digits
    * Governance rules G-3, G-4, G-5 (MANIFEST §6) — NOT the CI gates
- That spec/ holds 46 files but two of them (SecureSphereX-Audit-Report.md,
  SecureSphereX-Security-Architecture.md) are audit OUTPUT, not specification.
  Do not treat them as normative.
- Where the specs live (spec/) and to read the relevant section on demand

Do NOT paste large spec files into CLAUDE.md. Reference them.
```

**Check:** under 100 lines · names the engine-is-browser-free rule · warns about the three `G-` namespaces · says `V-1..V-13` and `G-11`.

---

# STEP 4 — Lock the files that must never change (Jayanth, 30 min)

`CLAUDE.md` is *advice* — Claude weighs it and can be talked out of it three weeks from now. A **hook** runs before every tool call and refuses. It cannot be argued with, because the harness runs it, not the model.

```
Create the hook infrastructure.

1. Create .claude/hooks/block-frozen.sh — a bash script that:
   - reads the PreToolUse JSON from stdin
   - extracts the path with: jq -r '.tool_input.file_path'
   - if the path is under packages/contracts/, or under spec/, or matches
     d0_*_schema.json, print the reason to STDERR and exit 2
   - otherwise exit 0

   EXIT CODE 2 IS THE ONLY CODE THAT BLOCKS. Exit 1 is a non-blocking error
   and the edit proceeds anyway. Use 2.

   The stderr message must read:
     "Frozen artifact. Contracts are amended by hand per DECISIONS.md Annex A,
      never by Claude Code. Generated schemas are never hand-edited.
      spec/ is the read-only audited baseline."

   Then: chmod +x .claude/hooks/block-frozen.sh

2. Create .claude/settings.json wiring it as a PreToolUse hook with
   matcher "Write|Edit|NotebookEdit", using exec form:
       "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-frozen.sh",
       "args": []

3. Create .gitignore covering: node_modules, dist, build, .env,
   .claude/settings.local.json, spike/
   Do NOT ignore spec/ — the specifications are committed.
   Do NOT ignore docs/ — the design notes and manifest are committed.
   Handle corpus/ per DECISIONS.md DEC-1.

4. git init, add the remote from Step 0, first commit.

Show me settings.json and block-frozen.sh before writing them.
```

**Then test it. This matters more than writing it:**

```
Try to add a comment line to spec/MANIFEST.md
```

`spec/MANIFEST.md` exists from Step 0, so a refusal proves **the hook fired** rather than the file simply being missing. Testing against a path that does not exist yet tells you nothing.

**Check:**
- [ ] Claude Code **refuses** and shows your stderr message.
- [ ] `/hooks` lists the hook under **Project Settings**. (The `/hooks` menu is read-only — it is a verification tool, not an editor.)
- [ ] If it edited the file instead: check `jq` is installed, check the script is `chmod +x`, check you used exit **2** not 1. Then `git checkout` the file and fix it before anything else.

> **Why this specific protection.** The five `d0_*_schema.json` files were adopted by digest because the tool that generated them is missing. Edit one and there is no correct way to restore it. The hook is the only thing between a routine session and losing an artifact nobody can rebuild.

---

# STEP 5 — Build the empty project (Varun, ~2 days) — `A0.1`

Nothing to design. It is in the spec. **Use plan mode.**

```
Read spec/Stage0-Completion-Pack.md sections 1 and 2 in full.

Plan first, write nothing yet. Show me a plan to create the monorepo exactly
as §1's tree specifies: packages/contracts, packages/engine, apps/extension,
apps/harness, tools/capture, rulesets, corpus, fixtures. Also create docs/.

Requirements:
- TypeScript, npm workspaces, Node 22 — add "engines": { "node": ">=22" }
  to package.json, because ci.yml pins Node 22
- tsconfig with strict, noUncheckedIndexedAccess, noUnusedLocals,
  verbatimModuleSyntax
- Copy the six .ts contract files from spec/ into packages/contracts/,
  renamed to DOTTED names per DECISIONS.md DEC-2:
      evidence_contract_v1.ts    -> evidence.contract.v1.ts
      evaluation_contract_v1.ts  -> evaluation.contract.v1.ts
      ruleset_format_v1.ts       -> ruleset.format.v1.ts
      passresult_contract_v1.ts  -> passresult.contract.v1.ts
      snapshot_format_v1.ts      -> snapshot.format.v1.ts
      boundary_interfaces_v1.ts  -> boundary.interfaces.v1.ts
  The first four are fixed by existing import statements. The last two are
  imported by nothing, so their names are chosen — use exactly these.
- Root package.json MUST define these three scripts, because ci.yml calls
  them by exact name and the build fails without them:
      test:fixtures
      test:properties
      validate:ruleset
  Stub them for now so they exit 0 with a message. Steps 8 and 11 implement
  test:fixtures and validate:ruleset.
- packages/engine: create the folder, leave it empty, no browser APIs ever

Do NOT copy the d0_*_schema.json files into packages/contracts. They are
consumed by openapi.yaml (13 $ref references) and by nothing in the
TypeScript build. Leave them in spec/.

Show me the plan.
```

Read the plan. If it is right, say `go ahead`. Then:

```
Run: npx tsc --noEmit
Show me the output. Fix any errors and re-run until it returns zero.
```

**Check:**
- [ ] `npx tsc --noEmit` prints nothing
- [ ] `ls packages/contracts/*.ts` returns **six** files, all dotted
- [ ] `npm run test:fixtures` runs (as a stub)
- [ ] `git ls-files packages/contracts` shows them tracked

**If this passes day 3, stop and hand it to Jayanth.** That is `BN-1` in the plan and it is a rule, not a suggestion — two of three people are blocked while it drags.

---

# STEP 6 — Apply the contract amendments (Varun, ~3 h) — **BY HAND**

`DEC-3` and `DEC-8` change six things in the contracts. **`DECISIONS.md` Annex A gives the exact text and every edit site. Follow it literally.**

### Why you type these yourself

The Step 4 hook blocks **Claude Code** from writing to `packages/contracts/`. It does not block **you** — editing a file in the VS Code editor does not go through Claude Code's tools, so no hook fires. That asymmetry is the design: amendments are a deliberate human act against a frozen artifact, recorded in `DECISIONS.md`, not something a session does in passing.

**Do not disable the hook to let Claude do it.**

### Order matters

| | Amendment | File | Scope |
|---|---|---|---|
| **A-1** | `B-14` subscription invariant | `boundary.interfaces.v1.ts` | comment |
| **A-2** | `get()` in-memory constraint | `boundary.interfaces.v1.ts` | comment |
| **A-3** | Brand four ID types | 4 files | **23 sites** |
| **A-4** | Brand `DayStamp` | 3 files | 8 sites |
| **A-5** | `FetchRecord` discriminated union | `snapshot.format.v1.ts` | 1 type |
| **A-6** | `RuleSet.pslVersion` | `ruleset.format.v1.ts` | 1 field |

**A-3 before A-4** — A-3 adds an import line to `passresult.contract.v1.ts` that A-4 extends.

### Two things that will catch you out

**`passresult.contract.v1.ts` cannot see `evidence`'s exports.** It imports only `evaluation` and `ruleset`. A-3 and A-4 both put shared types in `evidence` and both touch `passresult`, so **A-3 adds one new import line.** It is acyclic — `evidence` imports nothing — and it is the only new cross-module edge.

**A-3 is 23 sites, not four declarations.** 22 field and parameter positions **plus `createSession(...): Promise<string>` at `boundary.interfaces.v1.ts` line 210.** That one is invisible to a search for field names, and it is the *producer* of every session ID — leave it unbranded and the brand never enters circulation, so every downstream site takes a cast instead of a value.

### Verification — run all five

```bash
npx tsc --noEmit
# must print nothing

grep -rn "readonly \(analysisSessionId\|targetResourceId\|passResultId\|findingId\): string;" packages/contracts/
# must return NOTHING

grep -rn "readonly \(evaluatedOn\|capturedOn\|firstSeenOn\|lastSeenOn\|reportedOn\|extractedOn\|assignedOn\|frozenOn\): string" packages/contracts/
# must return NOTHING

grep -n "createSession" packages/contracts/boundary.interfaces.v1.ts
# must show Promise<AnalysisSessionId>

grep -n "pslVersion" packages/contracts/ruleset.format.v1.ts
# must show the field
```

> **Checks 2 and 3 returning nothing is the pass condition.** A clean `tsc` does **not** prove the amendment landed — an unbranded field compiles perfectly well. Only the greps prove it.

---

# STEP 7 — Record what you built against (Varun, 20 min)

```
Create packages/contracts/BASELINE.md.

Three columns per contract file:
  - the digest of the ORIGINAL in spec/ (underscore name)
  - the digest AFTER the Annex A amendments (dotted name)
  - which amendment IDs were applied between them

Compute both with md5sum. Do not invent them; run the command.

Then add the two-rollup block from DECISIONS.md, recomputing spec/'s own:

  cd spec && for f in $(ls -1 | sort); do echo "$f"; md5sum "$f" | cut -d' ' -f1; done | md5sum

Record the method line alongside it. A digest without a stated method is not
a digest.

Add at the top: these are the frozen versions this build was made against;
any further change is a contract change requiring Architecture Owner review.
```

**Check:** six contract files, **two digests each**, and the `spec/` rollup recomputed — not copied from `DECISIONS.md`.

> **If the recomputed `spec/` rollup does not match the one in `DECISIONS.md`, stop.** Your `spec/` is not the same 46 files. That has already happened once on this project: three provisioned copies of the corpus disagreed. Find out which one you have before building on it.

---

# STEP 8 — Make the test pages (Varun, ~1 day) — `A0.2`

```
Read spec/evidence_contract_v1.ts in full — the D0.1 Evidence Contract.
Pay attention to the Observation<T> type at line 61.

Create four fixtures in fixtures/, each a SecurityEvidence object that
typechecks:

  1. clean-login.json     — ordinary same-site login, nothing suspicious
  2. off-origin-post.json — login form posting to a different site
  3. no-credential.json   — no credential field at all
  4. sso-flow.json        — an SSO redirect flow

CRITICAL — the three states are not interchangeable:
  present      -> the value exists; include it
  absent       -> we LOOKED and there was genuinely nothing there
  notCollected -> we COULD NOT look, plus a reason from NotCollectedReason

The contract itself says it: "absent is a positive finding. notCollected is
a capability gap." Use whichever is TRUE for that fixture. A clean login page
legitimately has many 'absent' fields — no redirect chain, no hidden
credential field. Marking those notCollected would claim we failed to
observe something we observed fine.

Never use null as a substitute for any of the three.

Then implement the test:fixtures npm script (stubbed in Step 5): load each
fixture, typecheck it, serialize it, confirm the output is byte-identical to
the input.
```

**Check:**
- [ ] All four round-trip identically and `npm run test:fixtures` passes
- [ ] **At least one fixture uses `absent`**
- [ ] **At least one uses `notCollected` with a reason from `NotCollectedReason`**
- [ ] **`clean-login.json` uses `absent` for its redirect chain**, not `notCollected`

> The last three matter because a fixture set that used `notCollected` everywhere round-trips perfectly and is wrong. Round-tripping tests the serializer. These test the semantics.

---

# STEP 9 — Agree how the engine fits together (Jayanth, ~0.75 day) — `B0.3`

Skip this and Varun and Durga build against different assumptions for two weeks.

```
Read spec/SecureSphereX-RuleEngine-Spec-v0_8.md sections 2.6, 4 and 5.1.

Write docs/pipeline-design-note.md, one page, plain language:

- The eight pipeline stages (§4.1), each with what it takes in and gives out.
  The order is architecturally frozen — say so.
- The ten evaluation modules (§2.6 register) and the one interface every
  module implements. Include which module serves which rules, and note that
  ssl and dns serve none — that is why DEC-5 stubs them.
- Where refinements R-01 to R-04 are applied: Stage 2, and ONLY Stage 2
  (§5.1). Never inside a module, never after Stage 2.
- What a module is forbidden from doing: no membership tests (R-02's
  executable set and R-03's sensitive-permission set are Stage 2 concerns,
  §2.6), no correlation with other modules, no network, no store access
  except the ACEM.

Varun and Durga must be able to build against this without asking follow-up
questions.
```

> **Section note:** refinements are §5, not §3. The spec's own frozen-list entry cites **§2.6 and §5.1** for exactly this point. §3 is the tier model and you do not need it here.

**Check — not "we agreed":** Varun and Durga each write down, **without looking at the note**, what a module receives, what it returns, and where refinements are applied. Compare against the note. A disagreement costs an hour now and a rewrite in week 3.

---

# STEP 10 — Find out what the extension can actually see (Varun, ~1 day, week 2) — `A0.4`

**Claude Code cannot answer this.** Nobody knows what your extension can observe until you try it on real pages. Guessing wrong here permanently misroutes which rules can be validated offline.

```
Read spec/evidence_contract_v1.ts and note every field it defines.

Build a throwaway MV3 extension in spike/. It should run on every page,
attempt to populate every field in the D0.1 contract, log for each whether
it got a real value or could not observe it, and dump JSON per page.

Do not make it elegant. It exists to find out what is observable.
```

Load it unpacked in Chrome and visit these ten, saving the JSON each time:

| # | Page | Watch for |
|---|---|---|
| 1 | Google SSO login | cross-origin form behaviour |
| 2 | Microsoft SSO login | same |
| 3 | Retail bank login | strict CSP, `autocompleteDisabled` |
| 4 | Webmail login | ordinary baseline |
| 5 | SPA injecting its login form after load | injecting script origin |
| 6 | Login form posting to another domain | form action URL |
| 7 | Non-Latin / IDN domain | domain representation fields |
| 8 | HTTP-only login | page scheme |
| 9 | Page reached via 2+ redirects | redirect chain, hop count |
| 10 | Page requesting camera on load | `precededByUserGesture` |

```
I've saved ten results in spike/results/. Read them all.

Produce docs/ProducerCapabilityManifest.md listing, per D0.1 field, whether
the extension could observe it.

Three fields were PREDICTED unobservable. Tell me what ACTUALLY happened with
each, separately, citing which of the ten pages showed it:
  - transport.chainComplete and transport.chainTrusted
  - every field under dns.*
  - permissionContext.precededByUserGesture

Then copy spike/results/ to docs/spike-results/ so the evidence is committed.
```

**Check:**
- [ ] The manifest is in `docs/` — **committed**, not left in `spike/`, which is gitignored
- [ ] **The raw results are in `docs/spike-results/`.** Each confirmed incapability becomes a permanent `PRODUCER_EXCLUSIVE` classification; the evidence for a permanent decision should outlive a gitignored folder.
- [ ] Every D0.1 field appears exactly once
- [ ] **The three predicted fields each carry an observed verdict citing a page** — not a restatement of the prediction. A manifest agreeing with the prediction on all three with no evidence is the failure mode.
- [ ] Hand to Jayanth to adjudicate (`B0.4`)

---

# STEP 11 — Write the rules file (Durga, ~1 day, week 2) — `C0.5`

```
Read spec/SecureSphereX-RuleEngine-Spec-v0_8.md sections 7, 10.4, 14.1, 18.1
and 18.2 in full, and packages/contracts/ruleset.format.v1.ts — the D0.3
format, as amended in Step 6.

Plan first. Create rulesets/rules-v0.1.0.json containing:

- ELEVEN rules. Nine primaries: CRED-01..CRED-07, DL-01, PM-01.
  TWO aggravators: CRED-A1 (+10) and DL-02 (+20).
  (Some documents say ten rules with one aggravator. §7.1 says eleven and
  marks both CRED-A1 and DL-02 as Aggravator.)
- Three suppressions
- Three refinement sets
- Eleven parameters
- An EMPTY subsumption table. §10.4 says it is intentionally empty at v0.1 —
  the MECHANISM ships, the table has zero rows. Do not invent composites.
- pslVersion, per DECISIONS.md DEC-8 — the PSL version this rule set was
  authored against.

Take every predicate, weight and tier from §7 exactly. Change no number.

EVERY RULE NEEDS ALL ELEVEN §18.1 METADATA FIELDS or static check V-10 fails:
  identifier · name · owner · introduced-in · last-modified-in ·
  lifecycle state · rationale · empirical confidence ·
  known false-positive risks · CWE mapping · CAPEC mapping

  introduced-in and last-modified-in are RULE-SET VERSION STRINGS ("0.1.0"),
  NOT dates. §18.1 says "Rule-set version" for both.
  lifecycle state is Proposed/Active/Deprecated/Retired (§14.2) — use Active.
  empirical confidence is exactly 'Unvalidated' for every rule (§18.2, and
  the EmpiricalConfidence type). Capital U, exact spelling.
  false-positive risks come from §7.2's per-rule entries — do not invent them.
  rationale must say what this rule detects that no other rule does. V-10
  rejects an empty one, and a generic one is worse than none.

Then implement the validate:ruleset npm script (stubbed in Step 5) checking
V-1 through V-13 from ruleset.format.v1.ts. There are THIRTEEN — V-13 was
added later and Stage0-Completion-Pack §3 still says twelve. V-9 checks the
subsumption table; V-10 checks the metadata above; V-6 is the layered-security
invariant and must be machine-checked, not eyeballed.
```

**Check:**
- [ ] `npm run validate:ruleset` passes **all thirteen** — a real validator, not a reading
- [ ] Jayanth approves (`B0.2`), confirming **V-6 was machine-verified**

---

# STEP 12 — Turn on the safety checks (Varun + Jayanth, week 2) — `A0.3`, `B0.1`

**Varun:**

```
Read spec/ci.yml and spec/Stage0-Completion-Pack.md §3.

Set up GitHub Actions on Node 22 running gates G-1, G-4, G-5 and G-7.

G-4 and G-5 are one dependency-cruiser step in ci.yml — write
.dependency-cruiser.cjs enforcing the package dependency matrix in Stage0 §2,
including that the store implementation is reachable only through D0.8 (G-5).

Note: Implementation-Ownership-Plan.md §1 never assigns G-5 to anyone — it has
no row. It rides with G-4 in ci.yml, so it is yours.
```

**Jayanth:**

```
Read spec/Stage0-Completion-Pack.md §2, §2.1, §2.2 and spec/ci.yml lines 42-50.

Write tools/ci/architectural-gates.mjs implementing:
- G-2: no 'as Origin' / 'as unknown as Origin' casts outside toOrigin()
- G-3: no browser globals in packages/engine
- G-6: nothing transmits Authentication History Store data
```

**Then — the part that matters:**

```
ci.yml's deliberate-violation job (lines 102-113) tests G-3 ONLY. It injects
window.location.href into packages/engine. G-2, G-4, G-5 and G-6 have no
violation case at all.

Add one for each, under a __gatecheck__ path like G-3 already uses. Each
introduces exactly the code that gate exists to catch, confirms CI rejects
it, then removes it.

G-5 and G-6 have no real code to violate yet — the store does not exist until
week 4. Build synthetic cases now and re-run them against the real
implementation when it lands.

Run all five. Show me each one failing.
```

**Check:** you have **watched all five reject something.** Not "CI is green" — you saw them fail.

> §6's exit criterion says the *dependency matrix* must be proven by a deliberate violation. That is **G-4**. The existing job tests **G-3**. Without this step you tick the box while the gate it names has never fired. And §20.2 — which the Stage 0 pack calls *"the invariant most likely to fail silently and most damaging when it does"* — rests on **G-6**, which today has never fired either.

---

# STEP 13 — Finish Durga's week 2 — `C0.4`, `C0.6`, `C0.7`

### `C0.4` — the outcome report

```bash
python tools/capture/capture.py --report
```

Report the success rate **by label** — phishing versus benign, separately.

**Check:** **if benign success exceeds phishing by more than about 20 points, that is `RK-2` firing — escalate now.** A large gap means phishing sites are cloaking against your crawler, which biases everything downstream. This is a Stage 0 exit criterion and the early warning for a live High risk. **Look at it by day 6.**

### `C0.6` — the split-migration dry run

```bash
python tools/capture/migrate_split_v2.py --dry-run
```

**Check:** a **non-zero snapshot total**, and the `S-2a` audit passing — every snapshot sharing a registrable domain lands in the same split. Show the reassignment statistics.

> ⚠ **`--apply` is permissible EXACTLY ONCE, and only before any tuning has begun.** The script refuses to run if it detects that calibration has started, because a re-split after tuning leaks test data and invalidates every number the project will ever report. `--dry-run` is always safe. `--apply` is a one-way door.

### `C0.7` — wire the enum-conformance gate

```
Apply the E-21 fix to contract-conformance-check.py: anchor its paths to the
script's own location instead of the working directory, and correct the LDD
filename to use an underscore. As shipped it raises FileNotFoundError on
every invocation.

Then wire it into CI as gate G-11 — per DECISIONS.md DEC-4, G-8 belongs to
the rule-set validator.

Two path problems to solve first:
  - it globs *.ts in the working directory, but our contracts are in
    packages/contracts/
  - it reads the Logical Database Design spec, which lives in spec/

Per DEC-3b: do not vendor a 170 KB specification into the CI path. Extract the
CREATE TYPE ... AS ENUM blocks once into tools/ci/storage-enums.json, pinned
to the LDD's digest, and compare against that. Drift then shows up as a
digest mismatch rather than a silent divergence.

Then seed a fake enum mismatch and show me CI failing on it.
```

**Check:** a seeded mismatch **fails the build**. Not "the step ran".

---

# STEP 14 — Fingerprint design note (Varun, ~0.5 day, week 2) — `R-2`

```
Read these four places in spec/SecureSphereX-RuleEngine-Spec-v0_8.md:
  - §7.2, the CRED-02 entry, "Fingerprint composition" — the feature classes
    the spec names, and the rule that raw DOM structure SHALL NOT be used
  - §13.2 — tau_sim and feature weighting are empirically tunable BY DESIGN,
    so this note fixes a FUNCTION, not a threshold
  - §20.11 — the ACEM is the store's evaluation source; a fingerprint
    algorithm version mismatch yields 'unevaluable', never absence of match
  - §20.6 — guard G-03's fingerprint collision threshold

Write docs/fingerprint-similarity.md, one page. It must COMMIT to:

1. The feature vector: which of §7.2's named classes are in v1, and for each,
   how it is extracted and normalised. If you exclude one, say why.
2. The comparison function: how two vectors produce a score in [0,1]. Name it.
   Per-feature weights are PARAMETERS, not constants — they get tuned against
   tau_sim later, so this note fixes their SHAPE, not their values.
3. What the score means at the boundaries, and what tau_sim will be tuned on.
4. The fingerprint algorithm version field, and what happens on mismatch —
   'unevaluable', per §20.11. That is on the frozen list; do not restate it
   loosely.

Do NOT describe the Authentication History Store. That is §20 and it is
already specified. This note exists so tau_sim has something to be tuned
against.
```

> **Section note:** the paragraph that decides this note is in **§7.2**, inside `CRED-02`'s entry — not §20. Pointed at §20 you get a competent description of the store and never find the composition list, which is `RK-4` exactly: *"Varun invents a function; tau_sim proves untunable against it."*

**Check:** Jayanth reviews it. **Week 4's store work is blocked without it.**

---

# STEP 15 — Start the first evaluation module (Durga, ~0.5 day) — `C1.1a`

Week 2 spillover into `C1.1`. Start the `url` module against the Step 9 design note. Nothing else in week 2 depends on it — this is deliberate slack being used, and it takes the sharpest edge off week 3.

---

# END OF WEEK 2 — the lock

Jayanth tags the contracts `v1.0.0`. **After this, changing a contract means updating every consumer in the same change (`G-5`).**

Tag when **the other seven** boxes in `Stage0-Completion-Pack.md` §6 are ticked. **The tag is itself the eighth** — it is what closes Stage 0, not a precondition for it.

- [ ] Scaffold builds; all packages typecheck under strict mode
- [ ] CI gates `G-1` … `G-7` green
- [ ] Dependency matrix enforced **and verified by a deliberate violation test**
- [ ] Fixtures committed: clean login, off-origin post, no credential form, SSO flow
- [ ] Capability spike complete; manifest committed
- [ ] Capture running; **≥ 48 hours of positives** accumulated
- [ ] Fetch-outcome distribution reported by label
- [ ] → **then** contracts tagged `v1.0.0` in `packages/contracts`

Plus, before you tag:

- [ ] `DEC-3`'s five answers are written **and Annex A's six amendments are applied and verified** (Step 6's five checks)
- [ ] The capability spike is **finished**, not in progress
- [ ] `BASELINE.md` records both digests per file

**Waiting is cheap. Tagging early is not.** If something is not ready, slip the tag.

---

# Working on one laptop

- **One person at the keyboard in Lane A.** Commit before handing over.
- **Lanes B and C do not need it.** Durga's capture runs on her machine; Varun's spike is browser work; Jayanth's decisions and notes are writing.
- **Before handing over:** `Summarise what we did and what's next. Add anything worth remembering to CLAUDE.md.`
- **When you sit down:** `Read CLAUDE.md and tell me the current state of the repo.`
- **This works for weeks 1–2 because most work is off-laptop. From week 3 the laptop becomes the bottleneck** — plan module work in batches, and settle `DEC-7` before you do.

---

# When something fails

| Symptom | First thing to check |
|---|---|
| **The hook did not block** | `jq --version` · `chmod +x` on the script · **exit `2`, not `1`** · `/hooks` shows it under Project Settings |
| **`tsc` errors point into a contract** | **Do not edit the contract.** The hook will stop Claude, correctly. Fix the tsconfig or the filename. If it is genuinely a contract defect, it is an amendment and it goes in `DECISIONS.md`. |
| **Capture returns zero snapshots** | `playwright install chromium` before you suspect the feed · then feed access · then the URL list |
| **`--report` says `Corpus is empty`** | A gzip glob was not updated. Six sites — see Step 2. Do **not** trust the exit code; it is 0 either way. |
| **CI does nothing** | Is there a GitHub remote? Actions need one. Step 0. |
| **`npm run test:fixtures` — script not found** | Step 5 stubs it. `ci.yml` calls all three script names verbatim. |
| **Amendments "applied" but greps still find bare `string`** | `tsc` passing does not prove the amendment landed. Re-read Annex A's site list — `createSession` at line 210 is the usual miss. |
| **`spec/` rollup does not match `DECISIONS.md`** | **Stop.** You have a different 46 files. Find out which copy you have. |

# If you get stuck

```
Read spec/<the relevant file> and explain <the thing> to me in plain terms
before we write any code.
```

The specifications answer almost every question. Your job in weeks 1 and 2 is to point Claude Code at the right section, not to invent anything.
