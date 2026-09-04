# SecureSphere X — Ground-Truth Status

**Audited:** 2026-09-04 · **Branch:** `main`, in sync with `origin/main` · **HEAD at audit:** `5c81898` (this rewrite is the following commit) · **Method:** full rewrite from current code; every claim cross-checked against source / git / executed tests, not carried over from the prior (2026-09-01) audit.

> **Headline:** CI is **GREEN** — `npm run verify:all` exits 0 across all 27 gates (typecheck, eslint, architectural G-2/G-3/G-6, depcruise, and 22 test scripts). The three gates that were RED in the 2026-09-01 audit (G-1 Lint, DEC-32 conformance-config, G-11 contract↔LDD) are all fixed. One correction this audit surfaced and now records: **CRED-03 is a live-DIVERGENT rule** (fires offline, unreachable in the extension for IDN homographs) — see §5. The system is a working local-first extension + offline harness; there is still **no backend** (§6), and several rules are non-functional by capability/policy ruling, not by bug.

---

## 1. Repository ground truth

- **Branch/HEAD:** `main` @ `5c81898`, equal to `origin/main` at audit time.
- **Tags:** **`v1.0.0`** exists — an annotated tag on the pre-amendment Stage-0 baseline commit `d721413` (created per the retroactive-Stage-0-tag decision; it deliberately does NOT point at the amended HEAD). CP-0's "contracts tagged v1.0.0" criterion is thereby satisfied on the correct commit.
- **Working tree:** clean of real changes. `git status` shows only (a) `spec/Logical-Database-Design-Specification-v1_1.md` as ` M` — a git stat-cache artifact, `git diff` is **empty** (no content change); and (b) `test-page/` — a local scratch CRED-01 test page, now in `.gitignore`.
- **Layout vs CLAUDE.md §1:** matches. `packages/{contracts,engine}`, `apps/{extension,harness}`, `tools/{capture,ci,conformance}`, `rulesets/`, `corpus/`, `fixtures/`.

**Component sizes (tracked files):**

| Component | Files | Notes |
|---|---|---|
| packages/contracts | 6 ts | frozen contracts |
| packages/engine | 23 ts (+22 tests) | 10 modules + 8 pipeline stages + shared psl/classify |
| apps/extension | 14 ts (+mjs/json/html) | MV3 extension incl. Tier-2 intervention UI |
| apps/harness | 10 ts | offline extractor + metrics |
| tools/conformance | 8 ts | cross-producer + live-path tests |
| tools/capture | 3 py | capture.py + sentinel_fill.py + migrate |
| **backend / server / api / db** | **0** | **no implementation code exists** |

---

## 2. Build & test — executed results (2026-09-04)

- `npm run typecheck` (`tsc -b`) → **PASS**.
- `npm run build:extension` → **PASS**; `dist/` has all **8** artifacts (`manifest.json`, `service-worker.js`, `content-script.js`, `popup.js`, `popup.html`, `intervention.js`, `intervention.html`, `rules-v0.1.0.json`).
- `npm run validate:ruleset` → **CONFORMANT** (V-1…V-15); `npm run test:v16` (V-16 null-fold) → **PASS**.
- `npm run verify:all` → **EXIT 0**. Every test script green: fixtures 7/7 · properties · psl · extension (session-survival) · conformance 8/8 · cred-livepath · cred02livepath · **cred03livepath (new)** · cred04livepath · dllivepath · pm01unit · redirect 8/8 · authstore · moduleeval · authcontext · loginsuccess · multipass · downloadrepass · intervention · tier1e2e (now wired into the gate and passing).

---

## 3. CI gates — real status

`ci.yml` / `verify:all`. All green as of 2026-09-04.

| Gate | Status | Note |
|---|---|---|
| G-1 Typecheck (`tsc -b`) | ✅ | exit 0 |
| G-1 Lint (`eslint --max-warnings=0`) | ✅ | **fixed** (was RED 2026-09-01): nested `**/dist/**` ignored, extension globals scoped to `apps/extension/**`, real lints fixed. A local pre-commit lint hook now guards against recurrence (DEFECT-36). |
| G-2 Origin casts / G-3 Engine purity | ✅ | real TypeScript-AST scans (`architectural-gates.mjs`) |
| G-6 Transmission audit | ✅ (heuristic) | **DEFECT-14 still open** — the script itself prints it is a co-occurrence heuristic, not reachability analysis. Passes, not proven. |
| G-4/G-5 Dependency boundaries | ✅ | depcruise, no violations |
| G-7 fixtures · G-8 ruleset+PSL · G-9 properties | ✅ | |
| **DEC-32 conformance-config** | ✅ | **fixed** (was RED): `CONFIG-ECHO-EXEMPT` marker on the harness-vs-extension conformance test. |
| **G-11 Contract↔LDD** | ✅ | **fixed** (was RED): root cause was CRLF/LF, not a contract change; `.gitattributes` normalizes to LF (DEFECT resolved without regenerating the pinned digest). |
| V-16 null-fold · live-path suite · multipass · downloadrepass · intervention | ✅ | added this session |

---

## 4. Governance registers — current

- **DECISIONS.md:** **46 entries** (through DEC-46). Provenance sweep this session: DEC-36/37/38 carry real ratification superseding earlier self-applied signatures; DEC-39–43 and DEC-46 are Architecture-Owner rulings "given directly in this session, not self-attested"; DEC-45 is an explicit **delegation** (Option A choice delegated to the implementing session); **DEC-44 is relabelled** as an advising-session technical determination within the AO's authorization (see DEC-44). No entry now reads as silently self-attested.
- **DEFECTS.md:** **41 entries**. Session-relevant: DEFECT-36 (CI red, fixed + pre-commit hook), DEFECT-37 (`resolveFindingPath` nested-path, fixed), DEFECT-38 (download per-tab key, fixed), DEFECT-39/40 (null-fold under negation, fixed via DEC-41 + V-16 gate), **DEFECT-41 (download re-analysis trigger) — RESOLVED via DEC-45** (SW download re-pass built + tested). DEFECT-14 (G-6 heuristic) and DEFECT-31 (`FABRICATION_FORCED_BY_SHAPE`, underlies CRED-A1/DEC-46) remain open by design.
- **v1.0.0 / CP-0:** the tag exists on the Stage-0 baseline; CHECKPOINTS.md's CP-0 reasoning is satisfied.

---

## 5. Detection capability — what actually fires (cross-checked against code)

**Modules (10):**
- `url`, `loginForm` — real & evaluable live.
- `homograph` — evaluable, BUT with a live-extension IDN gap: `collectDomainRepresentation` cannot decode punycode→Unicode in a content script (unicodeDomain 0/6 NOT OBSERVABLE), so for an IDN host it marks the script-dependent fields `notCollected` → homograph **unevaluable on the extension path for IDN pages**. The harness (`node:url` ICU decode) evaluates it fully. This is the root of CRED-03's divergence.
- `authContext` — **FULLY WIRED this session** (read + write). Write: §20.5 login-success inference (`login-success.ts`). Read: `collectLoginInterface` now produces the login `fingerprint`; the module looks it up against the AuthStore. `test:cred02livepath` proves CRED-02 fires. (Correcting the prior audit's "read path pending".)
- `downloadContext` — evaluable when a download record exists; wired into the live SW via the DEC-45 download re-pass.
- `redirect` — harness path fully evaluable (server-side chain); the extension producer stays webNavigation-limited (hopCount/chain `notCollected`) pending `chrome.webRequest`.
- `ssl`, `dns` — conformant stubs, no rule reads them (DEC-5).
- `javascript`, `permissionContext` — unevaluable by capability/policy (DEC-14, DEC-40).

**Rules (11 — the count IS 11; CRED-03 is real):**

| Rule | Status | Basis |
|---|---|---|
| CRED-01 | **fires live** | `test:cred-livepath` + real-Chrome screenshot |
| CRED-02 | **fires live** (this session) | `test:cred02livepath` — ESTABLISHED cross-origin impersonation; §20.5 ramp respected |
| **CRED-03** | **DIVERGENT (S-10)** — fires on the harness/offline producer; **live-UNREACHABLE in the extension for IDN homographs** | `test:cred03livepath` (new). Harness decodes the IDN → homograph evaluable → CRED-03 fires; the content script cannot decode punycode → homograph unevaluable → cannot fire live. Correctly silent on plain ASCII (no deception). **Not blocked like CRED-05/PM-01, not retired — a producer-capability divergence, same class as CRED-04.** Corpus firing count not separately measured. |
| CRED-04 | **DIVERGENT (S-10)** — fires on harness; extension webNav-limited | `test:cred04livepath`; **0 corpus firings** (≥2-hop cross-domain redirects and credential-form pages are disjoint populations in the corpus) |
| CRED-05 | **non-functional (DEC-14)** | `clientSideTransmissionObserved` needs Tier-4 sentinel (never run); DEFECT-18's `transmissionEndpointDomains` half is closed, the data half is not. 0 corpus. |
| CRED-06 | **fires live** | `test:cred-livepath` (insecure scheme) |
| CRED-07 | **fires live** | off-origin concealed credential collection |
| CRED-A1 | **accepted non-functional for Phase I (DEC-46)** | three stacked blockers: no injecting-origin evidence field, cross-category + fabricated source (DEFECT-31), injection-provenance capture blocked by DEC-30. Two-part revisit trigger. |
| DL-01 | **live-reachable via the SW download re-pass (DEC-45)**; real-Chrome download firing UNVERIFIED | `test:downloadrepass` / `test:multipass` / `test:dllivepath` prove it fires through the SW composition (page primary finding → cached evidence + download → DL-01). The DEC-45 trigger closed DEFECT-41. **Live Chrome download E2E is a manual check** (headed Playwright download crashes the context). |
| DL-02 | **live-reachable via DEC-45**; DEFECT-39 fixed | `test:dllivepath` — fires on real mismatch/compound extension, SILENT on unknown-extension (null no longer treated as inconsistent) |
| PM-01 | **accepted non-functional for Phase I (DEC-40)** | no trustworthy passive source for `permissionContext`; `test:pm01unit` proves the predicate is correct-but-dormant |

**Tier-2 intervention UI — BUILT this session** (`test:intervention`): Medium interstitial (Proceed / Go back / View findings) + High hard block, monotonic per §11.3, per-navigation override that never teaches auth-store trust (G-02). This is a chrome-extension:// tab-replace page, not a defeatable overlay. `recordIntervention` now fires live (correcting the prior "interventionWasPresented structurally false"). **Visual rendering in real Chrome is a manual check.**

**Confusion matrix:** last full corpus run (34,631 evaluated, earlier this session): CRED-01/06/07 fire; CRED-05 = 0; credential-bearing subset P≈99.3% / R≈14.9%. **Not re-run today** (~20–40 min; corpus now 35,087 entries). CRED-02/03/DL corpus behavior not separately measured.

**Corpus:** `INDEX.jsonl` = **35,087** entries; ~640 Tier-1/Tier-3-enabled real snapshots.

---

## 6. Backend — confirmed status

**Spec only, zero implementation.** No `backend/`, `server/`, `api/`, or `db/` source. Repo-wide search for server/DB frameworks → no matches. The `spec/` backend documents describe a system not yet started. Blocks nothing in the current local-first extension path.

---

## 7. Security posture

- `npm audit`: 0 vulnerabilities.
- No hardcoded secrets (every "password" hit is a credential-field kind or fixture).
- Extension loads in real Chrome (user screenshots this session: Low on a benign site, High + CRED-01/06 on the test login page).
- Tier-4 `sentinel_fill.py`: five DEC-35 guards verified intact and unmodified since sign-off; run **dry-run only** — `--live` has never executed (`sentinel-runs/` does not exist), so CRED-05 remains 0 by construction.

---

## What is genuinely done vs. needs a human vs. still open

**Done & verified (green tests):** engine + 10 modules + Stage 1–8; CRED-01/02/06/07 fire live; CRED-03/CRED-04 mechanisms proven on the harness (both S-10 DIVERGENT live); DL-01/DL-02 fire through the SW download re-pass (DEC-45); Tier-2 intervention UI; all CI gates.

**Needs Jayanth's manual real-Chrome check** (logic proven, live visuals/timing unverified in this environment): SW dormancy→wake (CDP keeps the worker warm under automation); live **download** firing of DL-01/DL-02 in real Chrome; Tier-2 interstitial/block visuals; badge colors across real visits.

**Open by ruling, not bug:** CRED-05 (DEC-14, needs Tier-4 sentinel `--live`); CRED-A1 (DEC-46); PM-01 (DEC-40); CRED-03/CRED-04 live-extension gaps (producer-capability, S-10 DIVERGENT); G-6 reachability (DEFECT-14); the `webRequest` permission decision (redirect chain + transmission data).

**Not built:** backend (0%).

*Re-derived from executed builds/tests and source inspection on 2026-09-04.*
