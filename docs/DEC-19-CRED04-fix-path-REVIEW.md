# Architecture-Owner Review Packet — DEFECT-19 / CRED-04 fix path

**Prepared 2026-09-03 by the implementing session. Review aid only** — binds nothing,
decides nothing. It lays out the two fix paths DEFECT-19 itself names so the choice can
be made on one page. **No recommendation is offered; this is the Architecture Owner's
call.** Nothing is implemented.

---

## The situation, verified against current disk (not the register)

- `packages/engine/modules/redirect.ts:89,91` — `initialRegistrableDomain` and
  `finalRegistrableDomain` are both unconditionally `null`. Unchanged since DEFECT-19.
- **CRED-04 cannot fire.** Its predicate is a three-way `and`:
  `redirect.hopCount ≥ redirect_hop_min` ∧
  `notSameSite(redirect.finalRegistrableDomain, redirect.initialRegistrableDomain)` ∧
  `loginForm.credentialFormPresent`. Both operands of the middle conjunct are permanently
  `null`, so it never matches. Confirmed empirically: in the latest `metrics:confusion`
  run CRED-04 does not appear in per-rule firing — only CRED-06 fires (9×).
- **DEFECT-19 status: OPEN.** Nothing has moved.

**The raw material both options build on already exists.** `capture.py` captures
`raw.redirectChain` (per-hop `fromUrl`/`toUrl`, `capture.py:650`). What is missing is
the registrable-domain (or same-site) derivation over it — which §2.6 forbids the
`redirect` MODULE from doing, so it must happen producer-side.

⚠️ **Correction to DEFECT-19's own framing, confirmed this session.** DEFECT-19 says
`RedirectEvidence.crossedRegistrableDomain` "already exists as a producer-computed
same-site verdict." The CONTRACT FIELD exists (`evidence.contract.v1.ts:203`), but
**nothing computes it**: `capture.py` has zero references to it, and the harness
extractor stubs it `notCollected` (`apps/harness/extract/stubs.ts:93` — `redirect` is a
DEC-26 stub). So Option A is not "thread an existing value through"; it is "compute it in
the producer, un-stub redirect extraction, then thread it." Both options therefore share
that producer + un-stub cost (see Shared costs below); they differ only in WHAT gets
threaded and the resulting contract surface.

---

### Option A — thread `crossedRegistrableDomain` through as a new `RedirectFindings` boolean

**What changes.**
- Contract (FROZEN — hand-typed amendment): add one boolean field to `RedirectFindings`,
  e.g. `crossedRegistrableDomain: boolean` (`evaluation.contract.v1.ts:139-145`). No
  change to `RedirectEvidence` — the field it needs (`crossedRegistrableDomain`) is
  already declared there.
- Producer: `capture.py` computes the same-site verdict over `redirectChain`'s first/last
  hop via the PSL path, writing `raw`'s redirect observation; harness redirect extractor
  un-stubbed to populate `RedirectEvidence.crossedRegistrableDomain`.
- Engine: `redirect.ts` passes the boolean through (a projection, not a derivation — §2.6
  compliant).
- Rule set (FROZEN — hand-typed): CRED-04's `notSameSite(final, initial)` conjunct
  rewritten to read the single boolean, e.g. `is redirect.crossedRegistrableDomain`.
  PM-01's `notSameSite` arm likewise.

**What it costs.** Smaller contract surface — one boolean field, no new domain-string
fields. One producer function (first-vs-last-hop PSL comparison). Touches two FROZEN
files (contract + ruleset), so two hand amendments and an `integrityDigest` recompute
(V-14). Rewrites two rule predicates (CRED-04, PM-01).

**What CRED-04 gains / loses.** Gains: it can fire. Loses expressiveness: the predicate
can only ask "did the chain cross a registrable-domain boundary — yes/no", not "which
two domains". Any future rule wanting the actual initial/final domains (for logging,
brand attribution, or a threshold on which domain) cannot get them from this shape. The
two domain-string fields in `RedirectFindings` would remain permanently `null` and
unused — dead contract surface left in place.

`[ ] APPROVE OPTION A`

---

### Option B — extract real registrable domains producer-side for both `initialUrl`/`finalUrl`

**What changes.**
- Contract (FROZEN — hand-typed amendment): add two fields to `RedirectEvidence`, e.g.
  `initialRegistrableDomain: Observation<string>` and `finalRegistrableDomain:
  Observation<string>` (mirroring `actionRegistrableDomain` / `downloadRegistrableDomain`
  naming). `RedirectFindings` already has the two matching string fields — no change
  there.
- Producer: `capture.py` computes both registrable domains from `redirectChain`'s first
  and last hop via the PSL path; harness redirect extractor un-stubbed to populate both.
- Engine: `redirect.ts` fills `initialRegistrableDomain`/`finalRegistrableDomain` from
  the new evidence fields (projection, §2.6 compliant) instead of `null`.
- Rule set: **no predicate change** — CRED-04's existing
  `notSameSite(redirect.finalRegistrableDomain, redirect.initialRegistrableDomain)` starts
  working as written once the operands are non-null. Same for PM-01.

**What it costs.** Larger contract surface — two new `Observation<string>` fields on
`RedirectEvidence`. One producer function (same first/last-hop PSL comparison as Option A,
but returning two domains instead of a boolean). Touches one FROZEN file (contract) plus a
digest recompute; **no rule-set edit**, since the predicate already expects this shape —
this is the DEFECT-15 fix pattern (swap the vacuous operand for a grounded one) and
DEFECT-18's suggested path for the equivalent `javascript.ts` gap.

**What CRED-04 gains / loses.** Gains: it can fire, AND keeps the two-domain comparison the
predicate already expresses — a future rule can read either actual domain. Loses: nothing
in expressiveness. Cost is the wider contract and two fields to keep grounded rather than
one.

`[ ] APPROVE OPTION B`

---

## Shared costs and caveats (apply to BOTH options)

- **Both require producer work + un-stubbing redirect extraction.** Neither is a
  pure engine change; `redirect` is a DEC-26 harness stub today, and the same-site /
  domain derivation does not exist in `capture.py` yet. This is the bulk of the work and
  is identical for A and B — only the return shape (boolean vs two strings) differs.
- **Both touch FROZEN paths.** `packages/contracts/` and (Option A only)
  `rulesets/rules-v0.1.0.json` are hand-typed by the Architecture Owner, never by tooling
  (CLAUDE.md). A ruleset edit forces an `integrityDigest` recompute or V-14 fails.
- ⚠️ **Neither option makes CRED-04's corpus recall a headline number. S-10 still
  stands.** `snapshot.format.v1.ts:353`: *"CRED-04 is DIVERGENT: the harness observes
  server-side redirect chains the extension may not see. Its corpus recall MUST be
  reported separately and MUST NOT be folded into a headline figure."* This is a SECOND,
  independent barrier that survives either fix — the fix lets CRED-04 fire, but its
  corpus numbers remain divergent-and-separately-reported by contract. Whichever option is
  chosen, CRED-04 does not become a full corpus-validatable rule.
- **PM-01 is affected by both.** Its `notSameSite` arm is unsatisfiable for the same
  reason (though PM-01 can already fire via its page-age arm). Either fix restores the
  redirect arm; Option A additionally requires rewriting PM-01's predicate, Option B does
  not.
- **DEC-14 precedent.** DEFECT-19 accepted CRED-04 as non-functional under the same
  reasoning DEC-14 used for CRED-05/CRED-A1. Approving either option here is the decision
  to reverse that acceptance for CRED-04; declining leaves it standing.

---

`[ ] APPROVE OPTION A   [ ] APPROVE OPTION B   [ ] OTHER (reason: ______________________)`

*Signed by: ____________________  Date: __________*
