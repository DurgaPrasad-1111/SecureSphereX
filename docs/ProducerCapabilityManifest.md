# Producer Capability Manifest (A0.4)

Step 10 deliverable. States, for every `SecurityEvidence` field, whether an
MV3 content script can actually produce it — determined by running the
capability spike against six real login pages, not by reading the MV3 docs.

**Run.** 6 pages, all `mainWorldReady: true`, all `patchErrors: []` — the
MAIN/ISOLATED bridge worked on every page, so every verdict is real, none void.

| # | Page | Credential form? |
|---|---|---|
| 01 | github.com | no (repo homepage — no login form) |
| 02 | myaccount.google.com | no (already-signed-in account page) |
| 03 | login.microsoftonline.com | **yes** — email + password + username |
| 04 | account.proton.me/login | **yes** — username + password |
| 05 | bankofamerica.com login | **yes** — email fields, 27 credential listeners |
| 06 | app.notion.com/login | **yes** — email + password |

Four of six carried real credential forms — enough to exercise the
login-detection path that matters most.

---

## Verdicts by field

`OBSERVABLE` = worked on all 6 pages · `PARTIAL` = worked on some ·
`NOT OBSERVABLE` = no content-script API exists · `NOT ATTEMPTED` = not a
content-script capability at all.

### url.* — fully OBSERVABLE (11/11 fields, 6/6 pages)
Every URL field produced on every page. `fullUrl`, `scheme`, `host`, `port`,
`path`, `queryPresent`, `registrableDomain`, `subdomainLabels`, `isIpLiteral`,
`totalLength`, `percentEncodedSegmentCount`. **A content script owns this
category outright.** (01–06)

### transport.* — split
- `isHttps` — **OBSERVABLE** (6/6). Trivially derived from the scheme.
- `certificateSubject`, `subjectAlternativeNames`, `validFrom`, `validTo`,
  `issuer`, `chainComplete`, `chainTrusted` — **NOT OBSERVABLE** (0/6,
  `api_unavailable`). No content-script API exposes certificate data at all.
  **PRODUCER_EXCLUSIVE** — needs a background worker or native host.

### dns.* — NOT OBSERVABLE (all 8 fields, 0/6)
`resolves`, `aRecordCount`, `aaaaRecordCount`, `nameServers`, `cnameTarget`,
`mxPresent`, `txtRecordCount`, `dnssecDeployed`. No browser or extension API
gives a content script raw DNS records. **PRODUCER_EXCLUSIVE** — needs a
server-side or native resolver.

### redirect.* — PARTIAL
- `finalUrl`, `hopCount` — **OBSERVABLE** (6/6). Navigation Timing gives both.
- `initialUrl`, `chain` — **PARTIAL** (5/6). Worked on pages that were the
  navigation origin; on github.com (`redirectCount>0` with an empty referrer)
  the starting URL could not be recovered.
- `crossedRegistrableDomain` — **NOT OBSERVABLE** (0/6). Depends on a reliable
  `initialUrl`, which isn't always available; and the per-hop list is never
  exposed by the platform. **The full hop chain is PRODUCER_EXCLUSIVE** —
  reconstructing it needs `webRequest`/`webNavigation` in a background worker.

### loginInterface.* — the core, and it WORKS
- `credentialFormPresent` — **OBSERVABLE** (6/6). Correctly `false` on
  github/google, `true` on microsoft/proton/bank/notion.
- `forms` — **OBSERVABLE** (6/6). Produced field kinds (`email`, `password`,
  `username`), method, action URL, action registrable domain, and — the hard
  one — `injectingScriptOrigin`. Proton's form was tagged
  `https://account.proton.me`, Notion's `https://app.notion.com`, GitHub's
  `https://github.githubassets.com`. **The extension can see which script
  origin injected a login form.**
- `fingerprint` — **PARTIALLY BUILT** (Decision 3, §20.5 login-success WRITE
  path). `login-success.ts:buildLoginFingerprint` now produces a real
  fingerprint from content-script-observable data — `fieldComposition` (via the
  shared classifier) and `titleTokens` (document.title) — with `faviconHash` /
  `heroImagePerceptualHash` / `dominantColors` honestly `null`/`[]` (a content
  script does not cheaply compute perceptual hashes; fabricating them would be
  worse than absent). This feeds `recordAuthentication` on inferred login
  success. **NOT yet wired into the evaluation READ path:** `collectLoginInterface`
  still returns `fingerprint: notCollected`, so the **authContext module stays
  unevaluable** and CRED-02 cannot fire until the read-path fingerprint (and a
  stored cross-origin match) exist. That read-path wiring is separate,
  deliberately not bundled into the write-path decision.

### scriptRuntime.* — OBSERVABLE, and it caught real signals
- `listenerOnCredentialField` — **DEFERRED TO PHASE II, not rejected**
  (Decision 2, 2026-09-01). ⚠ Correction to the spike's "OBSERVABLE (6/6)"
  claim: the spike read listeners via a technique the PRODUCTION extension
  cannot use — DEC-30 FORBIDS in-page monkey-patching of `addEventListener`,
  and `getEventListeners` is exposed ONLY through the DevTools protocol, which
  in an extension requires `chrome.debugger`. `chrome.debugger` forces Chrome
  to show a persistent "SecureSphere X started debugging this browser" banner
  on every affected tab — disqualifying for the passive, unobtrusive Phase I
  model, whose whole premise (§3.2) is that Tier 0/1 cost the user nothing when
  wrong. **Deferred to Phase II** (not rejected).

  **REVISIT TRIGGER (concrete, testable — added 2026-09-02).** Reopen this
  deferral if and only if BOTH conditions below hold; absent either, the
  `chrome.debugger` banner cost buys nothing and the deferral stands:
  1. a **user-initiated, per-invocation deep-scan UX** exists — the user
     explicitly triggers a debugger-backed scan on a specific tab, so the
     "started debugging this browser" banner appears only during that
     opt-in scan, never on passive Tier 0/1 page loads; AND
  2. the field has a **live consumer** — CRED-05/CRED-A1 are functional
     (i.e. [[DEC-14]]'s non-functional status has been lifted), so collecting
     `listenerOnCredentialField` actually changes a detection outcome.

  Owner of the revisit decision: Architecture Owner. Until both hold, this
  field is `notCollected` in the content-script producer and the javascript
  module stays unevaluable.
- `clientSideTransmissionObserved` / `transmissionEndpoints` — **OBSERVABLE**
  (6/6) but returned `false`/`[]` everywhere. **Caveat: no credential value
  was ever typed** (we never log in), so the detector had nothing to match
  against. This is "observable, not exercised" — not "the capability is
  absent." To get a true positive, someone would type a junk value into a
  password field on one page; the value never leaves the browser.
- `credentialInterfaceInjected` — **OBSERVABLE** (6/6). Correctly `true` on
  the bank (login UI injected after load), `false` elsewhere.
- `dynamicScriptLoadCount`, `dynamicScriptOrigins` — **OBSERVABLE** (6/6).
  Ranged from 5 (Microsoft) to 159 (Notion).

### domainRepresentation.* — split
- `punycodeDomain`, `isIdn`, `containsNonAscii` — **OBSERVABLE** (6/6).
- `unicodeDomain` — **NOT OBSERVABLE** (0/6). No content-script API returns
  the decoded Unicode form separately from the ASCII/punycode form.
- `scriptsUsed`, `isMixedScript`, `confusableSkeleton` — **NOT OBSERVABLE**
  (0/6). Need Unicode script-property and UTS-39 confusables tables the spike
  doesn't bundle. These are **library gaps, not platform gaps** — a real
  producer can bundle the tables. Note this differs from transport/dns, which
  are genuinely unreachable.

### downloadContext.* — NOT ATTEMPTED (all 8 fields)
`chrome.downloads` is a background-worker event. It is not a content-script
capability at all, and none of the six pages was a download, so there was
nothing to attempt. **PRODUCER_EXCLUSIVE by construction** — this entire
category belongs to a background worker.

### permissionContext.* — split
- `pageAgeMs` — **OBSERVABLE** (6/6).
- `requestedPermission`, `requestingOrigin`, `precededByUserGesture` —
  **NOT OBSERVABLE here** (0/6, `not_applicable`): none of the six pages
  requested camera/mic/geolocation/notifications on load. The patches to catch
  such a request are installed and working (bridge was live on all six) — they
  simply had nothing to fire on. **Observable in principle, not exercised.**
  A dedicated permission-prompting page (row 10 in the original plan) would
  confirm it; worth one more capture when convenient.

---

## The PRODUCER_EXCLUSIVE set — the manifest's key output

These fields have **no content-script producer** and must be produced by a
background worker, native host, or server-side resolver. Steps 8 and 15 must
design around this — a content-script module cannot supply them:

- **All of `transport.*` except `isHttps`** (7 fields) — certificate data
- **All of `dns.*`** (8 fields) — DNS records
- **`redirect` full hop chain** (`chain`, `initialUrl` when cross-origin,
  `crossedRegistrableDomain`) — needs `webRequest`/`webNavigation`
- **All of `downloadContext.*`** (8 fields) — `chrome.downloads` events
- **`domainRepresentation.unicodeDomain`** — no API for the decoded form

## Observable-in-principle-but-not-exercised (needs one more capture, not a redesign)

- `loginInterface.fingerprint` — inputs reachable, hashing not implemented
- `scriptRuntime.clientSideTransmissionObserved` / `transmissionEndpoints` —
  needs a typed credential value to match against
- `permissionContext.requested*` / `precededByUserGesture` — needs a page that
  actually prompts for a sensitive permission
- `domainRepresentation.scriptsUsed` / `isMixedScript` / `confusableSkeleton` —
  needs bundled Unicode tables

## What a content script owns outright

`url.*` (all 11), `loginInterface.credentialFormPresent` + `forms` (including
injecting-script origin), `scriptRuntime` listener/injection/script-load
detection, `redirect.finalUrl`/`hopCount`, `domainRepresentation` punycode/idn
checks, `transport.isHttps`, `permissionContext.pageAgeMs`. **The login-form
and script-runtime detection that phishing analysis depends on is fully
within a content script's reach** — which is the finding that unblocks the
login-form and javascript evaluation modules.
