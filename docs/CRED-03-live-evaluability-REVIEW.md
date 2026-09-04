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

`[ ] APPROVE A   [X] APPROVE B   [ ] APPROVE C   [ ] OTHER: __________`

⚠ **Provenance (delegated, same honesty standard as DEC-45 / DEC-46):** Option B
was **selected and its predicate designed by the advising (implementing) session**
under the Architecture Owner's direction to pursue it — NOT a personal,
line-by-line Architecture-Owner ruling on the exact predicate. Jayanth may instead
rule on the predicate directly; otherwise this is the delegated determination.

---

## The exact hand-edit (for the Architecture Owner to apply — NOT applied here)

The false positive comes from the deceptive-identity `or` firing on **any** IDN /
non-ASCII / confusable-script domain. The discriminator between a Latin↔non-Latin
HOMOGRAPH and a legitimate single-script IDN is `isMixedScript` (a domain mixing
scripts within itself to impersonate a Latin brand). Replace the whole `or` with a
single `isMixedScript` gate.

**BEFORE** (`rules-v0.1.0.json`, CRED-03 `predicate`):
```json
{
  "op": "and",
  "operands": [
    {
      "op": "or",
      "operands": [
        { "op": "neq", "path": "homograph.confusableSkeleton", "value": null },
        { "op": "is", "path": "homograph.isMixedScript" },
        { "op": "or", "operands": [
            { "op": "is", "path": "homograph.isIdn" },
            { "op": "is", "path": "homograph.containsNonAscii" }
        ]}
      ]
    },
    { "op": "is", "path": "loginForm.credentialFormPresent" }
  ]
}
```

**AFTER** (gate on mixed-script + a credential form):
```json
{
  "op": "and",
  "operands": [
    { "op": "is", "path": "homograph.isMixedScript" },
    { "op": "is", "path": "loginForm.credentialFormPresent" }
  ]
}
```

Both operands use paths/ops already present in the current predicate, so V-2 and
the static validator accept them unchanged. (Optional, more conservative variant
if desired: `and(is(isMixedScript), neq(confusableSkeleton, null), credentialFormPresent)`
— but `isMixedScript` alone already yields the result below.)

**Proven in memory (narrowed predicate + the decode, touching no frozen file):**

| Page | isMixedScript | CRED-03 |
|---|---|---|
| `раypal.example` (Latin+Cyrillic homograph) | true | **FIRES ✓** |
| `xn--80ak6aa92e.com` (apple look-alike) | true | **FIRES ✓** |
| `пример.рф` (genuine Russian, pure Cyrillic) | false | **silent ✓ (FP gone)** |
| `accounts.example.com` (ASCII) | false | silent ✓ |

**Tradeoff, stated:** a homograph where EVERY Latin glyph is replaced (fully
single-script) is not `isMixedScript` and would not be caught by CRED-03 — but it
is also indistinguishable from a legitimate single-script IDN without a brand
target list, which is CRED-02's job (auth-store cross-origin fingerprint match).
Acceptable for Phase I.

**Frozen-artifact mechanics the hand-edit must satisfy** (as with a contract
amendment — hand-typed by the Architecture Owner, never by Claude Code): after
changing the predicate, bump CRED-03's `lastModifiedIn` (0.1.0 → the new version),
recompute the `integrityDigest` (`npm run digest:ruleset`) and update it so V-14
passes, and decide the §12.2 versioning (in-place amendment vs a new
`rules-v0.x.0.json`). Then the advising session wires the punycode decoder into
`collectDomainRepresentation` and re-verifies (Phase 2, pending this edit).

**Signed by:** ______________________  **Date:** ______________
