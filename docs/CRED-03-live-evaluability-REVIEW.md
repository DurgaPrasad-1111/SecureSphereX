# Architecture-Owner Review Packet — CRED-03 live evaluability (punycode decode)

**Prepared 2026-09-04 by the implementing session. Review aid only** — binds
nothing, implements nothing. Investigated per the instruction to close CRED-03's
live gap "if genuinely cheap, safe, no-tradeoff." A genuine tradeoff was found, so
nothing was implemented; this records precisely why, at the same rigor as
CRED-A1/PM-01's retirement reasoning ([[DEC-46]] / [[DEC-40]]).

---

## The capability question — answered: decode IS feasible and safe

CRED-03 is live-unreachable in the extension today because `collectDomainRepresentation`
marks the homograph fields `notCollected` for an IDN host — the content script has
only the punycode form (`new URL().hostname` → `xn--…`), and unicodeDomain is
recorded 0/6 NOT OBSERVABLE. But that manifest entry itself calls the script/
confusables gap a *"library gap, not a platform gap — a real producer CAN bundle
the tables."* The remaining piece, decoding punycode→Unicode, is the same class:

- **No Web/extension API returns a decoded-Unicode hostname** (`URL.hostname` is
  punycode; there is no `unicodeHostname`). Confirmed.
- **Pure-JS RFC 3492 decode closes it with no tradeoff as a capability:** no
  permission, no page-trust boundary (deterministic string math on the URL's own
  host, not in-page instrumentation — DEC-30 does not apply), and **proven
  byte-identical to node:url `domainToUnicode` (the harness path)** on
  `xn--ypal-43d9g.example`→`раypal.example`, `xn--80ak6aa92e.com`→`аррӏе.com`,
  `xn--e1afmkfd.xn--p1ai`→`пример.рф`, and ASCII pass-throughs. So the extension
  and harness would agree — no new divergence.

**On the capability alone, this is a cheap, safe fix.** It was not implemented
because of what the rule does with it.

## Why it was NOT implemented — the frozen predicate over-fires

CRED-03's predicate is `and(or(neq(confusableSkeleton,null), isMixedScript,
or(isIdn, containsNonAscii)), credentialFormPresent)`. Fed a correctly-decoded
IDN, it fires on **any** non-Latin credential page, not just homographs — measured,
not theorised:

| Page | mixed-script | confusableSkeleton | isIdn | CRED-03 |
|---|---|---|---|---|
| `раypal.example` (Latin+Cyrillic homograph) | yes | `paypal.example` (distinct) | yes | **fires ✓ correct** |
| `пример.рф` (**genuine** Russian, pure Cyrillic) | no | `пpимep.pф` (distinct) | yes | **fires ✗ false positive** |
| `accounts.example.com` (ASCII) | no | absent | no | silent ✓ |

A legitimate pure-Cyrillic domain fires because (a) `isIdn`/`containsNonAscii`
alone satisfy the `or`, and (b) the confusable-skeleton is distinct for essentially
any non-Latin script (Cyrillic а→Latin a, etc.). Enabling the decode would
therefore put a **Medium interstitial on every legitimate Cyrillic / Greek /
Cyrillic-script login page worldwide** — a severe false-positive regression for
international users. This is a property of the FROZEN predicate, present on the
harness path too; the extension only avoids it today by accident of the decode gap.

## Options — Architecture-Owner decision

- **`[ ] A — keep CRED-03 live-non-functional (do not decode).`** No FP regression;
  the gap stays, honestly documented. Status quo, safe. Real homograph detection
  is not gained.
- **`[ ] B — narrow the frozen predicate, THEN decode.`** Require `isMixedScript`
  (and/or confusable-skeleton distinct) so a Latin/Cyrillic HOMOGRAPH is caught but
  a legit single-script IDN is not — then the decode (ready, proven safe) can be
  wired and CRED-03 fires live with real value. **This is a frozen-ruleset amendment
  to `evaluation.contract`/`rules-v0.1.0.json` — DEC-level, hand-typed by the
  Architecture Owner, never by Claude Code.** The recommended real fix.
- **`[ ] C — decode as-is (enable CRED-03 live now).`** Accepts the international
  FP above. Not recommended.

`[ ] APPROVE A   [ ] APPROVE B   [ ] APPROVE C   [ ] OTHER: __________`

**Signed by:** ______________________  **Date:** ______________
