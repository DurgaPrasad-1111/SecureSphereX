# Architecture-Owner Review Packet — DEFECT-41 download re-analysis trigger

**Prepared 2026-09-04 by the implementing session. Review aid only** — binds
nothing, implements nothing. No recommendation is forced; the ruling line at the
end is required before anything is built. Scope: how (or whether) a download
should cause an analysis pass that can actually fire DL-01/DL-02. See
[[DEFECT-41]] for why they are live-unreachable today.

---

## Constraints — checked in code, not assumed

- **No reusable evidence is cached.** `analyzeAndReflect` receives the content
  script's `parts`, builds the pass, and discards it. Only the *verdict output*
  (`ssx:verdict:<tabId>`), the redirect record, and the download record persist
  in `chrome.storage.session` (`service-worker.ts:192/103/249`). There is no
  cached `parts`/`evidence` to reuse.
- **No SW→content channel.** `content-script.ts` only calls `sendMessage`
  (`:62/:86`); it registers **no** `onMessage` listener. A re-collect request is
  a new message type in a direction that does not exist today.
- **This would be the first SW-initiated pass.** `analyzeAndReflect` has exactly
  one call site — the `ssx-evidence` handler (`:122`). The message-driven model
  is documented in the onMessage comment block; every other SW listener
  (webNavigation ×4, downloads.onCreated) does bookkeeping/storage only. The
  single-entry-point property is a real, documented design property — breaking it
  needs its own justification, not just wiring.

---

### Option A — SW-triggered re-pass reusing cached evidence

**What.** On `downloads.onCreated`, if cached `parts` exist for the active tab's
current session, run a new `runPassInSession` combining cached `parts` + the
fresh download evidence — no content-script round-trip.

**Cost.** Requires **adding evidence caching that does not exist today** (and a
`tabId → current-session` map, since the download event carries only a tabId,
not a documentId). Introduces the **first SW-initiated analysis trigger**,
breaking the documented single-entry-point property — acceptable only with an
explicit ruling that the trigger model may grow a second entry. Correctness:
cached `parts` are a *snapshot* — a page mutated since collection is re-analyzed
on stale evidence. Minimization (§20.3): retaining full collected evidence past
one pass is broader collection than today.

`[X] APPROVE OPTION A` — selected; see ruling below.

### Option B — SW-triggered re-pass via a fresh content-script round-trip

**What.** On a download, the SW messages the tab; the content script re-collects
and resends `ssx-evidence`; the normal pass then runs with the download record
present.

**Cost.** New **two-way messaging** (SW→content message type + a content-script
`onMessage` listener + re-collect path) — none of which exists. Correctness
risk: if the download fired on a page the content script has already **torn down
or navigated away from**, `sendMessage` reaches no listener and **silently
fails** today — needs an explicit fallback. Worse, if the page has navigated,
re-collection returns the *new* page's evidence in a *new* session, so the
download record (attributed to the old context) is evaluated against the wrong
page. Still introduces the first SW-initiated trigger (same property break as A).

`[ ] APPROVE OPTION B`

### Option C — accept DL-01/DL-02 as dormant, defer

**What.** No code change.

**Cost.** Two already-correct, already-tested rules stay unreachable in real use
**indefinitely, with no committed revisit timeline**. Context: DL is S-9
(in-browser-only, never corpus-validated), so this blocks **no measurement or
reporting** — it is a genuine *detection* gap, not a measurement gap. The engine
threading (DEC-43/44) remains proven; only the live trigger is absent.

`[ ] APPROVE OPTION C`

### Option D — periodic / heartbeat re-analysis while a tab is open

**What.** Re-run analysis on a timer (`chrome.alarms`) for open tabs, independent
of downloads — would also help any rule gated on a delayed condition.

**Cost.** Likely conflicts with **§3.2's passive / no-nag premise**: it adds
ongoing background work and repeatedly wakes the MV3 service worker, which is
event-driven and meant to stay dormant — the opposite of the current model.
Broadest over-collection of the four, and aimed at a problem (downloads) that is
inherently event-shaped. Included for completeness; likely not the practical
answer for this defect.

`[ ] APPROVE OPTION D`

---

**Architecture Owner ruling:**
`[X] APPROVE OPTION A   [ ] APPROVE OPTION B   [ ] APPROVE OPTION C   [ ] APPROVE OPTION D   [ ] OTHER: __________`

**Selected: Option A**, with the three binding requirements recorded in DEC-45
(route through the existing `#withKeyLock`; verify minimization by test; bound
cache staleness) — those requirements are part of the ruling, not optional.

⚠ **Provenance (stated plainly, same distinction as the v1.0.0 tag decision):**
the Architecture Owner directed that DEFECT-41 be resolved and specified the
three binding requirements; the **option choice (Option A) was DELEGATED to the
advising / implementing session**, which selected it. This is the implementing
session's selection under delegation — **NOT the Architecture Owner's personal
ruling** — so no self-applied "Signed by: Jayanth" line is used.

**Signed by:** implementing session, under Architecture-Owner delegation  **Date:** 2026-09-04
