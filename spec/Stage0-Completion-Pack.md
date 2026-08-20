# SecureSphere X — Stage 0 Completion Pack

**Covers:** D0.6 (Repository Scaffold), D0.7 (CI Baseline), the D0.1 capability spike, and day-one corpus capture.
**Conforms to:** Specification v0.7; contracts D0.1–D0.5, D0.8–D0.10 (all frozen).

---

## 1. Repository Layout

```
securesphere-x/
├── packages/
│   ├── contracts/          # D0.1–D0.5, D0.8–D0.10. Frozen.
│   └── engine/             # Rule engine + 10 evaluation modules
├── apps/
│   ├── extension/          # MV3 browser extension (Role A)
│   └── harness/            # Offline evaluation + replay gate (Role B/C)
├── tools/
│   └── capture/            # Corpus capture pipeline (Role C) — may be Python
├── rulesets/
│   └── rules-v0.1.0.json   # Versioned rule-set artifact (§12.1)
├── corpus/                 # Snapshots. Git-LFS or external store.
└── fixtures/               # Hand-written evidence fixtures
```

---

## 2. Package Dependency Matrix — THE architectural gate

| Package | May import | MUST NOT import |
|---|---|---|
| `contracts` | *nothing* | everything |
| `engine` | `contracts` | `extension`, `harness`, `capture`, **any browser API** |
| `extension` | `contracts`, `engine` | `harness`, `capture` |
| `harness` | `contracts`, `engine` | `extension` |
| `capture` | `contracts` (D0.5 only) | `engine`, `extension`, `harness` |

### 2.1 The engine is browser-free — the load-bearing rule

**`engine` SHALL NOT reference `chrome.*`, `window`, `document`, `localStorage`, or any DOM or extension API.**

*Why this is the single most important scaffold decision.* §17.2 makes deterministic replay a release gate, and §4.3 claims determinism. Both are claims about **one** engine. The moment `engine` touches a browser API, the harness can no longer execute it, and the only remedy is a second implementation — at which point the replay gate verifies an engine that isn't the one shipping, and the determinism claim becomes unfalsifiable.

Everything environment-specific reaches the engine through the D0.8/D0.10 interfaces, injected by the caller. The engine receives evidence and a rule set; it returns a Pass Result. Nothing else.

*Enforced by:* CI gate G-3.

### 2.2 Store access is interface-only

**Nothing imports the Authentication History Store implementation.** Access is exclusively through `AuthStoreReader`, `AuthStoreWriter`, and `AuthStoreUserControl`.

This makes B-1 and B-3 mechanical: the ACEM holds only `AuthStoreReader` and *cannot* reach the writer. §20.11's read-only requirement stops depending on anyone remembering it.

*Enforced by:* CI gates G-4, G-5.

---

## 3. D0.7 — CI Gates

Several architectural invariants can be machine-checked from day one. Retrofitting them after drift has occurred is materially harder, so they go in now, before there is anything to break.

| ID | Gate | Enforces | Available |
|---|---|---|---|
| **G-1** | `tsc --strict`, `noImplicitAny`, `noUncheckedIndexedAccess` | Contract integrity | Now |
| **G-2** | Lint: no `as Origin` / `as unknown as Origin` outside `toOrigin()` | D0.1 I-9, D0.8 B-2 — origin-only persistence (§20.3) | Now |
| **G-3** | Static scan: no browser globals in `packages/engine` | §2.1 above; replay viability | Now |
| **G-4** | `dependency-cruiser`: enforce §2 matrix | Package boundaries | Now |
| **G-5** | Import scan: store implementation reachable only via D0.8 | §20.11, B-1, B-3 | Now |
| **G-6** | **Transmission audit**: no code path from a network-request constructor transitively reads the store | **§20.2 never-transmit** | Now |
| **G-7** | Fixture round-trip: every fixture parses, typechecks, serializes identically | D0.1 shape stability | Now |
| **G-8** | Rule-set static validator: V-1 … V-12 (D0.3 §8) | Release gate (§17.5) | On first rule set |
| **G-9** | Property tests: suppression monotonicity, max-not-product order independence | §6.1 | Stage 1b |
| **G-10** | Deterministic replay against golden corpus | §17.2 | Stage 6 |

**G-6 is worth building properly.** §20.2 is the invariant most likely to fail silently and most damaging when it does — not by decision, but because a later feature transmits "user data" as an undifferentiated category. A reachability check from network call sites is the only thing that catches that in a diff.

---

## 4. D0.1 Capability Spike — before tagging contracts v1.0.0

**Owner:** Role A. **Duration:** one day. **Output:** a committed `ProducerCapabilityManifest` for the extension.

Load a temporary MV3 extension and attempt to populate **every** field in D0.1 across ten pages:

| # | Page type | Tests |
|---|---|---|
| 1 | Google SSO flow | OAuth structure; S-02 registry assumptions |
| 2 | Microsoft SSO flow | Same |
| 3 | Retail bank login | `autocompleteDisabled`, strict CSP |
| 4 | Webmail login | Baseline |
| 5 | SPA with injected login form | `injectedAfterLoad`, `injectingScriptOrigin` |
| 6 | Site with cross-origin form action | CRED-01 primary path |
| 7 | IDN / non-Latin domain | Homograph fields, `scriptsUsed` |
| 8 | HTTP-only login (any findable) | CRED-06 |
| 9 | Multi-hop redirect to login | `redirect` DIVERGENT behaviour |
| 10 | Page requesting camera on load | `precededByUserGesture` |

**Expected incapable** — confirm or refute each:
- `transport.chainComplete`, `transport.chainTrusted` — extension has no certificate chain access
- `dns.*` — entire category
- `permissionContext.precededByUserGesture` — gesture attribution across frames and async handlers

Each confirmed incapability becomes a permanent `PRODUCER_EXCLUSIVE` classification, which means the corresponding rules are **harness-validatable only**. That is a finding worth having in week one rather than week six.

---

## 5. Corpus Capture — start immediately

**Owner:** Role C. **This is the only item with a clock on it.** Phishing URLs decay within hours; a day not captured is positives that cannot be recovered. Start before D0.5 tagging, before the scaffold, before anything else.

### Day-one scope — raw only

1. Poll PhishTank and OpenPhish every 30 minutes for new entries.
2. For each new URL, fetch immediately with Playwright — headless Chromium, realistic user agent, 15-second timeout, single attempt.
3. Persist **raw material only**: rendered DOM after settle, final URL, redirect chain, response headers, TLS chain, fetch outcome, capture date (day granularity).
4. Assign the split at capture: stable hash of `snapshotId` → 60/20/20. **Immutable thereafter** (D0.5 S-2).
5. Record `impersonatedBrand` wherever the feed supplies it — CRED-02 validation is impossible without it.
6. **Do not extract evidence yet.** Extraction follows the contract; raw material outlives it.

Negatives (Tranco top 10k) are not time-sensitive — capture over the following week.

### Report from the first run

Fetch-outcome distribution **split by label**. Expect a materially higher failure rate on positives, since phishing infrastructure cloaks against datacenter IPs far more than legitimate infrastructure does. Failed fetches stay in the corpus (S-4); excluding them biases the positive set toward less sophisticated phishing and flatters recall.

---

## 6. Stage 0 Exit Criteria

- [ ] Scaffold builds; all packages typecheck under strict mode
- [ ] CI gates G-1 … G-7 green
- [ ] Dependency matrix enforced and verified by a deliberate violation test
- [ ] Contracts tagged `v1.0.0` in `packages/contracts`
- [ ] Fixtures committed: clean login, off-origin post, no credential form, SSO flow
- [ ] Capability spike complete; extension manifest committed
- [ ] Capture pipeline running; ≥ 48 hours of positives accumulated
- [ ] Fetch-outcome distribution reported by label

Stage 1a, 1b, and 1c begin in parallel on exit.
