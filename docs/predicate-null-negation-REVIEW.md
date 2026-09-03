# Architecture-Owner Review Packet — predicate null-under-negation (the DEFECT-39/40 class)

**Prepared 2026-09-03 by the implementing session. Review aid only** — binds
nothing, implements nothing. This is a CORE EVALUATION-SEMANTICS decision and is
treated with that weight: it needs the same explicit checkpoint DEC-19 and
DEC-37 got. **Unlike prior packets, this one carries a recommendation** (the
Architecture Owner flagged Option B directly); the formal ruling line at the end
is still required before anything is built.

---

## The finding — the leak lives in ONE place

Every leaf operator in `stage2.ts` already guards a finding-level `null`
correctly, returning `noMatch`:
- `is(x)`: `value === true ? 'match' : 'noMatch'` (`:180`) — null → noMatch.
- `eq/neq(x, v)`: `value === v` (`:231`) — null → noMatch unless v is null.
- `gte/lte/gt/lt`: `if (typeof value !== 'number') return 'noMatch'` (`:220`) —
  null never reaches the native comparison, so it is NOT coerced to 0.
- `inSet`: `if (typeof value !== 'string') return 'noMatch'` (`:250`).

So a null operand, on its own, is silent/restrictive — the correct direction.
**The entire footgun is that `not` cannot distinguish the two reasons a child
returned `noMatch`:**

```
stage2.ts:182  case 'not':
  const inner = evaluatePredicate(...);
  if (inner === 'unevaluable') return 'unevaluable';   // DEFECT-22 fix: propagate
  return inner === 'match' ? 'noMatch' : 'match';       // <-- flips noMatch -> match
```

`not(noMatch-because-false)` → match is CORRECT. `not(noMatch-because-null)` →
match is the bug: "we could not determine it" becomes "we confirmed the
opposite." This is exactly DEFECT-39 (`not(is(extensionMimeConsistent))`) and
DEFECT-40 (`not(is(precededByUserGesture))`), and — proven this session — the
identical leak exists for `not(gte/lte/gt/lt(x))` on a `number | null` field and
`not(inSet(x))` on a `string | null` field. `not` already does the right thing
for whole-module `unevaluable` (the DEFECT-22 fix propagates it); it does the
WRONG thing for a leaf-level null, because null is collapsed to `noMatch` before
`not` sees it.

---

### Option A — keep fixing ruleset-side (extend V-16 per operator family)

**What.** Extend V-16's static check to also flag `not(gte/lte/gt/lt(x))` on a
`number | null` field and `not(inSet(x))` on a nullable field, then again for
every future operator family or nullable type. Authors must remember the safe
form (`eq(x, value)`, un-negated comparisons) for each.

**Cost.** Lowest-risk — a static check only, no evaluation-semantics change. But
this exact sweep-and-patch repeats for every operator family and every new
nullable field, and the window between "operator added" and "V-16 taught about
it" is precisely where the next DEFECT-39 hides. V-16 today closes only the
boolean corner (is/eq/neq) — proven: a synthetic `not(lt(pageAgeMs))` /
`not(inSet(declaredExtension))` passes V-16 clean.

`[ ] APPROVE OPTION A`

---

### Option B — push the guard into the engine (close the class)  ⭐ recommended

**What.** A finding-level `null` operand resolves to a NEW leaf-scoped sentinel
(call it `NULL_OPERAND`), distinct from the whole-module `UNEVALUABLE` symbol.
`not` PROPAGATES it rather than flipping it — the same shape as the DEFECT-22
`unevaluable` propagation — so null can never become a match under any operator
or depth of negation. At the top of a rule, `NULL_OPERAND` collapses to
`noMatch` (the rule simply does not fire), matching today's non-negated
behavior. V-16 then becomes belt-and-suspenders rather than the primary guard.

**Cost.** Touches core evaluation semantics — the highest-blast-radius change in
the engine — and needs its own property-test campaign, since it changes what
every rule does on a null operand under negation. Robust: it eliminates the
class in one place instead of per-operator.

**⚠️ ZERO-RISK TO SHIPPED BEHAVIOR TODAY — evidenced, not asserted.** Two clean
sweeps this session establish that no shipped predicate would change behavior
under Option B:
- **Boolean null-fold:** DL-02 and PM-01 are the only `not(is)`/`eq`/`neq` over a
  three-state field, and both are now the safe `eq(x, false)` form (DEC-41) —
  they read a null as noMatch already, which Option B preserves.
- **Numeric:** exactly one `gte/lte/gt/lt` over a `number | null` field exists —
  `PM-01 · lt(pageAgeMs)` — and it is NOT negated, so its null → noMatch is
  unchanged.
- **Set:** the two `inSet` over nullable fields (`DL-01 · declaredExtension`,
  `S-02 · $.actionRegistrableDomain`) are NOT negated, so unchanged.

Every place a null operand currently flows is either non-negated (behavior
identical under Option B) or already the safe form. **Option B changes the
result of zero shipped rules.** Its risk is entirely forward-facing — it changes
what a FUTURE negated-nullable predicate would do (from a silent bug to a safe
noMatch), which is the point.

`[ ] APPROVE OPTION B`

---

## Option B — HARD REQUIREMENTS (not implementation details to settle later)

If Option B is approved, these are binding on the implementation, not open:

1. **Leaf-scoped.** The new state is a property of ONE resolved operand/predicate
   node — a distinct `NULL_OPERAND` sentinel returned where a finding path
   resolves to `null`. It is NOT the whole-module `UNEVALUABLE` symbol reused.

2. **Distinct from module-level `unevaluable`.** `UNEVALUABLE` (`stage2.ts:75`)
   means "the module did not evaluate." `NULL_OPERAND` means "the module
   evaluated and produced a null field value." They are different facts and MUST
   be different sentinels; conflating them is the failure mode this requirement
   exists to forbid.

3. **`RuleMatchResult.unevaluableModules` MUST NOT change for any
   currently-evaluable module.** A rule reading a null finding from an EVALUATED
   module must not add that module to `unevaluableModules` (`stage2.ts:322`). A
   null field value is not an unevaluable module. A predicate that resolves to
   `NULL_OPERAND` at the top level yields a `noMatch`/non-firing rule with an
   EMPTY `unevaluableModules` for that reason — never a rule reported as
   unevaluable-because-of-a-null-field. The `unevaluableModules` list stays
   exactly what it is today for every module that evaluates.

A conformance test must assert requirement 3 directly: a rule over an evaluated
module returning a null field reports `unevaluableModules: []`, not the module.

---

## Recommendation

**The Architecture Owner's stated preference is Option B** — close the class in
the engine rather than repeat the sweep-and-patch cycle per operator family. It
is zero-risk to shipped behavior (above) and eliminates the footgun structurally.
This recommendation is recorded here at the Architecture Owner's direction; it
does not substitute for the formal ruling below, which is still required before
any code is written (same discipline as DEC-19 and DEC-37).

---

`[ ] APPROVE OPTION A   [ ] APPROVE OPTION B   [ ] OTHER (reason: __________)`

*Signed by: ____________________  Date: __________*

**Related:** DEFECT-39 / DEFECT-40 (the boolean instances), DEC-41 (the
ruleset-side fix + V-16), DEFECT-22 (the `not(unevaluable)` propagation this
mirrors), `docs/DL-02-extension-mime-REVIEW.md` (the packet whose Option A this
generalizes).
