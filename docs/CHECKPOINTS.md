# Integration Checkpoints

Records each checkpoint from `Implementation-Ownership-Plan.md` §5 at the
moment it was verified. A checkpoint is a verification record, not a
decision — but it carries a signature, so it borrows `DECISIONS.md`'s
`[R]`/`[I]`/`Decision`/`Signed by` structure.

This file was created on 2026-08-29, for CP-1. No checkpoint had been
recorded anywhere before it existed — `CP-0`…`CP-4` were defined in the
ownership plan's §5 table and never declared. CP-0 is therefore recorded
below first, retroactively and honestly, rather than being skipped because
CP-1 was the checkpoint actually being worked on.

**Both entries below are dated 2026-08-29.** That is the date each was
VERIFIED and written down — it is not a claim about when either
checkpoint's underlying work occurred. CP-0's subject matter is Stage 0,
which concluded well before this file existed.

---

## CP-0 — End of Stage 0

**Date verified:** 2026-08-29 (recorded retroactively)
**Integrator:** Jayanth (`Implementation-Ownership-Plan.md`:206)
**Verified at commit:** `fc9d6a2b647d8ffa07d43e25eb09f5922daea672`
**Status: NOT MET**

**[R]** `Implementation-Ownership-Plan.md`:206 states CP-0 verbatim:

> | **CP-0** | End of Stage 0 | Jayanth | Scaffold builds; G-1…G-7 green;
> contracts tagged v1.0.0; manifest committed; ≥48h corpus | All exit
> criteria met |

**[I] No checkpoint was ever declared before this file existed.** Searched
`docs/` and `DECISIONS.md` for `CP-0`…`CP-4`: zero occurrences outside the
ownership plan's own definition table. CP-0 was not recorded as met, as
unmet, or at all.

**[I] The `contracts tagged v1.0.0` criterion is unmet.** `git tag -l`
returns **zero tags** in this repository. No `v1.0.0` tag exists, and none
ever has. That single criterion is sufficient to record CP-0 as NOT MET,
since the gate is "All exit criteria met" — the conjunction, not a
majority. The other criteria are not individually adjudicated here: one
unmet criterion settles the checkpoint, and assessing the rest
retroactively would invite the appearance of grading Stage 0 after the
fact on evidence gathered months later.

**[I] This is NOT being retroactively satisfied by tagging the contracts
now.** Creating a `v1.0.0` tag today would misrepresent what the tag
means. It is meant to mark the Stage 0 contract baseline — and that
baseline has since been amended more than once, per DEC-3's five
amendments (A-1…A-5), DEC-8's `RuleSet.pslVersion` (A-6), and the
amendments recorded after them. A tag created on 2026-08-29 pointing at
today's contracts would name a state that is not the Stage 0 baseline,
while carrying a version number that claims to be exactly that. Recording
the criterion as unmet is the accurate option; back-dating a marker is
not.

Whether to tag the contracts going forward — and at what version, marking
which state — is a separate decision, deliberately not resolved here.

**[RESOLVED 2026-09-02 — the deferred tagging decision above.]** Per the
Architecture-Owner review of `docs/DEC-36-37-38-REVIEW.md` (Jayanth, provided
directly in session), that separate decision is now made — along exactly the
lines this entry anticipated. `v1.0.0` has been created as an annotated tag on
**`d721413`**, the pre-amendment Stage-0 baseline — NOT on the amended HEAD,
which is the misrepresentation the paragraphs above warned against. It marks the
frozen contracts as they stood before the Phase-I amendments (A-1…A-6:
`3ad38ed`, `e2d9239`, `bfecce8`, `d806f14`, `ce05ded`, `bc8d710`, all
descendants of `d721413`). The *option choice* — retroactive Stage-0 tag vs a
new version at HEAD — was delegated by the Architecture Owner to the
implementing session, which selected the retroactive Stage-0 tag; that
sub-choice is the implementing session's, not attributed to Jayanth. This does
not rewrite the historical record that CP-0's ritual was NOT performed at end of
Stage 0 — it records that the tag that ritual required now exists, on the
correct baseline commit. (Pre-import git history was lost in cross-machine
transfer, so `d721413` is the earliest reproducible baseline.)

**[I] Recording CP-0 as NOT MET does not invalidate the Stage 0 work.** It
records that the checkpoint's own ritual was never performed. The
substantive Stage 0 outputs exist and are independently evidenced
elsewhere: the contracts are committed and frozen behind a pre-tool-use
hook, `docs/DEFECTS.md` records the gate defects found and fixed during
Stage 0 (DEFECT-1 through DEFECT-14), and the corpus index holds 26,700
entries. What is missing is the tag and the declaration, not the work.

**Decision:** ☑ CP-0 recorded as NOT MET, 2026-08-29 (recorded
retroactively)

**On the absence of a `Signed by` line here — a deliberate departure from
CP-1's format below.** This entry is a verification record of a state that
already obtains: a tag either exists or does not, and `git tag -l` settles
it without an adjudication. Nothing is being interpreted, permitted, or
decided, so there is nothing for an Architecture Owner to sign. CP-1 below
keeps the `Decision`/`Signed by` pair because declaring a checkpoint MET is
an act of judgment — the Integrator asserting that criteria were verified
adequately — which is exactly the kind of claim this project requires a
signature against. Recording something as unmet requires no such warrant.

---

## CP-1 — Engine + 10 modules

**Date verified:** 2026-08-29
**Integrator:** Jayanth (`Implementation-Ownership-Plan.md`:207; role defined
at :29 — "Runs the checkpoint; verifies cross-role behaviour")
**Verified at commit:** `fc9d6a2b647d8ffa07d43e25eb09f5922daea672`
**Gate:** G-9 property tests green

**[R]** `Implementation-Ownership-Plan.md`:207 states CP-1 verbatim:
"Every module conforms to D0.2; pipeline runs end to end on fixtures;
exactly one evaluation per module per pass", gated on "G-9 property tests
green".

**[I] Criterion 1 — every module conforms to D0.2. MET.**
All ten module fixture tests pass (10/10, re-run at this commit). Each
module's compute function returns `Evaluability<FindingsByModule[M]>`,
confirmed by reading the signatures rather than inferring from tests:
url/ssl/dns/redirect/loginForm/javascript/homograph/downloadContext/
permissionContext return it synchronously; authContext returns
`Promise<Evaluability<AuthContextFindings>>`, correctly — it is the only
module taking an `AuthStoreReader` (§20.11).

**[I] Criterion 2 — pipeline runs end to end on fixtures. MET.**
`packages/engine/pass.fixture.test.ts` drives all four committed fixtures
through `runAnalysisPass` (Stages 1→8) and passes. Scores and tiers are
unchanged from those established stage-by-stage:

```
clean-login      score 0   Low
no-credential    score 0   Low
off-origin-post  score 45  Medium   (CRED-01 only)
sso-flow         score 0   Low
```

Re-verified after DEFECT-30's fix specifically, which changed Stage 1's
call structure since this criterion was last checked.

**[I] Criterion 3 — exactly one evaluation per module per pass. MET, and
now BY CONSTRUCTION rather than empirically.**
This is a stronger claim than was true a few commits ago and is stated as
such. Before `fc9d6a2`, `runAnalysisPass` called Stage 1 twice —
`assembleEvaluationSet` dispatched internally while `evaluateAllModules`
dispatched again — producing two disjoint sets of ten `evaluationId`s per
pass (DEFECT-30). E-8 held only in the sense that ten envelopes existed.

After the fix: `runAnalysisPass` makes exactly one `evaluateAllModules`
call, which yields exactly one `ModuleDispatchResult` per `ModuleId`, and
`assembleEvaluationSet` maps those one-to-one with no internal dispatch. No
code path in a pass can produce a second evaluation for any module.

Proven positively, not inferred: every `CorrelationFinding.evaluationRefs`
entry is found among the ten `SecurityEvaluation.evaluationId`s of the same
pass. Those come from opposite ends of the pipeline — `stage3.ts` builds
refs from dispatch results, the envelopes from `assembleEvaluationSet` — so
before the fix they could never intersect. The assertion was confirmed to
fire by reintroducing the second dispatch, which fails with
"finding CRED-01 references evaluationId …, which is in NO envelope".

**[I] Criterion 4 — G-9 property tests green. MET.**
`npm run test:properties` passes (fast-check, DEC-22). The `ci.yml` step
reads `run: npm run test:properties` with no `--if-present` — DEFECT-29's
fix intact, so the gate fails rather than silently skipping if the script is
ever removed.

**[I] No OPEN defect blocks any criterion.** All 30 register entries were
enumerated; 10 are OPEN. None cites CP-1, E-8, D0.2 or G-9 — checked by
searching each entry's body, not by recollection. The OPEN set is
DEFECT-9, -11, -12, -14, -19, -20, -23, -24, -25, -28, all of which are
rule-set content gaps, latent producer-convention issues, or deliberately
deferred design questions. DEFECT-21 (the E-6 conflation, nearest to D0.2
conformance) is FIXED.

---

### Scope boundaries — what CP-1 does NOT establish

Recorded in the declaration itself, not as footnotes, because each is a
place a reader could reasonably over-read what has been verified.

**1. ssl and dns are DEC-5 conformant stubs, not full implementations.**
"Conforms to D0.2" is satisfied and is the actual criterion — DEC-5
approved the deferral explicitly, and `ssl.ts` carries three
unconditionally null fields with that decision cited at its head. But "ten
finished modules" would be a misreading of this checkpoint. ssl and dns
become full implementations only when a rule consumes their findings, which
no rule in `rules-v0.1.0.json` does.

**2. Every module has been verified against fixture-only evidence. No
module has ever run against a real captured snapshot or a live browser.**
All twelve engine test files import from `fixtures/`. Nothing in
`packages/engine` or `tools/` reads `corpus/` at all, despite
`corpus/INDEX.jsonl` holding 26,700 entries. CP-1 therefore establishes
INTERNAL CORRECTNESS — that the engine computes what the contracts and rule
set specify — and says nothing about real-world accuracy. That is C1.5's
job (metrics harness, "Confusion matrix + CI intervals on domain count",
`Implementation-Ownership-Plan.md`:153), which has not been started:
`apps/harness/` contains only `.gitkeep`. Real-world accuracy is CP-2's
gate, not this one.

**3. CP-0 has never been declared, and one of its criteria is unmet.**
No checkpoint record existed before this file. CP-0 requires "contracts
tagged v1.0.0"; `git tag -l` returns zero tags. Declaring CP-1 does not
imply CP-0 passed, and whether to record CP-0 retroactively or to tag the
contracts now is a separate decision. See CP-0's own entry above.

**4. DEC-24 (B1.6) is unsigned, so property coverage stops at B1.2/B1.3.**
G-9 is green over suppression order-independence and aggregation purity.
`stage7-8.ts` and `consistency.ts` have no property-test coverage; 16 of 19
pure functions rest on example-based tests only.

---

**Decision:** ☑ CP-1 declared met — engine and ten modules integrated
**Signed by:** Jayanth (Architecture Owner, Integrator)  **Date:** 2026-08-29

---

## CP-2 — First metrics

**Drafted:** 2026-10-05 (DRAFT — awaiting Architecture Owner signature)
**Drafted against:** `main` (HEAD `9d19961`); corpus 34,631 payloads / 35,087 INDEX entries / 7,601 distinct registrable-domain splitKeys
**Gate:** Test split untouched by tuning
**Evidence:** `docs/Calibration-Sensitivity-Report.md` (run 2026-09-06), `docs/Rule-Weight-Validation-Report.md` (run 2026-09-25) — identical corpus both runs

**[R]** `Implementation-Ownership-Plan.md` C1.5 states CP-2 as: corpus evaluation
produces a confusion matrix; confidence intervals on domain count; outcome
distribution by label — gated on "test split untouched by tuning."

**[I] Criterion 1 — confusion matrix produced. MET.** The full corpus (34,631
evaluated, 0 errors) was scored through the real pipeline (`readSnapshot →
extractEvidence → runAnalysisPass`). At the shipped 30/60 thresholds, whole-corpus
precision 0.974 / recall 0.022 (denominator-bounded); the firing set is
CRED-01/04/06/07 (4 of 11), with per-rule phishing/benign counts recorded
(CRED-01 233/4, CRED-04 48/11, CRED-06 333/0, CRED-07 142/9).

**[I] Criterion 2 — confidence intervals on domain count. MET.** Both reports compute
**domain-level** bootstrap CIs (resample `splitKey`, 2,000 iterations), not
snapshot-level — the design-note's unit, so kit duplication cannot falsely narrow the
interval. Per-rule precision CIs (e.g. CRED-01 [0.929, 1.0], CRED-04 [0.22, 0.95]),
the 30/60 precision CI [0.944, 0.991] and recall CI [0.012, 0.034], and the logistic
coefficient CIs are all over the 7,601 distinct domains as effective-n.

**[I] Criterion 3 — outcome distribution by label. MET.** Firing counts and the
tier/outcome distribution are reported by label (phishing vs. benign) in both the
confusion-matrix breakdown and the per-rule tables; the credential-interface cascade
(whole corpus → content-bearing → eligible → detected) is characterized in the
calibration report.

**[I] GATE — "test split untouched by tuning." Addressed straight; this is the one
that matters.** Both analysis scripts scored the **full corpus, including the test
split** — neither partitioned off a held-out set. Two honest readings:

- **Satisfied (the reading drafted here).** The gate's operative word is *tuning*. No
  tuning occurred: both reports changed **zero** weights, thresholds, or §13.2
  parameters, and both explicitly state they are **not** §18.2 validation. Nothing
  was ever tuned based on what was seen in the test split, so the failure the gate
  exists to prevent — test-set-informed overfitting of the shipped weights — did not
  happen. By the gate's literal wording, it holds.
- **Unmet (the stricter reading, stated so it is not buried).** Scoring the full
  corpus **observed** the test split. Even with no tuning, its blindness is now
  **spent**: it can no longer serve as a never-seen held-out set for a future §18.2
  validation. If the gate is read as "preserve a blind test split," it is not met.

**[I] Drafted verdict: MET** — the deliverable (confusion matrix + domain-level CIs +
label distribution) is produced, and the gate holds under its literal "untouched by
tuning" wording because nothing was tuned. **The Architecture Owner may record NOT MET
instead** if the gate is intended to guarantee a blind test split; the deliverable
stands either way.

### Scope boundaries — what CP-2 does NOT establish

1. **Not §18.2 validation.** Whole-corpus measurement, no train/validation/test
   partition, no pre-registered false-positive budget. Every rule's
   `empiricalConfidence` remains **Unvalidated**. CP-2 MET is not "calibration done."
2. **Test-split blindness is spent** (per the gate discussion above) — a later
   held-out validation cannot use this split as never-observed.
3. **Covers only the 4 rules that fire** on the corpus; 7 of 11 never fire here, and
   CRED-02 is S-8-blocked in the harness. The relative-importance logistic fit covered
   only 2 rules (CRED-01, CRED-06).

**Decision:** ☐ CP-2 — DRAFT, awaiting Architecture Owner signature (and the AO's
MET / NOT MET ruling on the gate)
**Signed by:** _______________  **Date:** __________

---

## CP-3 — Extension ↔ Engine

**Drafted:** 2026-10-05 (DRAFT — awaiting Architecture Owner signature)
**Drafted against:** `main` (HEAD `9d19961`)
**Gate:** Conformance suite green

**[R]** CP-3 requires that the extension's producers and the offline harness's
producers agree (so the engine's verdict is the same whichever side collected the
evidence), plus manual confirmation of the live browser surfaces.

**[I] Criterion 1 — extension ↔ harness conformance. MET (automated, this session).**
`npm run test:conformance` (`tools/conformance/login-interface.conformance.test.ts`)
proves 8/8 HTML cases produce **byte-identical shared fields** across the harness
(parse5) and extension (live DOM) paths, including `actionUrl` and
`actionRegistrableDomain` (both shared-PSL). The live-path tests corroborate per rule:
`test:cred-livepath`, `test:cred02livepath`, `test:cred03livepath` (extension and
harness now AGREE on CRED-03 post-DEC-47), `test:cred04livepath`, `test:dllivepath`,
plus `test:downloadrepass` / `test:downloadonchanged` / `test:downloadsametab`. All
green under `verify:all` (EXIT 0, re-run 2026-10-05).

**[I] Criterion 2 — service-worker dormancy / wake. MET (automated).** Proven by
`apps/extension/session-survival.test.ts` (A1.1): a session — including the engine
`PriorPassState` and the §11.4 intervention lock — survives worker termination
mid-session and is reconstructed unchanged, with negative controls (corrupt session
skipped, malformed state → null). This is an automated test, not a manual check.

**[I] Criterion 3 — live-browser visual/behavioural surfaces. ARCHITECTURE-OWNER-
ATTESTED, relayed through this session; NOT verified by this session.** The
Architecture Owner states, relayed through this session on 2026-10-05, that the
following were **manually confirmed in real Chrome in an earlier session** (not in
this one):

- DL-02 firing on a real **same-tab "Save link as"** of a compound-extension file;
- the **Medium interstitial** and **High block** visuals on real flagged pages;
- the **v3 dashboard** (Right Now / History / Saved Sites / Technique cards) confirmed
  live against real browsing data.

**Provenance, explicit:** this session did **not** perform or witness these checks.
They are recorded as the Architecture Owner's own attestation, relayed through the
implementing session, and remain **unsigned** until the Architecture Owner signs this
record. The offline model + store for the dashboard, and the download/intervention
handler logic, are separately proven by `test:dashboard`, `test:incidenthistory`,
`test:intervention`, and `test:downloadsametab`; what is AO-attested here is the live
rendering/timing in real Chrome, which the automated suite cannot exercise.

### Scope boundaries — what CP-3 does NOT establish

1. The live-browser visuals (Criterion 3) rest on Architecture-Owner attestation
   relayed through this session, not on a test or a check this session ran.
2. CRED-04's extension path remains webNavigation-limited (S-10 divergent) — the
   conformance agreement is on the shared producer fields, not on CRED-04 firing live
   in the extension.

**Decision:** ☐ CP-3 — DRAFT, awaiting Architecture Owner signature (signature also
ratifies the Criterion-3 manual attestation as the AO's own)
**Signed by:** _______________  **Date:** __________
