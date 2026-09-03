# SecureSphere X — Ground-Truth Status

**Audited:** 2026-09-01 · **HEAD:** `a79f6bc` (branch `main`, in sync with `origin/main`) · **Method:** every claim re-verified against code / git / live test execution. Where a doc disagrees with reality it is flagged **⚠ DOC-VS-REALITY**.

> **Headline finding first:** three CI gates are **RED right now** on `main` — `G-1 Lint (eslint)`, `DEC-32 conformance-config`, and `G-11 contract↔LDD`. The progress narrative implies green CI; it is not. Details in §3. Everything else (typecheck, 12 of 13 test scripts, build, engine gates) is genuinely green.

---

## 1. Repository ground truth

- **Branch/HEAD:** `main` @ `a79f6bcc1d2b863909ba474ba3f76b150c458488`, equal to `origin/main`. `git status`: clean except untracked `test-page/` (a local scratch login page, correctly never committed).
- **Tags:** **zero** (`git tag -l` empty). ⚠ **CP-0's "contracts tagged v1.0.0" criterion is unmet** — consistent with CHECKPOINTS.md's own honest CP-0 = NOT MET record.
- **Commits:** 50-deep log verified. The commit hashes named in the governance docs resolve: `0501560` (actionRegistrableDomain fix), `422fef4` (PSL wiring), `ce05ded` (contract amendments A/B), `409171d` (DEC-31 pslVersion), `fc9d6a2` (DEFECT-30) all exist as described.
- **Layout vs CLAUDE.md §1:** matches. Present: `packages/{contracts,engine}`, `apps/{extension,harness}`, `tools/{capture,ci,conformance}`, `rulesets/`, `corpus/`, `fixtures/`. (`tools/conformance/` is a real neutral cross-producer test dir not in CLAUDE.md's original list — an addition, not a discrepancy.)

**Real component sizes (verified line/file counts):**

| Component | Files | Lines | Notes |
|---|---|---|---|
| packages/contracts | 6 ts | 2,017 | frozen contracts |
| packages/engine | 44 ts | 8,407 | 10 modules + 8 pipeline stages + shared psl/classify |
| apps/extension | 12 ts (+mjs/json/html) | 2,174 | MV3 extension, real |
| apps/harness | 13 ts | 2,298 | offline extractor + metrics |
| tools/capture | 3 py | 1,675 | capture.py + sentinel_fill.py + migrate |
| tools/ci | 4 py + 1 ts | 849 | gates + validators |
| tools/conformance | 3 ts | 411 | cross-producer tests |
| fixtures | 4 ts | 594 | 4 hand fixtures |
| **backend/server/api/db** | **0** | **0** | **no implementation code exists** |

---

## 2. Build & test — real execution results

- `npm ci` → clean, **0 vulnerabilities**.
- `npm run typecheck` (`tsc -b`) → **PASS** (exit 0).
- `npm run build:extension` → **PASS**. `dist/` contains all 6 required artifacts (`manifest.json`, `service-worker.js`, `content-script.js`, `popup.js`, `popup.html`, `rules-v0.1.0.json`).
- `npm run validate:ruleset` → **CONFORMANT**, all 15 checks V-1…V-15 OK.
- `npm run digest:ruleset` → prints `sha256:f691…`.
- `npm run check:conformance-config` → **FAIL (exit 1)** — see §3.

**Every `test:*` script, individually:**

| Script | Result |
|---|---|
| test:fixtures | ✅ PASS (7/7) |
| test:properties | ✅ PASS (B1.5 property assertions) |
| test:psl | ✅ PASS (tldts vs tldextract, 7 boundary + 5 controls) |
| test:extension | ✅ PASS (session survives worker termination) |
| test:conformance | ✅ PASS (8/8 shared fields, incl. actionRegistrableDomain) |
| test:cred-livepath | ✅ PASS (CRED-01 fires live; localhost caveat correct) |
| test:redirect | ✅ PASS (8/8 navigation scenarios) |
| test:cred04livepath | ✅ PASS (CRED-04 fires cross-domain; silent same-site/no-form; S-10 intact) |
| test:authstore | ✅ PASS (guards G-01…G-05, negative cases) |
| test:moduleeval | ✅ PASS |
| test:authcontext | ✅ PASS (version-mismatch → unevaluable) |
| test:determinism (SSX_CORPUS_STORE=corpus) | ✅ PASS |
| test:readboundary (SSX_CORPUS_STORE=corpus) | ✅ PASS |
| **test:tier1e2e** | ⚠ **NOT RUN** — refuses without `SSX_E2E_SNAPSHOT` (a real capture.py output). Honest guard, not a code failure; **not wired into CI**, so it does not gate. It has therefore never actually exercised the capture→extract path in CI. |

---

## 3. CI gates — real status, one by one

`ci.yml` runs these. Verified by running each locally.

| Gate | Runs | Status | Verification |
|---|---|---|---|
| G-1 Typecheck | `tsc -b` | ✅ | exit 0 |
| **G-1 Lint** | `eslint . --max-warnings=0` | ❌ **RED — 51 errors** | Root cause: `eslint.config` sets only `globals.node`; the extension code (`chrome`, `document`, `location`, `MutationObserver`) → **38 `no-undef`**; also lints built `dist/*.js` (should be ignored) + 6 `no-unused-vars`, 3 `no-control-regex`, 1 `no-useless-escape`. Red since the extension work landed. |
| G-2 Origin casts | `architectural-gates.mjs` | ✅ | **DEFECT-13 confirmed RESOLVED** — file exists (242 lines), does **real TypeScript-AST** analysis for `as Origin` casts, not a stub. |
| G-3 Engine purity | `architectural-gates.mjs` | ✅ | Real AST scan for `chrome/window/document/localStorage` in engine; passes. |
| G-6 Transmission audit | `architectural-gates.mjs` | ✅ (weak) | **DEFECT-14 confirmed STILL OPEN** — the script itself prints "G-6 IS NOT REAL REACHABILITY ANALYSIS … co-occurrence heuristic" and "unproven either way." Passes vacuously. |
| G-4/G-5 Dependency boundaries | `depcruise` | ✅ | no violations, 101 modules |
| G-7 Fixture round-trip | `test:fixtures` | ✅ | 7/7 |
| G-8 Rule-set validation | `validate:ruleset` | ✅ | CONFORMANT, V-1…V-15 |
| G-8 PSL oracle / boundary | shell + `test:psl` | ✅ | passes |
| **DEC-32 conformance-config** | `check:conformance-config` | ❌ **RED (exit 1)** | The DEFECT-34 guard scans `*conformance*.test.ts` and requires each to assert its oracle's config. `tools/conformance/login-interface.conformance.test.ts` (added A1.2) is a harness-vs-extension test, **not** a PSL-config-oracle test, and asserts no config → the gate fails. Needs a `CONFIG-ECHO-EXEMPT:` line or a narrower scan scope. |
| **G-11 Contract↔LDD** | `contract-conformance-check.py` | ❌ **RED (exit 2)** | "The LDD changed since `storage-enums.json` was generated." `storage-enums.json` **is** committed (`ea21f34`) but its hash no longer matches the current contracts/LDD; needs `extract-storage-enums.py` re-run + commit. |
| G-9 Property tests | `test:properties` | ✅ | passes |
| A1.1–A1.5 + Redirect | 6 test scripts | ✅ | all pass |
| Boundary-violation job | deliberate-violation | ✅ (not re-run; script present) | |

**GitHub Actions run history:** not reachable from this environment (no network to the Actions API here). Given three gates are locally red, any CI run on the current tree **would fail** unless the runner differs.

---

## 4. Governance registers — audited for currency

- **DECISIONS.md:** 35 entries. **25 signed** (Jayanth, Architecture Owner); **10 CANDIDATE-unsigned-open**: DEC-12, 13, 15, 16, 17, 18, 19, 20, 24, 25. Spot-checked 5 signed decisions against code — all reflected: DEC-33 selector in `capture.py`, DEC-31 `pslVersion` string in the ruleset, DEC-30 `new_cdp_session` used with no `addEventListener` monkey-patch, DEC-35 `sentinel_fill.py` present, DEC-26 `dnsRecords: None` in capture. **DEC-19 resolved via Option B (602fbeb): RedirectEvidence gained initialRegistrableDomain/finalRegistrableDomain; CRED-04 mechanism now proven** — see §5.
- **DEFECTS.md:** 35 entries — **11 OPEN**, **17 FIXED/RESOLVED**, 7 early entries use an "Owner:" format predating the OPEN/RESOLVED convention. Spot-checks: DEFECT-35 (CORPUS_DIR anchored) ✅ present; DEFECT-34 (single-sourced `psl-config.json`) ✅ present; DEFECT-13 (architectural-gates.mjs) ✅ present & real; DEFECT-15 (loginForm `pageRegistrableDomain` null) ✅ still null as documented; DEFECT-19 (redirect regdomain null) — **RESOLVED (602fbeb)**: `redirect.ts` now reads the producer-derived domains (Option B), mirroring DEFECT-15; was genuinely open before this.
- **CHECKPOINTS.md:** CP-0 = **NOT MET** (0 tags confirms the unmet "v1.0.0 tag" criterion — accurate). CP-1 = **MET & signed** (engine + 10 modules; `test:properties`/`test:fixtures` green today confirm the gates it cited). CP-2/CP-3/CP-4 = not declared in the file (CP-3's loginInterface-conformance content exists and passes, but no formal CP-3 record).

---

## 5. Detection capability — what actually fires

**Modules (10):** `url`, `homograph`, `loginForm` — **real & evaluable live**. `ssl`, `dns` — conformant **stubs**, no rule reads them (DEC-5). `redirect` — **fully evaluable** (602fbeb): the harness extractor builds full RedirectEvidence (incl. both registrable-domain fields) from raw.redirectChain; the engine module reads them. (The EXTENSION producer alone stays webNavigation-limited on redirects — hopCount/chain notCollected — pending chrome.webRequest; that is a producer limit, not a module gap.) `javascript`, `downloadContext`, `permissionContext` — **unevaluable** (capability/policy boundaries; see remaining list). `authContext` — **write path built** (§20.5 login-success inference in `login-success.ts`, `test:loginsuccess` green), **read path pending** (`collectLoginInterface` fingerprint is still `notCollected` on the evaluation path), so **CRED-02 still does not fire**.

**Rules (11):** CRED-01/06/07 **fire live** (verified: `test:cred-livepath` + user's Chrome screenshot on `login.acmebank.example` → High, CRED-01+CRED-06). CRED-02 (authContext — write path built, read-path `collectLoginInterface` fingerprint pending), CRED-04 (**mechanism proven** — fires on cross-domain redirect to a credential form via the harness path, `test:cred04livepath`; **0 corpus firings** on the 617-snapshot store — the >=2-hop cross-domain redirects (30) and credential-form pages (80) are DISJOINT populations, a data property, not a defect; S-10 keeps it DIVERGENT), CRED-05/CRED-A1 (javascript, **DEC-14 non-functional**; DEFECT-18 **partially closed** — see note below), DL-01/02 (downloadContext), PM-01 (permissionContext) — **do not fire** (dependencies unevaluable/blocked).

**DEFECT-18 status (transmissionEndpointDomains half FULLY closed producer+engine; injectingScriptOriginDomain half still open — verified 2026-09-03):**

- **`transmissionEndpointDomains` — CLOSED end-to-end.** Producer half: `ScriptRuntimeEvidence.transmissionEndpointDomains` was added as a producer-PSL-resolved field (contract Amendment B, commit `ce05ded`); the extractor `apps/harness/extract/scriptRuntime.ts:179` populates it via `psl.ts` (the same V-15-gated path as `url.registrableDomain`, verified by `tier1-e2e`). Engine half (**this session**): `packages/engine/modules/javascript.ts` now **reads** `evidence.transmissionEndpointDomains` (present→value, absent→`[]`, notCollected→unevaluable), mirroring DEFECT-19's redirect fix — the hardcoded `[]` is gone. So `JavaScriptFindings.transmissionEndpointDomains`, the operand CRED-05's `exists` reads, now carries real domains once the module is evaluable. This removed a **second** structural blocker that sat behind the transmission gate; it did **not** touch that gate. The **only** remaining CRED-05 blocker on this path is the transmission **data** itself — `clientSideTransmissionObserved` stays `notCollected` until the Tier-4 sentinel runs (item 5), which keeps the module unevaluable today.
- **`injectingScriptOriginDomain` — STILL OPEN, and materially larger than a one-line fix.** It is unconditionally `null` at the **evidence level too**: `ScriptRuntimeEvidence` has **no** injecting-origin field at all (unlike transmissionEndpointDomains, no Amendment B added one). The only field that could ground it, `LoginFormObservation.injectingScriptOrigin`, (a) lives in a different evidence category (`loginInterface`) that §2.6 forbids the javascript module from reading, and (b) is **itself fabricated/unpopulated** — DEFECT-31; both producers set it to `null` unconditionally (`loginInterface.ts:177,227`, `collect-evidence.ts:197,213`). Closing this half needs actual capture-layer capability (injection-provenance tracking, same gate as `credentialInterfaceInjected`, DEC-30 Part 4 — not built) **plus** a contract amendment, not a wiring change. CRED-A1's left operand stays `null`.

DEC-14 (CRED-05/CRED-A1 non-functional, Phase I) still governs; one of its four sub-gaps (transmissionEndpointDomains) is now fully closed, the injecting-origin sub-gap is unchanged.

**Confusion matrix:** last full run this session (34,631 evaluated): **CRED-01/06/07 fire; CRED-05 = 0**; credential-bearing subset **P=99.3%, R=14.9%**. **Not re-run today** (full corpus pass ≈ 20–40 min); the corpus has since grown to 35,087 INDEX entries. **CRED-05 remaining zero is certain** — `sentinel-runs/` **does not exist**, so `sentinel_fill.py --live` (DEC-35 Tier 4) has never run, and `clientSideTransmissionObserved` stays notCollected.

**Corpus:** `INDEX.jsonl` = **35,087** entries (25,716 phishing / 9,371 benign). Tier-1/Tier-3-enabled real snapshots: the ~640 from commits `17725af`+`a3c722a` (40 recovered + 600 fresh).

---

## 6. Backend — confirmed status

**100% specification, zero implementation code.** Repo-wide search for `express/fastify/createServer/listen(/app.get(/PostgreSQL/psycopg/sqlalchemy` across `apps packages tools` → no matches (only `.git/objects/db`, a git internal). No `backend/`, `server/`, `api/`, or `db/` source directory exists. The `spec/` documents (Backend-Architecture-*, API-Contract-*, MR-1…MR-12) describe a backend that has not been started. (MR-item resolution not tracked in code; nothing to resolve since no code exists.)

---

## 7. Security posture

- **`npm audit`: 0 vulnerabilities.**
- **Secrets scan:** no hardcoded secrets/keys/credentials. Every hit for "password" is the credential-field **kind** in classification logic or test fixtures; `PHISHTANK_APP_KEY` is an `os.environ` read, not a literal. Clean.
- **Extension loaded in real Chrome: YES** — user-provided screenshots this session (`amazon.in` → Low; `login.acmebank.example:8000` → High with CRED-01+CRED-06). This is real user evidence; I cannot independently re-capture a browser session in this environment, but it is not merely a claim.

---

## Component completion — re-derived from verification

| Component | Real completion | Basis |
|---|---|---|
| contracts (frozen) | ~100% | typechecks, consumed everywhere, amendments landed |
| engine — pipeline (stages 1–8) | ~95% | runs end-to-end; property + fixture tests green |
| engine — 10 modules | ~75% | 3 real+live, 2 conformant stubs (intentional), redirect **fully evaluable** (602fbeb), 4 unevaluable by capability/policy |
| rules (11) | ~45% functional | 3 fire live; CRED-04 mechanism proven (0 corpus firings, disjoint populations); 7 blocked by capability/policy/DEC-14 |
| extension (MV3) | ~75% | builds, loads, collects, evaluates, fires CRED-01/06/07 live; javascript/download/permission/authContext evidence not wired |
| capture pipeline | ~90% | Tier 1+3 built & validated; sentinel-fill approved but never run live |
| harness | ~90% | extractor + metrics real; `tier1e2e` never CI-exercised |
| backend | **0%** | spec only |
| CI | ~70% | 8 gates green & real; **3 gates RED** (lint, conformance-config, G-11); G-6 admittedly heuristic |
| corpus | ~85% | 35k snapshots; only ~640 Tier-1/3-enabled |

## Prioritized remaining work (ranked by what blocks the most)

1. **Fix the 3 red CI gates** — blocks trustworthy "green" state for everything else. (a) eslint: add browser/webextension globals + ignore `dist/`; (b) `check:conformance-config`: exempt or rescope the login-interface conformance file; (c) G-11: regenerate + commit `storage-enums.json`.
2. ~~DEFECT-19 (redirect registrable-domain fields)~~ — **DONE (602fbeb)**: amendment landed, Option B wired, CRED-04 mechanism proven. (Corpus firings await a snapshot with a >=2-hop cross-domain redirect landing on a credential form; none in the current 617.)
3. **`webRequest` permission decision** — unblocks full redirect chain/hopCount **and** the javascript transmission-endpoint **data** (the raw `transmissionEndpoints` / `clientSideTransmissionObserved` observation). Note: the endpoint→registrable-**domain** derivation is already done producer-side (DEFECT-18 partial closure above); what `webRequest`/Tier-4 supplies is the raw transmission observation, and `javascript.ts` still needs the one-line wiring to consume the resolved domains. One decision, two modules.
4. **authContext read-path fingerprint** — the write path (§20.5 login-success inference → authStore, DEC-38) is **built** this session; CRED-02 is still blocked on wiring `collectLoginInterface` to populate the `fingerprint` on the evaluation **read** path (currently `notCollected`). That read-path wiring is the remaining step; it changes production detection behavior and awaits its own explicit authorization.
5. **Tier 4 sentinel-fill live run** — approved (DEC-35), never executed; the only path to a non-zero CRED-05.
6. **Formalize ssl/dns/permissionContext as permanent capability boundaries** in the manifest (documentation, low effort).
7. **Backend** — largest absolute gap, but blocks nothing in the current local-first extension path; lowest priority for *this* system's near-term function.

*Everything above is re-derived from executed builds/tests and source inspection on 2026-09-01, not copied from the progress report.*
