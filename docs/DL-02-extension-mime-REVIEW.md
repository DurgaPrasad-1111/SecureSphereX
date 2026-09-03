# Architecture-Owner Review Packet — DL-02 unknown-vs-inconsistent (DEFECT-39)

**Prepared 2026-09-03 by the implementing session. Review aid only** — binds
nothing, decides nothing, implements nothing. **No recommendation is offered.**
Same handling as DEFECT-19: the root fix touches a frozen artifact, so it is the
Architecture Owner's ruling.

---

## The defect, in one paragraph

DL-02's predicate is `or(not(is(downloadContext.extensionMimeConsistent)),
is(hasCompoundExtension))` (`rulesets/rules-v0.1.0.json:658-663`, frozen). The
module returns `extensionMimeConsistent` as a THREE-STATE value —
`true`/`false`/`null` (unknown) — but the engine `is` operator tests only
`=== true` (`stage2.ts:180`), so `not(is(x))` matches for BOTH `false`
(genuinely inconsistent) AND `null` (unknown). Because `EXTENSION_MIME_MAP`
(`downloadContext.ts:62-76`) has only 14 executable/archive extensions, every
ordinary type (pdf, png, jpg, docx, xlsx, mp4, …) resolves to `null` → DL-02
fires. HIGH severity, S-9-invisible: it cannot be caught by any gate and
surfaces only against real download traffic. Full analysis: DEFECT-39.

**Ownership is settled: RULESET-level.** The module's three-state output is
correct; the frozen predicate is what conflates `null` with `false`. No
module-only change fully fixes it (see Option B). Scope is contained —
`extensionMimeConsistent` is read by DL-02 alone.

---

### Option A — amend the frozen predicate (Annex A)

**What changes.** `rulesets/rules-v0.1.0.json` DL-02: replace
`not(is(extensionMimeConsistent))` with `eq(extensionMimeConsistent, false)`, so
the arm fires only on a KNOWN-inconsistent pairing and stays silent on both
consistent and unknown. The engine already has `eq` (`stage2.ts:227`) — no
engine change. `hasCompoundExtension` arm unchanged.

**What it costs.** A hand-typed Annex A amendment to the FROZEN ruleset, plus an
`integrityDigest` recompute (or V-14 fails), same mechanics as DEC-31/DEC-39.
Changes DL-02's meaning precisely and completely: "fire on known inconsistency
or a compound extension," which is what the rule's name already claims.

**What DL-02 gains/loses.** Gains: the over-fire is eliminated at the root,
permanently, for every unmapped extension — no map to maintain. Loses: nothing
in intended coverage; a genuinely inconsistent `.exe`-as-`image/png` still fires
(that resolves to `false`, not `null`).

`[ ] APPROVE OPTION A`

---

### Option B — expand `EXTENSION_MIME_MAP` (module-only, frozen-safe)

**What changes.** Add common benign types to the map in
`packages/engine/modules/downloadContext.ts` so pdf/png/jpg/docx/… resolve to
`true` (consistent) instead of falling to `null`. No frozen file touched.

**⚠️ This is a FREQUENCY MITIGATION, not a fix.** It reduces how often `null`
occurs but cannot eliminate it: the extension space is unbounded, so some
unmapped extension always remains, and for it `not(is(null))` still fires. It
also does nothing for the generic-mime `null` path (`:92`).

**How large would the map need to be?** For "reasonable real-world coverage" —
documents (pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv, rtf, odt), images
(png, jpg, jpeg, gif, webp, svg, bmp, ico, tiff, heic), audio (mp3, wav, ogg,
flac, m4a, aac), video (mp4, webm, mov, avi, mkv, m4v), plus fonts and a long
tail — realistically **60-100+ entries**, each with one or more valid mimes,
and it would need ongoing maintenance as types appear. It can NEVER be complete.
So even at 100 entries, a novel or rare extension still triggers the over-fire.

**What DL-02 gains/loses.** Gains: fewer false positives on common types
immediately, no frozen-file change. Loses: the root defect persists for the
long tail; a map that must grow forever; false sense of "fixed."

`[ ] APPROVE OPTION B`

---

### Option C — module returns "not-inconsistent" for unknown (module-only)

**What changes.** Make `computeExtensionMimeConsistent` return `true` (rather
than `null`) for an unknown extension, collapsing unknown into the
"not-inconsistent" bucket so `not(is(true))` = noMatch → DL-02 silent.

**⚠️ This corrupts the field's documented semantics.** `extensionMimeConsistent`
is defined three-state and the module header documents `null` as the
"inconclusive" state; returning `true` for unknown asserts a consistency the
producer cannot know — an I-2-style over-claim, the same class of thing this
project elsewhere refuses. It also silently changes the generic-mime path if
applied there. Frozen-safe, but at the cost of making the field lie.

`[ ] APPROVE OPTION C`

---

## The open question (whichever option) — residual-unknown behavior

Under Option A the unknown case is silent by construction. Under B/C a residual
unknown always remains. **What should DL-02 do for a genuinely unknown
extension/mime pairing — fire or stay silent?**

This project's stated preference elsewhere is restrictive/no-fire under
uncertainty (e.g. `notSameSite` on a null domain is a noMatch, not a match;
DEC-30's "absent beats falsified"). Applying that here would favor **silent**
for the unknown case — but that is a deliberate detection-vs-false-positive
tradeoff (a silent DL-02 misses a truly-inconsistent download whose extension
happens to be unmapped), and it is the Architecture Owner's call, not encoded
here.

`[ ] unknown -> SILENT (restrictive, matches project default)   [ ] unknown -> FIRE (favor recall)   [ ] OTHER`

---

`[ ] APPROVE OPTION A   [ ] APPROVE OPTION B   [ ] APPROVE OPTION C   [ ] OTHER (reason: __________)`

*Signed by: ____________________  Date: __________*

**Related:** DEFECT-39 (this defect), DEFECT-38 (the producer that surfaced it),
DEFECT-19 / DEC-19-CRED04-fix-path-REVIEW.md (the same ruleset-level →
decision-packet precedent).
