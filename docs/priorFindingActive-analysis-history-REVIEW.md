# Architecture-Owner Review Packet — `priorFindingActive` / Analysis History (DL-01)

**Prepared 2026-09-03 by the implementing session. Review aid only** — binds
nothing, decides nothing, implements nothing. **No recommendation is offered.**
This packet characterizes the one remaining `blocked` predicate operator and the
persistence it would require, at the same rigor as the other capability mappings
this session. It does not propose a build.

---

## The capability, in one paragraph

`priorFindingActive` is a leaf predicate operator (`ruleset.format.v1.ts:140-151`,
frozen): *"True when at least one primary finding with non-zero effective weight
exists in a **PRIOR COMMITTED PASS of the current Analysis Session**. Reads
committed state only — never the in-flight finding set."* It is the only operator
the engine cannot answer today: `stage2.ts` evaluates it by **throwing** a typed
`PriorFindingActiveUnavailableError` (`stage2.ts:313-314`), which `matchAllRules`
catches and converts to a distinct `blocked` rule status (`stage2.ts:432-435`),
never `unmatched` and never `unevaluable`. It is **blocked, surfaced, and
non-silent** — confirmed below.

---

## 1. How many rules reference it — confirmed: DL-01 only, one node

Direct AST walk of `rulesets/rules-v0.1.0.json`:

- **DL-01** — a single `{ "op": "priorFindingActive" }` node, the **fourth and
  last** conjunct of DL-01's top-level `and` (`rules-v0.1.0.json:619-621`). Its
  three preceding conjuncts: `inSet(declaredExtension, executableTypes)`,
  `is(referrerPresent)`, `notSameSite(downloadRegistrableDomain,
  referrerRegistrableDomain)`. `requiredModules: ['downloadContext']`.
- **No other rule** references it (walked every rule's predicate tree; one hit
  total). This matches the rule's own rationale, which calls DL-01 *"the only
  rule requiring a pre-existing finding on the referring session."*

**Reachability today.** Because it is the last `and` conjunct and `and`
short-circuits on the first non-match (`stage2.ts`, DEC-42 propagation), the
throw is only reached when all three earlier conjuncts return `match`. In
practice DL-01 never reaches it: `downloadContext` is unevaluable on every
corpus snapshot (S-9 / stubbed), so the `requiredModules` pre-check
(`stage2.ts:398-408`) reports DL-01 `unevaluable` **before** the predicate is
touched. The `blocked` status is therefore a latent path, exercised only in the
fixture that hands DL-01 a fully-evaluable `downloadContext` with the first three
conjuncts satisfied (`stage3.fixture.test.ts:268-271` asserts DL-01 can only be
`unmatched` or `blocked`, never `matched`, today).

## 2. What the store would need to persist

The contract wording is exact and load-bearing: **"a prior COMMITTED PASS of the
current Analysis Session"**, **"committed state only — never the in-flight
finding set"** (`ruleset.format.v1.ts:145-147`). The `§9` interpretation note and
DL-01's rationale add that this *"keeps aggregation pure (§9.1)"* and *"free of
intra-pass ordering dependency"*. So the persisted datum is:

> **Within one Analysis Session: did any already-committed pass produce ≥ 1
> primary finding with non-zero effective weight?**

Two structural facts about that requirement:

- **It is Analysis-Session-scoped pass history, NOT the per-origin auth record.**
  The `AuthStoreReader` interface (`boundary.interfaces.v1.ts:70-77`) exposes
  exactly one method — `lookup(origin, fingerprint)` — which serves **CRED-02**
  ("a site you have used"), not `priorFindingActive`. **There is no reader method
  on the store today that answers the prior-committed-findings question.** The
  substrate that *does* commit pass results atomically is the `PassInvoker`
  path (`runLocalPass` / `runGatePass` → `PassInvocationResult{status:
  'committed', passResult: AnalysisPassResult}`, `boundary.interfaces.v1.ts:213-235`,
  B-12 §15.4), but that machinery exists only at the interface level.
- **The engine already threads a `prior` argument — but it lacks this field.**
  `runAnalysisPass(evidence, ruleSet, storeReader, prior: PriorPassState | null)`
  (`pass.ts:93-97`) passes `prior` to Stage-8 tier escalation
  (`computeEffectiveTier(rawTier, prior)`), **not** to `stage2` predicate
  evaluation. And `PriorPassState` (`stage7-8.ts:79-93`) currently carries only
  `highestInterventionTier` and `interventionPresented` — **neither is "a prior
  committed pass had an active primary finding."** So even threading the existing
  `prior` into `stage2` would not answer `priorFindingActive`; the datum it needs
  is not yet persisted anywhere.

**Minimum persisted state, stated neutrally:** a per-Analysis-Session, monotonic
boolean (or a richer committed-findings view) — set once a committed pass records
a primary finding with non-zero effective weight, readable by a later pass in the
same Session. Day-granularity and origin-plaintext concerns (§20.3/§20.9) that
govern the auth store do **not** obviously apply, because this is session-local
pass history, not a cross-visit per-origin record — though whether it shares the
auth store's persistence substrate or gets its own is itself an open question
(see §4).

## 3. What `stage2.ts`'s throw does today — confirmed blocked, not silent

- **Throw site:** `stage2.ts:313-314` — `case 'priorFindingActive': throw new
  PriorFindingActiveUnavailableError(ruleId);`. It **never** fabricates a
  `true`/`false` default.
- **Error is typed and specific:** `PriorFindingActiveUnavailableError`
  (`stage2.ts:359-370`) carries the reason (store does not exist yet, per
  `How-To-Start-Coding.md`), so the block is self-describing.
- **Caught and mapped to a distinct status:** `matchAllRules`
  (`stage2.ts:432-435`) catches **only** this error type and returns
  `{ status: 'blocked', reason }`. Any other throw re-propagates (`throw err`).
- **`blocked` is deliberately NOT folded into `unevaluable`** (`stage2.ts` type
  comment, `RuleMatchResult`): a missing *dependency* (a store that doesn't
  exist) is held distinct from an unevaluable *module*. Isolation is per-rule, so
  DL-01's block never denies the other ten rules a real answer.

**Conclusion for §3:** the operator is genuinely blocked and the block is
surfaced through the type system as its own status — there is no silent
`false`, no swallow, no default. A test pins this (`stage3.fixture.test.ts:268-271`).

## 4. Dashboard-coupled, or buildable standalone? — the framing, no ruling

Arguments that surfaced during investigation, laid out for a ruling rather than
resolved:

**Points toward "buildable standalone" (no dashboard needed):**

- The datum is **session-local committed-pass state**, orthogonal to the
  user-facing dashboard (D0.9 `SecurityStateView` and D0.8
  `AuthStoreUserControl` — transparency/listing/deletion of **auth records**).
  None of the dashboard surface reads or writes prior-pass-finding state.
- The commit substrate is already specified (`PassInvoker` / atomic
  `AnalysisPassResult`, B-12), and the engine already accepts a `prior`
  parameter. The gap is (a) one field on `PriorPassState` (or a parallel
  prior-findings view), (b) threading it into `stage2`'s `priorFindingActive`
  case in place of the throw, (c) a caller that persists and supplies it across
  passes in a Session. None of that requires UI.

**Points toward "coupled / not cleanly standalone":**

- Whatever persists committed passes must obey the same never-transmit / privacy
  and lifecycle rules as the store (§20). If the chosen substrate **is** the
  Authentication History Store, then the store's existence (currently "week 4",
  `How-To-Start-Coding.md`) gates it, and the store's guards/lifecycle become
  in-scope — which is where the dashboard and user-control surface live.
- `priorFindingActive`'s value is only meaningful once ≥ 1 rule can *commit* a
  primary finding across passes in a real Session — i.e. it presumes the
  multi-pass Session runtime (Role B pass invocation), not just the single-shot
  harness path the corpus uses.

**Open questions this packet does not answer** (for the Architecture Owner):
(i) does the prior-committed-findings datum live in the Authentication History
Store or a separate session-scoped pass-history store? (ii) is the datum a single
monotonic boolean or a structured committed-findings view (future rules)?
(iii) does building it require the `AuthStoreReader` interface to gain a new
method (a frozen-contract amendment), or is the pure `prior`-threading path
(engine stays store-free, caller owns persistence) sufficient and preferred?
(iv) is DL-01's `blocked` status acceptable to keep indefinitely (mirroring
DEC-14's "non-functional Phase I" for CRED-05/A1), or is this scheduled?

---

## Option C — one derived boolean on `PriorPassState` (evaluated at the AO's request, not recommended)

The packet above surfaced a "pure `prior`-threading path" in the abstract. This
section evaluates the *specific* concrete form of it: **extend `PriorPassState`
with a single derived boolean — `anyPriorPrimaryFindingActive` — computed at pass
commit alongside `highestInterventionTier`, riding the same session-survival
persistence path, rather than building a new store.** Stated with real costs; the
ruling remains the AO's.

### C.1 — Does it satisfy DL-01's conjunct correctly?

**Yes, with one correctness condition on the update hook.** DL-01 needs *"at
least one primary finding with non-zero effective weight in a PRIOR COMMITTED
PASS of the current Analysis Session,"* reading *"committed state only — never
the in-flight finding set."* A boolean that is:

- a **monotonic OR** over prior committed passes (`prior.anyPriorPrimaryFindingActive
  || <this committed pass had one>`), mirroring `highestInterventionTier`'s
  maximum-not-last-write discipline (`stage7-8.ts:170-182`);
- computed from **committed findings only** (the just-committed pass's finding
  set), filtered to **`type === 'primary'` with `effectiveWeight > 0`**
  (`effectiveWeight` is already computed per finding at `stage5-6.ts:151-155`);
- **threaded INTO** the current pass as prior state and read by `stage2`, never
  recomputed from the in-flight set —

matches the contract wording exactly: it reads only prior-committed state, so it
keeps aggregation pure (§9.1) and free of intra-pass ordering dependency, and DL-01
never counts its own in-flight finding. On the **first pass** `prior === null` ⇒
the boolean is false ⇒ `priorFindingActive` correctly returns no-match (DL-01
cannot fire on a session's first pass), and the current `throw`/`blocked` path is
retired.

**The one condition:** `recordIntervention` (today's only `PriorPassState`
maintainer) runs *only when an intervention is presented*. A primary finding with
non-zero weight that did **not** trigger an intervention (e.g. a Low/Medium
result) must still set the boolean. So the update must happen at the **pass-commit
boundary for every committed pass**, not inside the intervention hook — a broader
maintenance point than `recordIntervention`. This is a correctness detail to get
right, not a blocker.

### C.2 — Implementation cost vs a new store (rough scope, not an implementation)

**Materially smaller.** Rough scope:

- **New store path:** a D0.8-class interface + persistence + guards/lifecycle
  (§20.6 G-01..G-05) + user-control/dashboard surface (D0.9) + almost certainly a
  frozen-contract amendment (Annex A) to add a reader method. Multi-file, spans
  contracts/engine/extension, and pulls in the store's whole governance surface.
- **Option C:** one field on the **engine-side** `PriorPassState`
  (`stage7-8.ts:79-93`, **not** a frozen contract); one reduction over committed
  findings at the commit boundary; thread `PriorPassState` into
  `matchAllRules`/`evaluatePredicate` so the `priorFindingActive` case reads the
  boolean instead of throwing (a contained signature change through `stage2`);
  retire `PriorFindingActiveUnavailableError`. **No new store, no new persistence
  substrate, no dashboard, and — if `priorFindingActive` reads threaded state
  rather than a store — no frozen-contract amendment.** Persistence piggybacks on
  the already-specified session-survival of `PriorPassState`
  (`recordIntervention` is "REAL NOW, pure, no store, no I/O"; A1.3 defers only
  *persisting* the value across service-worker restarts — the same deferral every
  `PriorPassState` field already lives with).
- **Shared gating (applies to ALL options, not a C-specific cost):** the value is
  only meaningful once the multi-pass Session runtime actually commits passes and
  threads `PriorPassState` across them in production. That runtime maturity gates
  Option C exactly as it gates a store-based approach.

### C.3 — New privacy/lifecycle (§20) concern beyond `PriorPassState`'s existing fields?

**None.** `anyPriorPrimaryFindingActive` is a single session-scoped boolean
carrying **no origin, no URL, no fingerprint, no per-finding detail** — strictly
less information than `highestInterventionTier` (a tier enum) already on the same
object. §20's never-transmit / day-granularity / plaintext-origin / store-poisoning
(G-01..G-05) rules govern the **Authentication History Store's per-origin
records**; `PriorPassState` is session-local pass state, not a persisted per-origin
record, and a derived boolean adds no PII, no transmission surface (G-6's
never-transmit boundary already contains the `PassResult` it derives from), and no
new lifecycle. It sits in the **same privacy class** as the fields already there.
It is also a **§2.2 advantage**: the engine stays store-free — `priorFindingActive`
reads threaded state, never constructs an `AuthStoreReader`.

### C.4 — Verdict of this evaluation

Option C **checks out as viable**: correct for DL-01's conjunct (given the
commit-boundary update hook), materially cheaper than a new store, and §20-neutral.
It does **not** answer open questions (i)/(ii) — whether a single boolean is
enough for *future* rules, or whether a richer committed-findings view is wanted —
and it makes the §4 question (iii) concrete: *is threaded engine-side state
acceptable, or is a store interface required for reasons beyond DL-01's present
need?* **No recommendation is made; this remains the Architecture Owner's ruling.**

---

## Cross-references

- `packages/engine/stage2.ts` — throw (313-314), error class (359-370), catch
  and `blocked` mapping (432-435), `RuleMatchResult` type comment.
- `packages/contracts/ruleset.format.v1.ts:140-151` — the operator's contract.
- `packages/contracts/boundary.interfaces.v1.ts:70-77` (`AuthStoreReader`,
  lookup-only), `:213-235` (`PassInvoker`, committed `AnalysisPassResult`).
- `packages/engine/stage7-8.ts:79-93` — `PriorPassState` (lacks the field).
- `packages/engine/pass.ts:93-97` — `prior` threaded to Stage 8 only.
- `rulesets/rules-v0.1.0.json:619-621` — DL-01's sole `priorFindingActive` node.
- `packages/engine/stage3.fixture.test.ts:268-271` — DL-01 today: `unmatched`
  or `blocked`, never `matched`.

**Related:** [[DEC-14]] (the "non-functional Phase I" precedent for a blocked
CRED rule), `docs/download-permission-context-REVIEW.md` (DL-01 context).
