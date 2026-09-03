# Architecture-Owner Review Packet — downloadContext + permissionContext evidence

**Prepared 2026-09-03 by the implementing session. Review aid only** — binds
nothing, decides nothing, implements nothing. Maps what each unfilled evidence
category needs to become real, at the same rigor as the javascript-module
investigation (DEC-36/37). **No recommendation is offered.**

This also settles what PM-01 is waiting on: post-DEC-39 it is NOT waiting on
redirect (redirect is now fully evaluable and PM-01's `or`-arm works). It is
blocked entirely on `permissionContext`, verified against real data — PM-01
fired 0/617, and `permissionContext.requestedPermission` was `notCollected` on
all 617. See §2.

---

## Shared constraint — S-9

`snapshot.format.v1.ts:347-349`, verbatim:

> S-9  DL and PM family rules are NOT corpus-validatable (D0.1 conformance
>      classes). Snapshot-derived metrics cover the CRED family only; DL-01,
>      DL-02 and PM-01 REQUIRE in-browser validation.

Consequence for BOTH categories: the harness extractor stubbing them
(`notCollected`) is CORRECT and permanent — these can only become real in the
live extension. So "un-stub the harness" (the redirect/CRED-04 path) does not
apply here. The question is purely about the extension collector + its
permission cost.

---

## §1 — downloadContext (DL-01, DL-02)

### Evidence unfilled
`DownloadContextEvidence` (8 fields) is `notCollected` in both the harness
extractor and the extension `assembleEvidence` fallback: `downloadUrl`,
`downloadRegistrableDomain`, `referrerUrl`, `referrerRegistrableDomain`,
`declaredFilename`, `declaredExtension`, `declaredMimeType`,
`hasCompoundExtension`.

### ⚠️ The Chrome API is ALREADY wired, and the permission is ALREADY granted
This is the key finding. `apps/extension/service-worker.ts:199` already runs:

```js
chrome.downloads.onCreated.addListener((item) => {
  void chrome.storage.session.set({ 'ssx:last-download':
    { url: item.url, filename: item.filename, mime: item.mime, referrer: item.referrer } });
});
```

and `"downloads"` is already in the manifest `permissions` array. So DL is NOT
blocked on a new API or a new permission. It is blocked on WIRING: the observer
records the last download to session storage but nothing builds
`DownloadContextEvidence` from it. The remaining work is producer-side
derivation, all from data the listener already receives:
- `downloadRegistrableDomain` / `referrerRegistrableDomain` — PSL over
  `item.url` / `item.referrer` via the shared `packages/engine/psl.ts` resolver
  (same path DEC-39 used).
- `declaredExtension` / `declaredFilename` / `declaredMimeType` — from
  `item.filename` / `item.mime`.
- `hasCompoundExtension` — string check on the filename (e.g. `invoice.pdf.exe`).
- `extensionMimeConsistent` (a Findings field DL-02 reads) — compare declared
  extension against declared mime.

### Manifest permission + user-facing prompt
`"downloads"` — **already granted**. Its install-time prompt reads *"Manage your
downloads"*. No NEW prompt, no permission escalation. `host_permissions` is `[]`
and stays so; `chrome.downloads` needs none.

### Rules that depend on it
- **DL-01** (`and`): `declaredExtension ∈ executableTypes` (exe/msi/dmg/…/zip),
  `referrerPresent`, `notSameSite(downloadRegistrableDomain,
  referrerRegistrableDomain)`, AND `priorFindingActive`. Fires on a
  cross-origin executable download that follows an already-flagged page.
- **DL-02** (`or`): `not(extensionMimeConsistent)` OR `hasCompoundExtension`.
  Mismatched extension/mime, or a compound extension like `.pdf.exe`.

### Cost summary
Lowest-cost category by far: no new permission, no new prompt, API already
listening. The gap is a producer-wiring task, not a permission decision.

`[ ] APPROVE wiring downloadContext (no new permission)   [ ] DEFER   [ ] OTHER`

---

## §2 — permissionContext (PM-01)

### Evidence unfilled
`PermissionContextEvidence` (4 fields) is `notCollected` everywhere:
`requestedPermission` (one of camera / microphone / geolocation / notifications
/ clipboard_read), `requestingOrigin`, `precededByUserGesture`, `pageAgeMs`.
Verified live: 0/617 observed.

### ⚠️ `chrome.permissions` is the WRONG API — and there is no clean passive one
This is the genuinely hard category, and the obvious API does not fit:
- **`chrome.permissions`** governs the EXTENSION's OWN optional permissions
  (what SecureSphere X itself may do). It says nothing about what a WEB PAGE
  requests. It cannot fill any field here.
- **No Chrome extension API fires when a page calls** `getUserMedia()`,
  `Notification.requestPermission()`, `navigator.geolocation.getCurrentPosition()`,
  or `navigator.clipboard.readText()`. There is no `onPermissionRequested`
  observer for page-originated prompts.

So `requestedPermission` / `precededByUserGesture` can only be captured by
IN-PAGE INSTRUMENTATION: a content script running in the page's MAIN world that
patches `navigator.mediaDevices.getUserMedia`, `Notification.requestPermission`,
`navigator.geolocation.*` and `navigator.clipboard.*` to record the call and
whether it occurred inside a user-gesture handler.

⚠️ **That collides with a signed ban.** [[DEC-30]] forbids in-page monkey-patching
for listener detection precisely because a hostile page can detect the patched
function (`fn.toString()` no longer native), disable it, or feed it false data —
making the evidence actively misleading, worse than absent. The identical
objection applies to patching `navigator.*` here: a phishing page that detects
the patch behaves benignly and the evidence lies. `getEventListeners`-style CDP
(the DEC-30/37 escape hatch) does NOT help — there is no DevTools-protocol
observer for page permission requests either, and `chrome.debugger`'s banner is
DEC-37-disqualifying for an always-on analyzer regardless.

### Partial, permission-free alternatives — and what they do NOT fill
- `pageAgeMs` IS derivable permission-free (page-load timestamp in a content
  script), and it is one arm of PM-01's `or`. But PM-01's `and` still requires
  conjuncts 1 and 2 (`requestedPermission != null`, `not(precededByUserGesture)`),
  which pageAgeMs cannot supply.
- `chrome.contentSettings` reads per-origin content settings (camera/mic/etc),
  but observes standing SETTINGS, not a runtime request, and gives neither the
  gesture context nor the request timing PM-01 needs.

### Manifest permission + user-facing prompt
No manifest permission cleanly buys this. The `navigator.*` instrumentation
route needs only `content_scripts` in the MAIN world (already how the extension
injects), so no NEW prompt — but it is barred by DEC-30's reasoning, not by a
permission. This is the distinguishing fact: permissionContext is blocked on a
DESIGN prohibition (trustworthy observation of a hostile page's runtime calls),
not on an unpaid permission.

### Rules that depend on it
- **PM-01** (`and`): `requestedPermission != null`, `not(precededByUserGesture)`,
  AND `or(notSameSite(redirect domains) [now works — DEC-39], pageAgeMs < max)`.
  A sensitive permission requested without a user gesture, on a freshly-loaded
  or cross-domain-redirected page. **Two of three conjuncts need
  permissionContext; the redirect arm alone cannot carry the rule.**

### Cost summary
Highest-difficulty category. No correct passive API exists; the only route to
`requestedPermission`/`precededByUserGesture` is in-page `navigator.*` patching,
which DEC-30's signed reasoning forbids as falsifiable-by-a-hostile-page. Any
approval here is really a decision about whether to revisit DEC-30's ban for
this specific evidence, or to accept PM-01 as non-functional (the DEC-14 shape).

`[ ] APPROVE in-page navigator.* instrumentation (revisits DEC-30 ban)   [ ] ACCEPT PM-01 non-functional (DEC-14 shape)   [ ] DEFER   [ ] OTHER`

---

## What this packet settles about PM-01

Post-DEC-39, PM-01 is **not** waiting on redirect. It is waiting on
`permissionContext`, whose two gating fields (`requestedPermission`,
`precededByUserGesture`) have **no trustworthy passive source** — the clean API
(`chrome.permissions`) is the wrong one, and the instrumentation route is barred
by DEC-30. That is a materially harder block than downloadContext's, which is
merely unwired behind an already-granted permission.

**Related:** [[DEC-14]] (non-functional-rule precedent), [[DEC-30]] (the in-page
monkey-patch ban this runs into), [[DEC-36]] / [[DEC-37]] (the javascript-module
permission investigation this mirrors), [[DEC-39]] (the redirect fix that
removed redirect as PM-01's blocker), [[DEFECT-19]] (resolved).

`[ ] APPROVE §1   [ ] APPROVE §2   [ ] APPROVE BOTH   [ ] DEFER BOTH   [ ] OTHER (reason: __________)`

*Signed by: ____________________  Date: __________*
