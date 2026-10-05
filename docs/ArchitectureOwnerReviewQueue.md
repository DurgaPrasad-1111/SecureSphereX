# Architecture Owner Review Queue

Consolidated for Jayanth (Architecture Owner). Pulls the current, verbatim text
of every **CANDIDATE — unsigned, open** decision in `DECISIONS.md`. This document
**routes, it does not decide**: it offers no resolution beyond what each decision's
own text already records. Each item is tagged **HIGH / MEDIUM / LOW** by what it
blocks *functionally today* (not by age), HIGH first.

**Generated 2026-10-05** (regenerated from `DECISIONS.md` as it stands today — the
prior generation was 2026-08-26 and predated DEC-20/24/25/33/34). Regenerate by
re-consolidating from `DECISIONS.md`, not by hand-editing this file.

**The full CANDIDATE set, confirmed directly against `DECISIONS.md` today** (every
`## DEC-N (CANDIDATE — unsigned, open)` heading): **DEC-12, 13, 15, 16, 17, 18, 19,
20, 24, 25, 33, 34** — 12 decisions. All other DEC-1…DEC-48 entries carry a
`Signed by: Jayanth (Architecture Owner)` line or an explicit delegation and are not
listed here.

Tag key:
- **HIGH** — blocks something currently shipping or measured.
- **MEDIUM** — a real gap, but nothing currently depends on it.
- **LOW** — a spec-vs-implementation gap with no functional consequence today.

---

## HIGH

### DEC-13 — Cross-environment corpus payload access mechanism  · **HIGH**

**Open since:** 2026-08-22 ("surfaced concretely on 2026-08-22 during DEFECT-6's
verification").

**What's being decided:** DEC-1 named "on disk (and/or an external store)" as the
corpus payload's home but never specified a mechanism — no endpoint, bucket, mount
path, or credential scheme is recorded anywhere. Is cross-environment access to real
payload ever needed, and if so by what mechanism — or is "payload lives only on the
capture machine, `INDEX.jsonl` is the portable record" the permanent intended shape?

**Current recommendation:** None recorded — `DECISIONS.md` states the question
without a lean.

**Why HIGH today:** this is the literal problem that recurs whenever the corpus must
move between machines — the master-prompt's own Part 0 had to detect
`CORPUS_AVAILABLE` precisely because payloads live on one machine and not others.
On *this* machine payloads are present, but the *mechanism* for a teammate, CI, or
disaster-recovery to reach real payload is still unspecified — so any corpus-
dependent CI step or second developer is blocked until it is ruled.

**Verbatim source:** `DECISIONS.md`, `## DEC-13`.

---

## MEDIUM

### DEC-12 — Sanctioned constructors for the five brands  · **MEDIUM**

**Open since:** contextually Step 8 (fixture authoring), ~2026-08-21.

**What's being decided:** `AnalysisSessionId`, `TargetResourceId`, `PassResultId`,
`FindingId`, and `DayStamp` were branded as TYPES ONLY (DEC-3 Annex A-3/A-4) — no
sanctioned constructor exists for any of the five (unlike `Origin`/`toOrigin()`).
They enter the type system via unvalidated `as` cast at every boundary. Do the five
get parse-validated constructors modelled on `toOrigin()` (all five, or only those
with an enforceable format), or is `as`-cast deliberately accepted with validation
deferred to producer-side testing?

**Current recommendation:** None recorded.

**Why MEDIUM:** nothing depends on it today ("the current `as`-cast pattern compiles
and Step 8 is closed against it"); it is a real type-safety gap that becomes relevant
when the capture pipeline ingests external data or the engine reads corpus payloads.

**Verbatim source:** `DECISIONS.md`, `## DEC-12`.

---

### DEC-15 — Stage 1 orchestration envelope (4 of 5 fields open)  · **MEDIUM**

**Open since:** 2026-08-26 (opened and amended the same day).

**What's being decided:** `SecurityEvaluation<M>`'s `moduleVersion`, `indicators`,
`consistency`, and `summary` have no documented generation scheme anywhere in the
spec corpus. (`evaluationId`, originally part of this question, was resolved
2026-08-26.) DECISIONS.md's own per-field framing: `moduleVersion` — (a) shared
engine package version or (b) per-module version constant, lean (a) if forced;
`indicators` — ship `[]` as the schema's documented placeholder, the derivation
registry is what's open; `consistency` — no safe default, `indeterminate`-always is a
substantive claim needing sign-off; `summary` — no recommendation, no safe default.

**What resolving it unblocks:** a complete `SecurityEvaluation<M>` envelope —
`orchestrator.ts`'s `assembleSecurityEvaluation` throws `Stage1EnvelopeBlockedError`
rather than fabricate these four. Per the same amendment, it does **not** by itself
unblock Stage 2.

**Why MEDIUM:** the live detection/measurement path (`runAnalysisPass`) does not
depend on the full Stage-1 envelope — detection ships and the corpus is measured
without it — so this blocks envelope completeness, not anything currently shipping.

**Verbatim source:** `DECISIONS.md`, `## DEC-15` + its 2026-08-26 amendment.

---

### DEC-16 — A-01 / User-Trusted Origin evidence gap  · **MEDIUM**

**Open since:** `rules-v0.1.0` authoring (Step 11), recorded in the rule set's own
`changeLog`.

**What's being decided:** A-01 (§6.4) has **zero** guards in the rule set — it is
absent from `suppressions` entirely (only S-01, S-02 present). The changeLog explains
why: no evidence category represents "a per-origin explicit user trust action"; the
frozen `trust_validity_days` ParameterId has nowhere for its guard data to live;
shipping A-01 with `guards: []` would violate §6.1. Two paths: (a) an
evidence-contract amendment adding the missing category, or (b) confirmation that
user-trust suppression lives entirely outside the rule-set predicate mechanism.

**Current recommendation:** None — two genuinely open paths.

**Why MEDIUM:** A-01 is simply absent; its five target rules (CRED-01/04/07, PM-01,
DL-01) get no user-trust reduction, a complete absence. Nothing currently measured
depends on A-01 existing; it is addable to a future rule-set version.

**Verbatim source:** `DECISIONS.md`, `## DEC-16`.

---

### DEC-24 — B1.6: extend property-test coverage to B1.4 + consistency relations  · **MEDIUM**

**Open since:** 2026-08-29 (B1.4 `stage7-8.ts` and `consistency.ts` post-date the
B1.5 plan, which froze with dependency line `B1.2, B1.3`).

**What's being decided:** B1.5's property-test exit criteria remain unmet and still
accurate; `stage4`/`stage5-6` fixture tests are example-based (no generators). The
open question is extending property coverage to the functions that post-date the
plan: `stage7-8.ts` (5 exported functions, B1.4) and `consistency.ts` (11, DEC-21) —
"3 functions originally in scope, 16 outside it," ~15 properties instead of ~7, plus
generators for the ten `*Findings` shapes.

**Current recommendation:** None — DECISIONS.md quantifies the cost without picking a
schedule.

**Why MEDIUM:** real test-coverage debt on pure engine functions; nothing currently
broken depends on it, but it is the gate B1.5/B1.6 names and is cited by DEC-25 as
where order-dependence could still hide.

**Verbatim source:** `DECISIONS.md`, `## DEC-24`.

---

### DEC-25 — Output canonicalisation as a class (engine-wide requirement, or case by case?)  · **MEDIUM**

**Open since:** 2026-08-29 (found by the first property test run).

**What's being decided:** determinism is contracted (§4.3, P-13, G-10). Two defects
of this class (DEFECT-26 record-order instability; DEFECT-27 IEEE-754 non-associative
`primarySum`) were found in one function and **both fixed**. The open question is
whether order-independence is an *engine-wide* requirement to be designed for and
checked, versus established case by case — "wherever the engine projects a collection
or accumulates a number, the OUTPUT inherits the INPUT's order unless something is
done about it," and nothing currently requires an author to think about it.
DEFECT-28 (a §9.3 cardinality ambiguity) is deliberately NOT folded in — different
root cause.

**Current recommendation:** None — DECISIONS.md frames the systemic question without
deciding it; notes `stage7-8.ts`/`consistency.ts` have no property coverage (→ DEC-24).

**Why MEDIUM:** the two known instances are fixed; the systemic exposure is a real gap
in uncovered pure functions, but nothing is currently observed broken.

**Verbatim source:** `DECISIONS.md`, `## DEC-25`.

---

### DEC-33 — Tier-3 CDP selector does not match `classifyField`'s full coverage  · **MEDIUM**

**Open since:** 2026-08-29+ (scopes DEC-30 Part 4, signed 2026-08-29; does not reopen
DEC-30).

**What's being decided:** DEC-30's CDP query is
`input[type=password], input[type=email], input[autocomplete]` — reaches
`classifyField`'s Tier 1 + Tier 2 only. Tier 3 (name/id pattern matching over
`<select>`/`<textarea>`/plain inputs) is invisible to the CDP query, so Tier-3
listener detection can never fire on a field classified credential purely by
`name`/`id`. DECISIONS.md lays out two options: **(a)** broaden the CDP query to all
inputs and port `classifyField`'s Tier-3 regex into `capture.py` (cost: a dual-
language heuristic with no shared source/oracle — the exact DEFECT-34 drift shape,
plus more CDP round-trips); **(b)** keep the narrow declared-attribute selector and
document the gap as an explicit Phase-I scope limit. The entry's own title recommends
**scoping to declared signals only (Phase I)** = option (b).

**Why MEDIUM:** Tier-3 listener detection (CRED-05 / `listenerOnCredentialField`) is
not producing live signal today (sentinel never run, CRED-05 non-functional Phase I),
so nothing currently measured depends on this; it is a real design-scoping gap for a
not-yet-live capability.

**Verbatim source:** `DECISIONS.md`, `## DEC-33`.

---

### DEC-34 — Tier-3 CDP scaffolding: iframe reach + loopback isolation findings  · **MEDIUM**

**Open since:** 2026-08-29+ (records validation of the already-scaffolded Tier-3
mechanism; own entry, not an addendum to signed DEC-30).

**What's being decided (recorded for acceptance):** synthetic validation found the
CDP scaffolding blind to iframe-embedded fields. Fix has two mechanisms — (1)
same-process frames reached by walking the pierced `contentDocument` tree; (2)
out-of-process frames reached via Playwright's `new_cdp_session(frame)`, combined via
the "no separate session" exception rather than manual classification. Load-bearing
finding: under Chromium's default (flagless) launch — what `capture.py` runs —
neither a port-only nor a hostname-only loopback difference produces a genuine OOPIF;
`--site-per-process` is required to get one at all. **Practical consequence:**
production `capture.py` will only ever see genuine OOP isolation against real external
cross-site content, not against loopback test rigs.

**Current recommendation:** None — DECISIONS.md records the validation and its
Phase-I consequence; the open item is Architecture-Owner acceptance of that scope.

**Why MEDIUM:** same as DEC-33 — concerns the not-yet-live Tier-3 capture path;
nothing currently measured depends on it.

**Verbatim source:** `DECISIONS.md`, `## DEC-34`.

---

## LOW

### DEC-17 — S-01 guard narrowing (missing drift-tolerance condition)  · **LOW**

**Open since:** `rules-v0.1.0` authoring (Step 11, `fd61b76`).

**What's being decided:** S-01 (§6.2) is **live and shipping**, but self-narrowed —
§6.2 specifies three guard conditions (`origin_present`, `lifecycleState=ESTABLISHED`,
and fingerprint drift within tolerance); the live rule encodes only the first two. Its
own rationale: "No ParameterId exists for a drift-tolerance threshold… treating
drift-within-tolerance as already folded into the module's ESTABLISHED determination…
a real narrowing of §6.2's literal three-condition wording." Add a drift-tolerance
ParameterId, or accept the narrowing as permanent?

**Why LOW:** DECISIONS.md's own verdict — "Nothing functionally today — S-01 validates
cleanly." A spec-vs-implementation gap. Worth knowing that anyone relying on S-01
today (CRED-02 nullification, CRED-01/04 halving) relies on the narrowed two-condition
version, even though nothing is currently broken.

**Verbatim source:** `DECISIONS.md`, `## DEC-17`.

---

### DEC-18 — `blockedBy` has no domain-scoping mechanism  · **LOW**

**Open since:** 2026-08-26 (found implementing Stage 4).

**What's being decided:** §6.3 (S-02) requires "CRED-03 has not fired **against the
action domain**" — a domain-scoped negative guard. `SuppressionDefinition.blockedBy`
is bare `RuleId[]` with no domain scoping, and `CorrelationFinding` has no domain
field; implemented as the coarser "did the named rule fire at all this pass" check.
Add a domain field / richer `blockedBy` shape, or accept the coarse check as
permanent?

**Why LOW:** "Nothing observably today" — the one live case (S-02 `blockedBy:
['CRED-03']` on `off-origin-post`) gives the same answer under either check since only
one domain is in play. Spec-vs-implementation gap; S-02 is live. Becomes relevant only
when a pass has CRED-03 firing on a different domain than S-02 evaluates.

**Verbatim source:** `DECISIONS.md`, `## DEC-18`.

---

### DEC-19 — CRED-A1's single-parent interpretive choice  · **LOW**

**Open since:** 2026-08-26 (surfaced implementing Stage 5/6).

**What's being decided:** §7.2 states CRED-A1's parent as "CRED-01 **or** CRED-02";
`RuleDefinition.parent` is singular and the aggregation model is single-parent
throughout. The rule set chose CRED-01 as sole parent — "an explicit judgment call
pending architect ruling. Consequence: this aggravator will NOT contribute when only
CRED-02 (not CRED-01) is present." Widen `parent` to multiple (a frozen-contract +
§9.2 change), or accept single-parent as permanent?

**Why LOW:** "Nothing today — CRED-A1 has never matched any fixture because DEFECT-18
already makes its predicate permanently unsatisfiable," and DEC-46 (signed) accepted
CRED-A1 non-functional for Phase I. The narrowing is real but inert. Becomes relevant
only if DEFECT-18 is resolved and CRED-A1 becomes reachable.

**Verbatim source:** `DECISIONS.md`, `## DEC-19`.

---

### DEC-20 — `confusableSkeleton`'s absent-vs-present convention enforced only by a comment  · **LOW**

**Open since:** 2026-08-26+ (`homograph.ts` module-comment convention; the false
positives it describes were real and are fixed).

**What's being decided:** `homograph.ts`'s comment states `present` means "has a
confusable skeleton distinct from itself" and `absent` means "does not"; the frozen
contracts (`confusableSkeleton: Observation<string>` / `string | null`) carry no
comment, name, or type expressing that. A contract-naive producer naturally emits the
skeleton unconditionally (UTS-39 `skeleton()` is total). That happened: all four
fixtures emitted `confusableSkeleton: present('<the domain itself>')`, and CRED-03
(baseWeight 45) fired on three of four — including the deliberately-benign
`clean-login` baseline — with the false positive hardcoded as expected in two tests.
Both tests were corrected as part of that fix.

**Status note (cross-reference, not a new ruling):** CRED-03's dependence on this
convention was **removed by DEC-47 (signed 2026-09-19)**, which narrowed CRED-03's
predicate to `is(homograph.isMixedScript)` and dropped the
`neq(confusableSkeleton, null)` conjunct. No live rule now reads the convention, so
DEC-20's functional concern is **inert today**; what remains open is whether the
convention should be made contract-enforced (name/type/comment) for future producers.

**Why LOW:** no functional consequence today (post-DEC-47); a producer-contract
hygiene question.

**Verbatim source:** `DECISIONS.md`, `## DEC-20`; cross-ref `## DEC-47`.

---

## Separately flagged — not a DEC or DEFECT entry

### Ruleset filename/version mismatch  · reserved by standing AO instruction

`rulesets/rules-v0.1.0.json`'s filename reads `v0.1.0`; its own `ruleSetVersion` field
reads `"rules-v0.2.0"` (DEFECT-15's fix bumped the internal version per §14.1 on
2026-08-25 without renaming the file, authorized by Jayanth). **Nothing depends on the
filename matching the internal version** (confirmed Part 2, 2026-10-05): the digest
tool, the ruleset validator, CI, `build-extension.mjs`, `service-worker.ts`, and ~20
tests all reference the file by its *stable path* and operate on content — a rename
would break those paths, not fix anything. Reserved by a standing instruction across
sessions ("Do not rename… leave the fix to me"); hygiene/consistency only.

---

## Queue summary

| Item | Tag | Open since | Blocks functionally today |
|---|---|---|---|
| DEC-13 cross-environment payload access | **HIGH** | 2026-08-22 | corpus transfer / CI-or-teammate access to real payload; mechanism unspecified |
| DEC-12 brand constructors (`as`-cast) | MEDIUM | ~2026-08-21 | nothing today; relevant when a producer runs outside a fixture |
| DEC-15 Stage-1 envelope (4 fields) | MEDIUM | 2026-08-26 | complete `SecurityEvaluation<M>` envelope; not the live detect/measure path |
| DEC-16 A-01 zero guards | MEDIUM | Step 11 | nothing measured; A-01 absent for 5 rules |
| DEC-24 B1.6 property coverage | MEDIUM | 2026-08-29 | test-coverage debt on stage7-8 + consistency |
| DEC-25 output canonicalisation (class) | MEDIUM | 2026-08-29 | known instances fixed; systemic exposure in uncovered functions |
| DEC-33 Tier-3 CDP selector coverage | MEDIUM | 2026-08-29+ | not-yet-live Tier-3 capture; recommends Phase-I option (b) in its own text |
| DEC-34 Tier-3 CDP iframe/loopback | MEDIUM | 2026-08-29+ | not-yet-live Tier-3 capture; AO acceptance of Phase-I scope |
| DEC-17 S-01 guard narrowing (live) | LOW | Step 11 | nothing functional; spec-vs-impl in a live rule |
| DEC-18 `blockedBy` no domain scoping (live) | LOW | 2026-08-26 | nothing observable; spec-vs-impl, S-02 live |
| DEC-19 CRED-A1 single-parent | LOW | 2026-08-26 | nothing — CRED-A1 inert (DEFECT-18 + DEC-46) |
| DEC-20 confusableSkeleton convention | LOW | 2026-08-26 | nothing — inert post-DEC-47; producer-contract hygiene |
| Ruleset filename/version mismatch | reserved | 2026-08-25 | nothing; reserved by standing AO instruction |

**Resolved, listed for completeness:** DEC-1 (corpus storage — signed 2026-08-21),
DEC-3 (five contract amendments — signed 2026-08-21). The old stale banner
"Revision 1 — awaiting Architecture Owner signature" in `DECISIONS.md`'s top matter is
document-level only; individual entries carry their own signature lines.

**Open DEFECT-level items (tracked in `docs/DEFECTS.md`, not adjudicated here):**
DEFECT-14 (G-6 co-occurrence heuristic), DEFECT-31 (`FABRICATION_FORCED_BY_SHAPE`,
underlies CRED-A1), DEFECT-45 (`presentsCredentialInterface` unpopulated — impact
none), DEFECT-46 (CRED-01/07 benign false positives — decision packet drafted
separately). (The earlier queue's DEFECT-19 routing is retired: DEFECT-19 is RESOLVED
— the harness path now fires CRED-04, S-10 divergent.)
