# Architecture-Owner Review Packet — DEC-36 / 37 / 38 + v1.0.0 tag

**Prepared 2026-09-02 by the implementing session. Review aid only** — binds nothing,
changes no decision/flag/manifest/code. The three DECs currently carry self-applied
"Signed by: Jayanth" lines (flagged PROVISIONAL in `DECISIONS.md`); this sheet exists so
a real sign-off or revision can be recorded. Tick one box per item.

---

### DEC-36 — `webRequest` permission REJECTED for the javascript module
**Decision.** Reject the broad `webRequest` + `host_permissions` capability; it would not
make the javascript module evaluable.
**Evidence.** `packages/engine/modules/javascript.ts` gates on four fields; the three that
block it (`listenerOnCredentialField` → DEC-37, `clientSideTransmissionObserved` → Tier 4
DEC-29, `credentialInterfaceInjected` → MutationObserver, unwired) are untouched by
`webRequest`. The fields it *would* fill aren't in the gate → zero gain. Cost is real:
prompts "read your browsing history" + "…all your data on all websites".
**Depends on it.** Negative — manifest stays minimal (`activeTab`, `scripting`, `storage`,
`webNavigation`, `downloads`); javascript module stays unevaluable.

`[ ] APPROVE   [ ] REVISE (reason: ______________________________)`

---

### DEC-37 — `chrome.debugger` for `listenerOnCredentialField` DEFERRED to Phase II
**Decision.** Defer (not reject) `chrome.debugger`; its persistent "started debugging this
browser" banner is disqualifying for the passive Phase I model.
**Evidence.** `getEventListeners` is exposed only via DevTools → `chrome.debugger`
(monkey-patching forbidden, DEC-30). `attach()` forces a non-dismissable banner on every
tab, continuous for an always-on analyzer — contradicts §3.2. Field feeds only
CRED-05/CRED-A1, already DEC-14 non-functional → huge cost, zero payoff.
**Depends on it.** `listenerOnCredentialField` `notCollected` in the content-script
producer; javascript module unevaluable; manifest adds no `chrome.debugger`. Concrete
two-part revisit trigger now recorded in `docs/ProducerCapabilityManifest.md`.

`[ ] APPROVE   [ ] REVISE (reason: ______________________________)`

---

### DEC-38 — authContext login-success: ADOPT §20.5's four conjuncts
**Decision.** Adopt §20.5's four-conjunct login-success inference verbatim, writing one
PROVISIONAL auth-store entry through the existing guarded path.
**Evidence.** Conjuncts: (1) `submit` on a credential form; (2) main-frame nav within
N=10s (N PROVISIONAL, pending calibration); (3) `credentialFormPresent === false` on
landing; (4) any non-httpOnly cookie / session-storage entry. Write goes through guarded
`recordAuthentication` (G-01/G-02 not bypassed); one success is PROVISIONAL, not ESTABLISHED.
Known gaps (restrictive): G-02's `interventionOverriddenInSession` hardcoded false → G-01 is
the operative guard; conjunct 4 under-reports (httpOnly cookies invisible to JS).
**Depends on it.** `apps/extension/login-success.ts` (`evaluateLoginSuccess`,
`LoginSuccessTracker`, `buildAuthRecordRequest`, `LOGIN_SUCCESS_WINDOW_MS`);
`test:loginsuccess`. **Write path only** — CRED-02's read path (`collectLoginInterface`
fingerprint) is still `notCollected` and does not fire.

`[ ] APPROVE   [ ] REVISE (reason: ______________________________)`

---

### Item 4 — v1.0.0 tag (governance choice, not approve/revise)
Four of five CP-0 criteria are met (scaffold, G-1…G-7 green, MANIFEST committed, ≥48h
corpus). The fifth — "contracts tagged v1.0.0" — can't be met honestly at HEAD: `v1.0.0`
means the frozen Stage-0 baseline, but the contracts were amended **6+ times since**:
`3ad38ed` (A-1/A-2) · `e2d9239` (A-3) · `bfecce8` (A-4) · `d806f14` (A-5/A-6) ·
`ce05ded` (A/B) · `bc8d710` (listenerObservations). Pick one:

- **`[ ] Option A — Retroactive Stage-0 tag.`** Tag the pre-amendment Stage-0 commit
  (e.g. import `d721413`, or the state before `3ad38ed`) as `v1.0.0`; HEAD gets its own
  later tag.
- **`[ ] Option B — Phase-I tag at HEAD.`** Don't reuse `v1.0.0` for the amended state; mint
  a new version at HEAD (e.g. `v1.1.0`) naming "contracts as amended through Phase I", and
  update `CHECKPOINTS.md` CP-0 accordingly.

*(`CHECKPOINTS.md`'s CP-0 reasoning favors A or B over stamping `v1.0.0` on HEAD outright.)*
