# SecureSphere X — Documentation Authority Audit Report

**Prepared under:** Document Authority Audit Directive (Stage 0 corpus)
**Auditor:** Documentation Authority Auditor
**Reviewer / Architecture Owner:** Jayanth — SecureSphere X
**Authorising rulings:** R2, R3 (CORRECTED), R4, R5, R6, R7, R8, R9, R10 (Standing Delegation), R11, R12
**Corpus at report assembly:** 45 files · 25,485,709 bytes · rollup `f9b45d1567fa2bd273348f9a175a36a9`

---

## 8.1 Executive Summary

Twelve deliverable categories were audited against a 45-file corpus. **Ten resolved to a single authoritative base document. One is an Open Governance Question. One is Not Applicable.** Twenty defects were registered and twenty-eight reconciling edits were planned. Four defects could not be fixed from corpus evidence and are flagged rather than resolved.

### Defect totals

| Severity | Count | Reconciled | Flagged |
|---|---|---|---|
| Blocking | 2 | 2 | 0 |
| Major | 16 | 14 | 2 |
| Minor | 5 | 4 | 1 |
| **Total** | **23** | **20** | **3** |

Flagged: **D-20** (Major — explicitly left open by reviewer decision), **D-24a** (Major — the `G-8` identifier collision) and **D-17** (Minor — no decision required, no marker inserted). **D-23 is permanently struck**, not renumbered; D-24 takes the next number so the sequence stays monotonic and a reader meeting the gap finds the strike recorded.

**Two items moved from Flagged to Reconciled by Tier 0 reviewer decision, not by corpus evidence.** D-01 was adopted by digest and D-03 deferred to regeneration (Ruling R13 §1 and §2); in both cases the underlying condition persists as a carried implementation obligation. The movement from four flagged items to two came from decisions, not discoveries.

### The corpus was unstable during this audit

This belongs in the summary, not an appendix. A reader deciding whether to trust these findings needs to know the ground moved twice.

1. **Two late materializations.** The corpus mount populated lazily. `assemble-openapi.py` was absent from the first enumeration (43 files) and present afterwards. `GAP3_Reconstruction.pdf` (23.7 MB) materialized later still, taking the corpus from 44 to 45 files. The Section 9 context-integrity confirmation given before Phase 1 was therefore made against an incomplete listing — an auditor failure, disclosed rather than silently amended.
2. **The remedy applied.** Re-enumeration at every phase boundary reporting **both file count and byte total** (a count alone would have shown 44→45 without revealing a 23.7 MB arrival), later strengthened with a rollup fingerprint over all filenames and contents. The second materialization was caught by the byte total.
3. **Any further materialization automatically re-opens every ruling touching the affected category.** No new file was absorbed into a completed phase.

### The reviewer and auditor read materially identical but not byte-identical corpora

One file diverged: `API-Contract-Specification-v1_2.md` — auditor 55,508 B / 951 lines / `7a27ad2a…`; reviewer 55,150 B / 950 lines / `89577d7a…`. All 44 other files matched MD5 exactly.

**Cause established and closed.** The reviewer's copy predated the `FIX_LOG.md` remediation pass. The 358-byte delta is FIX 4's inserted `201` status-code row (191 bytes including its newline) plus FIX 5's extension of the existing `400` row (167 bytes, content only — its newline already existed). 191 + 167 = 358, exact. Both fixes were verified in the corpus text at §10.3 L461 and L463, independently of FIX_LOG's own `[DONE]` claims. **The auditor's mount is the corpus of record**; reviewer figures are corroboration only.

### Stated limitation of method

Two auditor errors of one class occurred and were caught: **a correct measurement generalised past what it covered.**

- GAP-3 evidence tags were counted with a bare-`[R]` pattern, missing the ~81% that carry section references (`[R §38]`). Reported 49 tags and 27 untagged sections; the true figures are 255 and 7. A ratification was refused on the wrong figure and withdrawn on re-measurement.
- Four boundary-contract types were reported as named in no corpus document. `InterventionReporter` is named in five.

Remedy applied for the remainder of the audit: verify each name individually; never generalise a spot check to a set.

**Delivery position is not a category number.** Four exchanges were spent on this axis, so both are tabulated once: Document 7 → Category 5 (System Architecture) · Document 8 → Category 7 (Backend Architecture) · Document 9 → Category 6 (Rule Engine) · Document 10 → Category 8 (Security Architecture) · Document 11 → Category 9 (Extension Architecture) · Document 12 → Category 12 (MANIFEST). **Section 2's category number is authoritative; Section 2.1's delivery position is stated separately and never as a category number.**

**Standing rule adopted: every count in this record states its unit** — occurrences, lines, distinct values, or files — at the point the figure appears. **A bare integer is not a measurement.** Extended after a fifth non-disagreement: a count states its **unit** *and* its **matcher** — the exact pattern or criterion. Two correct measurements of one document diverged only because `Retry-After` contains `Retry` and because including `backoff` changes the total. Three instances of the same ambiguity prompted it: external `$ref` (12 references / 8 distinct targets), ICD schema citations (15 occurrences / 9 lines), and `gateOrdinal` (14 occurrences / 13 lines). The rule replaces the per-metric conventions that had accumulated for each.

**The same error class occurred on the reviewer side and was caught by the auditor**, so this limitation is not one-sided. At Ruling R16 the reviewer extracted the deliverable numbering with a pattern matching lines beginning `N.`, which matches Section 2.1's delivery list and cannot match Section 2's table rows, since those begin `| 3 |`. One list was seen, taken for the category numbering, and the defining table was never seen at all.

**The limitation is symmetric, and seven reviewer findings were corrected on evidence.** All seven share one shape — a plausible inference generalised without testing it against the source. **D-23**, the renumbering instruction that would have created the defect it described. **R14 §3(a)**, the claim that `observation_schema()` never calls `ref()`, contradicted by one call at `'reason': ref('NotCollectedReason')`. **R9 §2(c)**, the ruling that two boundary types were outside ICD scope by construction, contradicted by the ICD's own Checkpoint line naming IF-14 and IF-15 as non-HTTP boundaries. **R25 §6**, which called System Architecture "Category 7" and Backend Architecture "Category 8" — the D-23 confusion itself, recurring in the ruling issued immediately after this limitation was first recorded, and committed by the party who had raised it as Blocking. **EDF-1**, which measured a filename and concluded a document was absent, when all fifteen cited sections resolve as exact headings in a document present under a later version number. **EDF-7**, which measured one file and claimed a corpus-wide absence, one ruling after issuing the rule that a count must state its matcher.

**In each instance the reviewer measured one thing and drew a conclusion about another** — a grep pattern for a category numbering, a narrow regex for a claim about a function, an inference for a document's declared scope, a delivery position for a category number, a filename for a document's presence, a single file for the corpus.

**EDF-4**, which asserted that §10 had no threat model and no asset register, from the section titles — §10.14 enumerates nine threats with mitigations and §10.13.2 is an eleven-row data inventory.

**The last three share a tighter shape that predicts where the remaining risk lies: each asserted that something was absent without opening the thing that would have shown it present.** A filename search for EDF-1, a single document for EDF-7, a section title for EDF-4. In all three the evidence was in the corpus, one command away.

**Every instance was caught on verification, and one reached a delivered document** — EDF-4's text shipped in Document 10's header and was withdrawn at re-delivery, before finalization. Six reviewer errors, six caught before delivery, zero propagated. That result was produced by the escalation protocol and the standing instruction to report disagreement before acting — including two findings the auditor declined to write into the report at all, having disproven them, and referred back for ruling instead. Recorded because a report that logs only the auditor's instances of an error class is less credible, not more.

**Deliberately attempting to break surviving findings produced a new defect.** After three of seven defensibility findings failed, the remaining four were re-tested by the method that broke the first. All four survived — and the re-test of EDF-5 surfaced **D-24**, a `G-8` identifier collision and a false CI-coverage claim that seven audit phases had not found. The instruction was issued because findings had failed, not because anything suggested a new defect existed. It is the argument for repeating the exercise on any future finding set.

**Governance outcome — a reviewer-issued Blocking instruction was refused on evidence and withdrawn.** That ruling (D-23) required renumbering §8.3, §8.5, §8.7, §8.8 and §8.9 to the delivery order. Applying it would have moved System Architecture to Category 7, colliding with Backend Architecture, so the Open Governance Question would have pointed at a frozen, fully-resolved deliverable — **the instruction would have created the exact defect it claimed to fix.** It was declined, verified against Section 2 in all twelve rows, confirmed erroneous and struck from the register before reaching any finalized document. Recorded here as a governance outcome rather than a correction: report-disagreement-before-acting working as designed.

### The rule set is fully specified and entirely unvalidated

CRED-01 through CRED-07, DL-01, DL-02 and PM-01 carry predicates, base weights and tiers, with the High threshold at 60 and no primary rule reaching it alone — the highest primary weight is 50. **None has been validated against real outcomes, and no threshold is empirically calibrated.** τ_sim is explicitly empirical, and the boundary case CRED-02 (50) + CRED-A1 (10) = 60 exactly is flagged in the specification for empirical review. `Unvalidated` is defined in the specification's own empirical-confidence register as *"a design-time hypothesis; no benchmark evidence exists."*

This is a property of Stage 0, not an omission: validation requires a running implementation and a labelled corpus, and the specification states so directly — the next artifact is an implementation and a confusion matrix, not a document. Section 6 Row 7 reports `Pass (format only)` for this reason. **No number about detection performance appears anywhere in this release**, and none should be estimated, approximated or projected.

### A third materialization was rejected on provenance

`LogicalDatabaseDesignSpecificationv1_1_md.pdf` (1,020,808 bytes) appeared in the corpus directory after Document 3 shipped. It is a rendering of **audit output**, not of corpus material, and is **excluded from the corpus of record — deliberately unclassified.**

The discriminating test: `architecture-change process` and `Not Verifiable` occur **zero** times in the corpus `.md` and both appear in the PDF. They exist only in the E-09 replacement text authored during this audit. Metadata agrees — Title `Logical-Database-Design-Specification-v1_1.md`, Creator Firefox, created 2026-08-01 09:51:47 UTC, after delivery. A third phrase, *"the absence of any deletion path"*, appears in both but is **not** discriminating: it occurs twice in the corpus file, at L2414 as well as L2582, and only L2582 was edited.

Absorbed, it would have given Category 4 a fourth candidate containing the audit's own edit, making E-09 citable as evidence for itself. This is the same hazard refused earlier when a Phase 3 message returned as a document, and harder to see in this form — it arrived through the corpus mount rather than the conversation, under a filename shaped like a corpus artifact. **The Phase 2 taxonomy has no class for audit output, and assigning one would make it citable**; rejection recorded is the accounting.

**Standing test, generalised:** the discriminator is *what a rendering renders*, not that it is a rendering. A rendering of corpus material is Supporting-Evidence; a rendering of audit output is audit output, whatever its format, filename or location. `GAP3_Reconstruction.pdf` — created 2026-07-26, before the audit, rendering a corpus document — remains `Supporting-Evidence` under R5 §1(a); this file does not.

*Verification limitation, stated rather than smoothed:* the reviewer's mount remained at 45 files and the PDF never propagated there. The corpus-side half of the test was independently confirmed by the reviewer; **the PDF itself was inspected by the auditor alone.** This is not jointly verified.

**Corpus of record: 45 files · 25,485,709 bytes · rollup `f9b45d1567fa2bd273348f9a175a36a9`.**

### A corpus file was overwritten with audit output, rejected and restored

`Logical-Database-Design-Specification-v1_1.md` — the Category 4 authoritative base — was modified in place after Document 3 shipped. 170,106 → 170,518 bytes, MD5 `a1eefb78…` → `8ba98c72…`. The new L2582 was the audit's own E-09 text including its EDF-2 amendment, and the corpus file and the delivered document carried an identical digest.

**Rejected as a write-back, restored from baseline.** The corpus of record for Category 4 is the original, `a1eefb78022b6436fb6294f30f82d2e1`, 170,106 bytes. Document 3 stands as delivered: its `2582c2582` single-line result was correct when measured and remains correct against the baseline.

**The baseline is reproducible on a mount the auditor does not control.** This is the fact that settles it. A preserved copy held by the auditor is challengeable in principle — the party whose output overwrote the file would also be custodian of the version proving it. That objection is closed: the reviewer's independent mount, never written to, holds the same 170,106 bytes and the same digest, with `architecture-change process` and `Not Verifiable` at zero occurrences. The baseline is not an assertion; it is reproducible elsewhere.

*Why restoration and not merely a governing declaration:* **a repository whose source equals its audit output cannot be re-audited by anyone.** Declaring a governing copy keeps this audit valid; restoring the file keeps the repository auditable by the next reviewer.

*Precision on what the restore proves.* The file was restored on the auditor's working mount and the rollup returned to baseline there. **Writes to a working mount may not propagate to the project of record, so the restore must be repeated at source.** The reviewer's mount also reads `a1eefb78…` — but that is because it was never written to, not because a restore reached it. It is the independent baseline, and it must not be cited as post-restore verification.

**Exhaustive check, not a spot check.** The rollup proves at least one file moved, never that only one did. All 45 files were compared against the reviewer-side manifest — an instrument independent of the auditor — and exactly **two** differ: this file, and `API-Contract-Specification-v1_2.md`, whose divergence is the reviewer-side staleness diagnosed and closed earlier. The three delivered contracts carrying E-30 were **not** written back. One write-back, not four.

*Method correction found by running it:* the auditor's own preserved copy is **not** a clean baseline for every file — it doubles as the working copy where E-21 and E-22 were applied, so it diverges from the corpus for exactly those two tooling files. The third-party manifest is the sound instrument and was used instead. A baseline that the auditor also writes to is not a baseline everywhere.

### Two instruments, and why each held

**The allowlist rollup keyed on identity, not content — and that is why it caught this.** Under the subtractive form considered and rejected one exchange earlier (*directory minus files judged to be audit output*), this event would plausibly have been silent: the overwritten file's content **is** audit output by construction, so a provenance test at the boundary would have correctly excluded it and left the fingerprint unmoved. The instrument would have been defeated by a correct judgement. The allowlist form keys on the filename, so any change to those bytes moves the fingerprint regardless of what the bytes now resemble.

Read with the D-23 governance outcome below, both entries make the same point from opposite directions: **an instrument that requires a judgement inside it can be defeated by a correct judgement.**

**Three demonstrations of one principle.** The subtractive rollup would have been defeated by a correct provenance judgement made inside it (R21 §4). The auditor's preserved baseline was silently unreliable for two files because the auditor also wrote to it (R23 §3). And a reviewer-issued Blocking instruction would have created the defect it described, stopped only by refusal-on-evidence (D-23). **An instrument that the party using it can write to, or that carries a judgement inside it, can be defeated without anyone acting in bad faith.** The reviewer-side manifest generated to localise a 358-byte delta turned out to have its enduring value elsewhere: it is the one integrity instrument independent of the auditor.

**A reconstruction technique worth keeping.** The 358-byte divergence between the two mounts was localised before either party could see the other's file: a bisection over cumulative prefix digests, then a single-insertion model solved against four cumulative byte figures, predicting the byte lengths of four specific lines on the other mount and matching all four exactly. A direct diff later confirmed every element — the whole divergence was FIX 4 and FIX 5 with no residue. Cross-mount divergence is localisable without file exchange.

**Discriminator discipline.** For this file the discriminating phrases were `architecture-change process` and `Not Verifiable`, both at zero in the baseline. `Persistence Architecture Specification` is **not** discriminating — it occurs once in the unmodified file. That is the same trap as *"the absence of any deletion path"* in the rejected-PDF case. **A discriminator is verified absent from the baseline before it is used, every time.**

### Central finding

**The selections hold on independent evidence; the corpus's own account of why they hold does not.** MANIFEST justifies both the OpenAPI and schema selections on reproducibility — an argument that fails, because no tool in this repository generates the flat `d0_*_schema.json` files either. The verdicts survive on cross-reference evidence MANIFEST does not cite. This is the single most precise statement of the corpus's central weakness.

---

## 8.2 Corpus Inventory and Classification

45 files: **13 Candidate-Final · 7 Superseded · 8 Generated-Artifact · 4 Implementation-File · 13 Supporting-Evidence · 0 Draft · 0 Unclassified.**

`Archived` is used nowhere: MANIFEST §3 asserts an `archive/` directory that does not exist on disk, so the status would assert a location rather than describe one (R2 R-1.1).

Full ledger at §8.9.

Named in the corpus but absent from it: the `archive/` directory · `ICD.pdf` · `rules-v0.1.0.json` (runtime data, absent by design) · `architectural-gates.mjs` and `.dependency-cruiser.cjs` (MANIFEST §5 already marks both absent) · `/tmp/canonical-schemas.json` (outside the repository by design).

---

## 8.3 Authoritative Base Document Determination

### Category 1 — JSON Schemas (D0.x series)
- **Selected base:** `d0_1_schema.json`, `d0_3_schema.json`, `d0_4_schema.json`, `d0_9_schema.json`, `d0_10_schema.json`
- **Evidence tiers:** Tier 2 (primary), Tier 3 (corroborating). **Tier 1 is not claimed** — see below.
- **Justification:** Two independent corpus documents cite exactly these five files: `SecureSphereX-Interface-Control-Document-v2.md` names them directly (15 occurrences across 9 lines), and `openapi.yaml` reaches them through twelve external `$ref` resolving to eight distinct `$defs` targets, all resolving. Nothing else in the corpus satisfies either citer. Tier 3: all five SHA-256 prefixes and all five `$defs` counts match MANIFEST §1 exactly.
- **Tier 1 withdrawn (R8 §2).** An earlier draft cited G-8's CONFORMANT result as Tier 1 evidence. `contract-conformance-check.py` globs `*.ts` and opens the LDD; it contains zero references to `d0_`, `schema.json`, or any JSON artifact. It validates TypeScript enums against PostgreSQL enums and says nothing about these files. The Tier 1 evidence this category needs is the Schema ↔ DTO parity row, which returns **Fail (partial)** — see §8.4.
- **Rejected:** the 64 canonical schemas inlined in `securesphere-openapi-3_1.yaml` — not `$ref`-addressable, and belonging to the lineage the ICD resolves against at 14/26. `/tmp/canonical-schemas.json` — outside the repository.
- **Limitations carried (Rule 11):** provenance unestablished (**D-01**, Blocking); `d0_1_schema.json` carries **D-03**. A provenance defect qualifies confidence in a selection; it does not disqualify the sole occupant of a category.

### Category 2 — TypeScript DTO Contracts
- **Selected base:** `evidence_contract_v1.ts`, `evaluation_contract_v1.ts`, `ruleset_format_v1.ts`, `passresult_contract_v1.ts`, `snapshot_format_v1.ts`, `boundary_interfaces_v1.ts` — as a set.
- **Evidence tiers:** Tier 1, Tier 2.
- **Justification:** All six version constants match MANIFEST §1 exactly (evidence 1.1.0, evaluation 1.1.0, ruleset 1.1.0, passresult 1.0.0, snapshot 1.1.0, boundary 1.1.0). Two claims made by other documents resolve **only** against these files: `gateOrdinal` in `boundary_interfaces_v1.ts` L200 is the canonical definition API Contract v1.2 §18.2.1 asserts was created, and `ItemPath`/`ValuePath` in `ruleset_format_v1.ts` is the HB-1 fix the Implementation Readiness Review records.
- **Rejected:** none — uncontested.

### Category 3 — OpenAPI Specification
- **Selected base:** `openapi.yaml`
- **Evidence tier:** Tier 2, decisively.
- **Justification:** The ICD's 26 cited `operationId`s resolve **26/26** against `openapi.yaml` and **14/26** against the alternative. Reference integrity is complete: twelve external `$ref` to eight distinct targets, all resolving; 29 internal references against 29 component schemas with zero dangling and zero orphans; 9 response references against 9 reusable responses, zero dangling, zero unused.
- **Rejected:** `securesphere-openapi-3_1.yaml` — a second complete OpenAPI over the same 26 operations with 12 systematically divergent `operationId`s, inlining canonical payloads rather than referencing them.
- **Correction to the winner's stated basis:** MANIFEST §4 justifies this selection on reproducibility. That argument does not survive the corpus (**D-06**) and is replaced with the ICD cross-reference basis. See the inversion note at §8.4.

### Category 4 — Logical Database Design
- **Selected base:** `Logical-Database-Design-Specification-v1_1.md`
- **Evidence tier:** Tier 1.
- **Justification:** It uniquely carries `# Final Approval Status`, `## APPROVED`, the C.1 Freeze Gate, C.2 Verification Questions, C.3 Structural Comparison, and Appendices A, B and C. An explicit approval and freeze-gate record outranks a bare `Status: Canonical` self-assertion on a document carrying neither.
- **Rejected:** `LDD-v1_1.md` — lacks all of the above; its sole unique heading is `### 11.5 Invariants Enforced by the Application`. MANIFEST's claim that it is a strict subset with zero unique sections is false (**D-05**). `Logical-Database-Design-Specification.md` (v1.0) — status *For review*; `LDD-Final-Architecture-Verification.md` finds five defects including two blockers (unenforced no-deletion, unpartitionable schema), both resolved in v1.1 as C-1 and H-1/PD-1.

### Category 5 — System Architecture
- **No defensible base. Open Governance Question — see §8.8.**

### Category 6 — Rule Engine Specification
- **Selected base:** `SecureSphereX-RuleEngine-Spec-v0_8.md`
- **Evidence tier:** Tier 1.
- **Justification:** *"Status: FROZEN — Implementation Contract"*; §0.1 states it is the sole authoritative Rule Engine reference and supersedes all prior review discussion, correspondence and clarification.
- **Rejected:** none — uncontested.
- **Limitation stated, not a defect:** parity against the ruleset/evaluation/passresult contracts is verifiable against the **format** contract only. `rules-v0.1.0.json` is runtime data and absent by design, so that row reports `Pass (format only)` and never a clean pass.

### Category 7 — Backend Architecture
- **Selected base:** `Backend-Architecture-Specification-v1_3.md`
- **Evidence tiers:** Tier 1, Tier 2.
- **Justification:** v1.3's ten-line insertion over v1.2 is precisely the no-token-exchange rule and the `gateOrdinal`-carrying, `tier`-excluded HTTP projection that API Contract v1.2 §18.2.1 cites as the architecture amendment resolving both its escalations. The two documents corroborate each other's content without either naming the other's version. Delta figures: **10 lines added, 3 removed, net +7.**
- **Rejected:** v1.2 — lacks that amendment. v1.1 — `Final-Architecture-Closure-Report.md` states *"Produces: Backend Architecture Specification v1.2."* v1.0 — status *For architectural review*; `Backend-Architecture-Decision-Record.md` states *"Amends: … v1.0 → v1.1."*
- **Defect carried:** **D-17** — no corpus document names v1.3 as its product, unlike v1.1 and v1.2.

### Category 8 — Security Architecture
- **Selected base:** verbatim extract from `Backend-Architecture-Specification-v1_3.md` — **L112–121** (§1.7 Security Principles) and **L1003–1223** (§10 Security Architecture, §10.1 through §10.15).
- **Evidence tiers:** Tier 0 (R3 §4 extract range), Tier 1.
- **Justification:** §10 is titled "Security Architecture" and carries Trust Boundaries (§10.12) and Privacy Architecture (§10.13), the two constructs Section 6 requires this category to supply. No section originates outside the corpus, so Rule 13 holds. Cross-references pointing outside the extract stay as written, naming the source document.
- **Note of record:** the extract range was corrected from an initial §10.1–§10.13 to §10.1–§10.15; extracting to §10.13 would have silently dropped §10.14 Threat Mitigations and §10.15 Zero-Trust Assumptions.

### Category 9 — Extension Architecture
- **Not Applicable for a plugin or extensibility framework — and a documentation gap for the extension client itself.** Amended at Ruling R18 §EDF-3, superseding the bare `Not Applicable` of R2 R-5.3 and R13 §3.
- The `Not Applicable` ruling stands **only** in its narrow sense: Section 2 defines this category as the *"extension/plugin model"*, and this system genuinely has no extensibility or plugin framework.
- **It must not be read as covering the browser-extension client.** No document in the corpus describes Role A's own architecture. Measured across all 45 files: `manifest_version` 0 · `content script` 0 · `background script` 0 · `message passing` 0 · `chrome.runtime` 0 · `manifest v3` 1 · `service worker` 2. (`permissions` appears in 4 files, all permission-*evaluation* contexts — R-03 `sensitivePermissions` and rule PM-01 — not an extension permissions model.)
- **Role B is documented thoroughly; Role A is not documented at all.** Manifest version, content-script versus service-worker boundaries, message passing, permissions model, CSP, storage and update path are all absent. This is a **gap, not an inapplicability**, and it is scoped alongside Category 5 as Phase II documentation work — see §8.8.

### Category 10 — API Contract Specification
- **Selected base:** `API-Contract-Specification-v1_2.md`
- **Evidence tier:** Tier 1.
- **Justification:** Status *"For freeze — both escalations resolved by architecture amendment"*, with both escalations verified independently rather than accepted on the status line. **E-1** (extension token exchange): traced through the §5.2 replacement heading *Extension Credential Presentation — No Exchange Endpoint*, the §16 architectural-absence record, and a total rename (`extensionToken` 8→0; `extensionCredential` 0→8, and 12 occurrences in `openapi.yaml` with zero of the old name). **E-2** (`gateOrdinal` had no canonical definition): traced through `boundary_interfaces_v1.ts` L200 and its L193–199 comment, `d0_10_schema.json` `$defs/InvocationContext`, and the version bump to `BOUNDARY_CONTRACT_VERSION 1.1.0`.
- **Rejected:** v1.1 — its own §18.2.1 states it *"cannot be frozen until both are resolved."* v1.0 — status *For certification*, superseded through the same cycle.

### Category 11 — Interface Control Document
- **Selected base:** `SecureSphereX-Interface-Control-Document-v2.md`
- **Evidence tiers:** Tier 1, Tier 2.
- **Justification:** *"v2.0 · Frozen for implementation… supersedes any prior ICD export"*, and all **26 `operationId`s (distinct values)** resolve 26/26 against `openapi.yaml`. It cites the flat schemas **15 times across 9 lines**, naming all five files, and carries **7 explicit `#/$defs/` pairs (distinct pairs)**, all resolving.
- *Correction to an earlier figure in this report:* the ICD carries **seven** explicit canonical `$defs` citations, not eight. `PassTrigger` — one of `openapi.yaml`'s eight external targets — has **0 occurrences** in the ICD. The eight-target figure belongs to `openapi.yaml`, not to the ICD, and the two were conflated.
- **Rejected:** `ICD.pdf` — absent, and never a governed artifact (R2 R-1.2).

### Category 12 — MANIFEST.md
- **Selected base:** `MANIFEST.md` — admitted as **witness, not judge** (Rule 4).
- **Evidence tier:** Tier 1 where corroborated.
- **Justification:** All five schema SHA-256 prefixes, all five `$defs` counts and all six TypeScript version constants match disk exactly. Uncontested as the corpus index.
- **Defects carried:** eight discrepancies, D-04 through D-09 and D-15, D-16 — see §8.5.

---

## 8.4 Cross-Document Consistency Findings

Cross-Verification Matrix (Section 6), evaluated against the finalized document set.

| # | Check | Result |
|---|---|---|
| 1 | Schema ↔ DTO parity | **Fail (partial)** — D-03 only |
| 2 | Schema numbering integrity | Pass, one qualification |
| 3 | DTO ↔ OpenAPI parity | Pass |
| 4 | OpenAPI ↔ API Contract parity | Pass |
| 5 | OpenAPI internal reference integrity | Pass |
| 6 | DTO/Schema ↔ LDD parity | **Pass (decomposition documented)** / Not Verifiable at attribute level outside the eight wire-facing types |
| 7 | Backend ↔ Rule Engine parity | Pass, with note |
| 8 | Security Architecture ↔ boundary contracts | Pass |
| 9 | System ↔ Extension Architecture | **Not Verifiable** — Cat 5 OGQ, Cat 9 Not Applicable |
| 10 | ICD ↔ interface contract files | **Pass, with two documented exceptions** |
| 11 | MANIFEST ↔ repository state | **Fail** — eight discrepancies (D-21 is a Row 11–*class* finding but is **not** one of the eight; see below) |
| 12 | Terminology consistency | Pass |
| 13 | Structural/section completeness | Pass |

**Row 1 — the only remaining Fail attributable to a base document.** Across 66 `$defs` in five schemas, the only names unresolvable against the 114 canonical TypeScript exports are the eight `Observation<…>` monomorphizations in `d0_1_schema.json`. Six map back to `Observation<T>`; two cannot, carrying unresolved compiler symbol IDs. Field-level comparison across 68 shared interfaces found **zero property mismatches**. Six of the eight map correctly; two do not, and that is the whole of the failure.

**Row 2 qualification.** D0.1 through D0.10 are all referenced with no duplicate indices. Schemas exist for D0.1, D0.3, D0.4, D0.9, D0.10. MANIFEST explains the absence of D0.2 and D0.5 by name; D0.6 and D0.7 are the repository scaffold and CI baseline, not schema deliverables; D0.8's absence is explained only in `Contract-Integrity-Report.md` as client-local (**D-16**, corrected by E-04).

**Row 4 — passes because of a documented remediation, not because it was never broken.** Every status code `openapi.yaml` emits appears in §10.3. `400` appears in §10.3 alone, accounted for by FIX 5's annotation that it is a transport-level catch-all not enumerated per-operation. Against the pre-remediation copy this row **fails**: `openapi.yaml` returns `201` at `registerUser` and `enrolMfaFactor`, which the unremediated §10.3 did not enumerate. FIX 4 corrected exactly that.

**Row 6 — the substantive result is NM-1.** Wire form and storage form are related by documented decomposition (LDD L1500: the canonical form is authoritative, storage carries the transformed form, the wire never carries the storage form, and the transformation is applied at the repository boundary and nowhere else), not by 1:1 field mapping. The `evidence` → `observations` JSONB decomposition is justified at L674: D0.1's nine categories carry roughly eighty tri-state fields, and NULL cannot distinguish `absent` from `notCollected`. Enum dimension executed via G-8: 18 storage types, 10 canonical pairs matching under NM-1, 7 storage-only registered at §15.3.2, 1 derived projection.

**Row 7 — note, not drift.** "Evaluation Port" appears 24 times in Backend v1.3 and zero times in the Rule Engine specification. It is Backend's own runtime-adapter abstraction (§3.4), not a Rule Engine construct left undefined.

**Row 10 — two documented exceptions.** Twelve of the eighteen types exported by `boundary_interfaces_v1.ts` are not cited by the ICD. Eight are D0.8 (Authentication Store Query), marked client-local by `Contract-Integrity-Report.md` L70, and the ICD is HTTP-scoped by its own statement that it references `operationId`s and schema names. `CrossOriginMatch` is reachable only through `AuthStoreLookupResult` L56 and is covered by the same D0.8 explanation. `InterventionReporter` is named in five corpus documents including the Category 10 base. `SecurityStatePublisher` and `PassInvocationResult` are **inside IF-15's declared scope, functionally described and unnamed, with the canonical contract file cited** — not outside ICD scope. The ICD is not HTTP-scoped and says so at its own Checkpoint line: *"IF-14 and IF-15 are the two frozen non-HTTP boundaries."* IF-15 names `boundary_interfaces_v1.ts` and `AnalysisInvoker`, states *"Role B publishes (D0.9)"* — which is `SecurityStatePublisher` — and *"In-process; committed atomically or not"* — which is `PassInvocationResult`'s `committed | abandoned` union. Both behaviours are described; both identifiers are omitted.

**The ICD is not defective and Row 10 does not become a Fail.** It documents the boundary, cites the authoritative contract file, and describes both behaviours. Its own §7.2 consistency check tests inventory ↔ detail parity, not contract-type enumeration; it never claimed to name every exported type in a contract it references. The schema-membership test settles the consistency question: every D0.9/D0.10 type the ICD cites is in `d0_9_schema.json` or `d0_10_schema.json`; none of these is.

**Row 11 attribution — the count stays at eight.** D-21 is a Row 11–class finding: an artifact's self-description contradicting the status MANIFEST assigns it. But it is a defect **in the three contract files, not in MANIFEST** — MANIFEST was correct and the artifacts contradicted it. Row 11's eight discrepancies are defects in MANIFEST alone. A reader must not count nine.

**Row 12 scope, stated because D-21 tested it.** Row 12 asks whether the same *concept* is named consistently across documents. `DRAFT` versus `FROZEN` is a lifecycle claim, not a term, so a status-line divergence falls outside this row. Stretching it to cover D-21 would make the row mean something it does not. Row 12 stays `Pass`.

**ICD completeness — one candidate gap tested and cleared.** `retry` and `backoff` return **0 occurrences** in the ICD, which for a browser-extension client over the public internet would normally be a real omission: IF-1's idempotency on `(sessionId, gateOrdinal)` exists precisely to make retry safe, and a guarantee without a policy is incomplete. Retry **is** specified. Matcher `retry|retries|backoff`, case-insensitive: **0 occurrences** in the ICD, **12** in API Contract v1.2, **12–14** in Backend v1.3 depending on matcher; `Retry-After` present on 429 and 503 (**3 occurrences**) and an explicit note that the correct client behaviour on 503 is to retry. The ICD's §1 principle is that anything already fixed in a baseline artifact is referenced rather than restated. **No finding.** Recorded as a tested negative, because a cleared candidate is worth more than an untested clean bill.

**Row 12.** `extensionToken` stands at 0 and `extensionCredential` at 20 across the authoritative set; the rename is total. `Security Resource`/`SecurityResource`-style pairs are prose-versus-identifier register, not competing terminology.

### The reproducibility inversion — a consequence of the remediation, stated plainly

After E-22 and E-23 land, **the rejected lineage becomes reproducible from repository contents and the selected one does not.** `generate-canonical-schemas.py` will glob the repository's six TypeScript contracts and write `/tmp/canonical-schemas.json`; `assemble-openapi.py` reads that and writes `securesphere-openapi-3_1.yaml`. Every step is then present and runnable. Meanwhile `openapi.yaml` still depends on five flat schemas that no tool in this repository produces (**D-01**).

This does not disturb the authority verdict, because authority was never grounded in regenerability: it rests on the ICD cross-reference at 26/26 versus 14/26. MANIFEST's reproducibility argument was always the wrong ground, and E-07 replaces it. The weaker and accurate claim about E-22 and E-23: they make the chain **reproducible**, not immediately runnable end-to-end in a fresh checkout without first executing the generator.

---

## 8.5 Defect and Risk Register

**23 entries: 2 Blocking · 16 Major · 5 Minor. 20 Reconciled · 3 Flagged.** Re-derived from the table below rather than carried forward; matches §8.1. Flagged: D-17, D-20, D-24a.

**Reconciliation of rows to entries: the table has 24 rows and 23 entries.** D-24 occupies two rows because its two halves take different dispositions — D-24a the identifier collision, Flagged; D-24b the false CI-coverage claims, Reconciled via E-32 — but it is **one root cause counted once**, as Major/Flagged. D-01…D-22 less the permanently struck D-23 gives 21, plus D-24 gives 22 — and the 23rd is D-20, which is listed among the Major rows rather than at the foot. Counting rows gives 24; counting defects gives 23.

| ID | Defect | Type | Severity | Disposition | Location |
|---|---|---|---|---|---|
| D-01 | No tool in the repository generates the flat `d0_*_schema.json`. The generator present emits a `{schemas, issues}` envelope of 50 schemas with no `$id`/`$schema`/`$defs`, and cannot produce 12 of the names the flat files carry | Broken Reference | **Blocking** | **Reconciled (Tier 0 — adoption)**, condition persists | `generate-canonical-schemas.py:252` vs the five schemas |
| D-02 | G-8 opens `Logical-Database-Design-Specification-v1.1.md` (dotted); no such file exists. The gate raises `FileNotFoundError` on every invocation | Broken Reference | **Blocking** | Reconciled — E-21, verified landed at Document 1. **Reconciled as to the script only:** the continuous-CI assurance claimed at `Contract-Integrity-Report.md` L250 and L348 is **not delivered** — see D-24b. The script works; the guard does not stand | `contract-conformance-check.py:12` |
| D-03 | Eight orphan `Observation<…>` `$defs`, two carrying unresolved TypeScript compiler symbol IDs. Keys are not URI-fragment-safe | Stale Schema | Major | **Reconciled (Tier 0 — deferred to regeneration)**, condition persists | `d0_1_schema.json` `$defs` |
| D-04 | Preamble claims a flat repository root while §3 lists `archive/`-prefixed paths — self-contradiction on one page, independent of disk state; and no `archive/` exists | Contradiction | Major | Reconciled — E-01, E-05 | `MANIFEST.md` L7 vs L63–72 |
| D-05 | `LDD-v1_1.md` called a strict subset with zero unique sections — false | Contradiction | Major | Reconciled — E-05 | `MANIFEST.md` L72 |
| D-06 | §4's reproducibility argument selects `openapi.yaml` on a criterion the winner also fails | Contradiction | Major | Reconciled — E-07 | `MANIFEST.md` L82 |
| D-07 | *"No document in the repository names…"* — contradicted by `FIX_LOG.md` and by MANIFEST's own §3 | Contradiction | Major | Reconciled — E-08 | `MANIFEST.md` L84 vs L69 |
| D-08 | *"Generated from the TypeScript sources above. Never hand-edited."* — a provenance claim no corpus tool supports | Broken Reference | Major | Reconciled — E-03 | `MANIFEST.md` L34 |
| D-09 | §1 role entry assigns *"overall system architecture"* to the Rule Engine specification, whose headings are rule-engine-scoped throughout | Contradiction | Major | Reconciled — E-02, cross-ref §8.8 | `MANIFEST.md` L15 |
| D-10 | Generator `SRC` hardcoded to an authoring-sandbox absolute path | Broken Reference | Major | Reconciled — E-22, contingent | `generate-canonical-schemas.py:23` |
| D-11 | Generation Report states `./generated/` paths, 22 transport schemas and 10 reusable responses; actual are flat, 29 and 9 | Stale Schema | Major | Reconciled — E-19, append-only | `OpenAPI-Generation-Report.md` L19–20, 65, 83–87, 146 |
| D-12 | FIX_LOG declares a final state — `archive/` holding four files, plus `ICD.pdf` — that does not exist | Broken Reference | Major | Reconciled — E-20, append-only | `FIX_LOG.md` L29–32, 46–48, 110 |
| D-13 | `LDD-v1_1.md` is a duplicate v1.1 asserting `Status: Canonical` against the copy carrying the approval statement and freeze gate | Contradiction | Major | Reconciled — E-24 | `LDD-v1_1.md` header |
| D-14 | `securesphere-openapi-3_1.yaml` is a second complete OpenAPI over the same 26 operations with 12 systematically divergent `operationId`s | Contradiction | Major | Reconciled — E-25 | file header |
| D-20 | No System Architecture document or section exists anywhere in the corpus | Structural Gap | Major | **Flagged** — see §8.8 | Category 5 |
| D-21 | Three canonical contracts declare `STATUS: DRAFT — pending confirmation.` while shipping as authoritative Category 2 deliverables at frozen version constants | Contradiction | Major | Reconciled — E-30 | `passresult_contract_v1.ts` L17 · `snapshot_format_v1.ts` L21 · `boundary_interfaces_v1.ts` L20 |
| D-22 | All eight cross-module import specifiers are dotted (`./evidence.contract.v1`); every file on disk is underscore-named, so the set does not compile as delivered | Broken Reference | Major | Reconciled — E-31 (documented, not renamed) | `boundary_interfaces_v1.ts` L23–27 · `evaluation_contract_v1.ts` L16 · `passresult_contract_v1.ts` L20–21 · `ruleset_format_v1.ts` L16 · `snapshot_format_v1.ts` L24 |
| D-24a | `ci.yml` and `Stage0-Completion-Pack.md` define **G-8** as the rule-set static validator (V-1…V-12, D0.3 §8, release gate §17.5); `Contract-Integrity-Report.md` defines **G-8** as `contract-conformance-check.py`, enum conformance between the D0.x sources and the LDD. Different scope, trigger and activation, one identifier | Contradiction | Major | **Flagged** — the corpus does not say which is correct; renaming would be authoring | `ci.yml` L9, L58, L64 · `Stage0-Completion-Pack.md` L71 · `Contract-Integrity-Report.md` L250 |
| D-24b | `Contract-Integrity-Report.md` claims the gate *"runs in CI on every change to a contract or to the LDD"* (L250) and that governance against drift is *"**Met** … with G-8 retained as an executable CI check"* (L348). **`ci.yml` contains zero occurrences of `contract-conformance`, `d0_` or `schema.json`** — the check is not in CI at all | Contradiction | Major | Reconciled — E-32, append-only | `Contract-Integrity-Report.md` L250, L348 vs `ci.yml` |
| D-15 | *"resolves eight external `$ref`"* — twelve references to eight distinct targets | Terminology Drift | Minor | Reconciled — E-06 | `MANIFEST.md` L80 |
| D-16 | Schema-absence explanation covers D0.2 and D0.5; omits D0.8 | Broken Reference | Minor | Reconciled — E-04 | `MANIFEST.md` L44 |
| D-17 | No corpus document names Backend v1.3 as its product, unlike v1.1 and v1.2 | Broken Reference | Minor | **Flagged** — no corpus basis for a correction | `Backend-Architecture-Specification-v1_3.md` L3 |
| D-18 | Writes dotted `securesphere-openapi-3.1.yaml` to a sandbox path rather than the repository filename | Broken Reference | Minor | Reconciled — E-23 | `assemble-openapi.py:475` |
| D-19 | Status reads *For architectural review. No specification change proposed until reviewed* though ratified in substance | Stale Schema | Minor | Reconciled — E-29 | `DesignNote-Corpus-Split-Independence.md` L3 |

**Two entries are Reconciled by decision, not by fix.** D-01 and D-03 were resolved at Ruling R13 by Architecture Owner decision. No generator was found and no schema was edited; the register must not be read as implying either.

**Two further Reconciled statuses are contingent.** D-02 and D-10 are marked Reconciled on the strength of edits that exist in a working copy and not yet in the corpus. E-21 and E-22 are mandatory named planned edits and must be verified applied at Phase 12. If either is lost, the audit would close with a gate proven to work and a repository in which it still cannot run.

---

## 8.6 Reconciliation Log

**31 planned edits.** Re-derived by enumeration: E-01…E-10 (10) · E-11…E-17, the seven `[GAP-3]` marker conversions (7) · E-19…E-31 (13) · E-32 (1). **`E-18` is deliberately unassigned** — a numbering gap left when R12 §2 reduced the marker conversions from eight to seven, because E-10 subsumes the L25 marker. A reader counting E-01 through E-31 inclusive would get 31; the correct figure is 30. No edit introduces normative content absent from the corpus. One section heading is newly worded (E-05), permitted at R12 §4, replacing a heading that asserted a non-existent path.

### `MANIFEST.md` — 8 edits

**E-01** · L7 · before: *"All paths below are the real, current on-disk paths (flat repository root, underscore-named files; archived artifacts under `archive/`)."* · after: *"All paths below are the real, current on-disk paths. The repository is a flat root of underscore-named files; there is no `archive/` directory."* · evidence: disk enumeration, 45 files, no `archive/`; internal contradiction L7 vs L69–72.

**E-02** · L15 role cell · before: `Overall system architecture, rule engine` · after: `Rule engine` · evidence: `SecureSphereX-RuleEngine-Spec-v0_8.md` headings §1 Design Philosophy through §22 Freeze Statement are rule-engine-scoped throughout; no system-architecture content. Cross-referenced from §8.8.

**E-03** · L34 · before: *"Generated from the TypeScript sources above. **Never hand-edited.** JSON Schema 2020-12. Held as flat files in the repository root; referenced by `openapi.yaml` via `./d0_*_schema.json`."* · after: *"JSON Schema 2020-12. Held as flat files in the repository root; referenced by `openapi.yaml` via `./d0_*_schema.json`. **Provenance is unestablished** — no tool in this repository produces these files; see Pre-Implementation Decision #1."* · evidence: `generate-canonical-schemas.py:252` writes only `/tmp/canonical-schemas.json`, in a different envelope, and cannot emit 12 of the names present.

**E-04** · L44 · append after the existing sentence: *"D0.8 likewise has no generated schema: it is the Authentication Store Query interface, client-local only."* · evidence: `boundary_interfaces_v1.ts` L3 names "D0.8 Authentication Store Query"; `Contract-Integrity-Report.md` L70 marks D0.8 client-local.

**E-05** · §3, L63–72 · before: heading `## 3. Archived Artifacts — archive/`, the sentence *"All four now reside in `archive/`"*, and four `archive/`-prefixed table rows including the strict-subset claim · after: heading `## 3. Non-Authoritative Artifacts — repository root`, flat paths, and per-file status per R12 §5, with the `LDD-v1_1.md` row reading *"Superseded by `Logical-Database-Design-Specification-v1_1.md`. It is **not** a strict subset: §11.5 Invariants Enforced by the Application is unique to it."* · evidence: disk paths; heading-level comparison of the two v1.1 documents.

**E-06** · L80 · before: *"resolves eight external `$ref`"* · after: *"resolves twelve external `$ref` references into eight distinct `$defs` targets"* · evidence: `openapi.yaml` lines 161, 200, 431, 974, 1143, 1169, 1191, 1199, 1259, 1286, 1295, 1328.

**E-07** · L82 · before: *"**The alternative's inputs are not in the repository.** … `archive/securesphere-openapi-3_1.yaml` therefore cannot be regenerated or verified from repository contents."* · after: *"`openapi.yaml` is authoritative on cross-reference: the ICD's 26 cited operationIds resolve 26/26 against it and 14/26 against the alternative. Reproducibility is **not** the discriminator. The flat `./d0_*_schema.json` files this document references have no generator in this repository — see Pre-Implementation Decision #1 — whereas the alternative lineage regenerates from the TypeScript sources once its tooling paths are corrected. Authority here rests on cross-reference, not on regenerability."* · evidence: ICD `operationId` resolution counts; D-01; the post-E-22/E-23 state of the alternative lineage.

**E-08** · L84 · before: *"**Only one document is named by any repository document.** … **No document in the repository names the file now held at `archive/securesphere-openapi-3_1.yaml`.**"* · after: *"`OpenAPI-Generation-Report.md` names `openapi.yaml` as its subject. `securesphere-openapi-3_1.yaml` is named by `FIX_LOG.md` and by §3 of this manifest."* · evidence: `FIX_LOG.md`; MANIFEST L69.

**Two inline flags into MANIFEST §1** (not counted as edits above; they are the markers required by Phase 8 for flagged defects): `⚠ UNRESOLVED — Pre-Implementation Decision #1, see Section 8.7` at the D0.x schema table, and `⚠ UNRESOLVED — Pre-Implementation Decision #2, see Section 8.7` beside the `d0_1_schema.json` row.

### `Logical-Database-Design-Specification-v1_1.md` — 1 edit

**E-09** · L2582 · before: *"One item carries forward, unchanged and non-blocking: **AM-4**, the absence of any deletion path, which is a property of the frozen architecture rather than of this design, and which downstream work should treat as fixed rather than as a gap to be closed later."* · after: *"**AM-4** — deletion of the analytical record is prohibited by construction; no deletion path exists at any layer. Where an external or regulatory obligation demands removal, that is routed to the §43 architecture-change process, which is defined in the Persistence Architecture Specification and is not part of this delivered set. Downstream work should treat this as a fixed property of the frozen architecture rather than as a gap to be closed later. *Not Verifiable: Persistence §6, §21, §43 and §44, cited in this document and in support of AM-4, are external to this repository and absent from this corpus.*"* (as amended for EDF-2 at Document 3 re-delivery) · evidence: GAP-3 §34.8; API Contract v1.2 §16 history-deletion row (AC-7; Persistence §6, §21, §34.7; AM-4); LDD Appendix A.1 C-1 — six roles replacing three, DELETE and TRUNCATE in no grant, five `BEFORE DELETE` guard triggers; R6 §4.

### `Backend-Architecture-Specification-v1_3.md` — 8 edits

**E-10** · L25 · before: *"**Scope of the carve-out.** Two areas remain unfrozen: the **Security Resource identity model** and **Current Security State governance**. Every point where the frozen text must supply the answer is marked `[GAP-3]`."* · after: *"**Carve-out closed.** Both areas — the Security Resource identity model and Current Security State governance — are frozen on the ratification of `GAP-3-Persistence-Reconstruction.md` (Architecture Owner, Ruling R3 §6c). Points formerly marked `[GAP-3]` now cross-reference the ratified reconstruction."* · evidence: R3 §6c ratification. **This edit subsumes the L25 marker**, so marker conversions number seven, not eight.

**E-11 … E-17** · the seven remaining `[GAP-3]` occurrences at **L509, L822, L827, L1444, L1889, L1898, L1908** · each **converted, never deleted**, to `[GAP-3 → CLOSED: Persistence §N, ratified R3 §6c]`, naming the supplying section: L509, L822 and L827 → §14 Canonical Identity Model and §15 Identity Lifecycle; L1444 → §33 Current Security State Governance; L1889, L1898 and L1908 → the closure statement. · evidence: the ratified reconstruction's coverage of §12–15, §31–34, §41–42, verified complete with no gap inside the claimed range.

### Supporting-Evidence records — append-only, bodies untouched

**E-19** · `OpenAPI-Generation-Report.md` · dated amendment block appended: `./generated/` paths superseded by flat `./d0_N_schema.json` (FIX 1); 22 → **29** component schemas; 10 → **9** reusable responses; "8 external `$ref`" restated as **twelve references to eight distinct targets**. The report's "no orphan schemas" claim **holds** — 29 references against 29 components. · evidence: `openapi.yaml` as parsed.

**E-20** · `FIX_LOG.md` · dated amendment block appended: the declared final state does not obtain — no `archive/` directory exists, all four artifacts are at repository root, and `ICD.pdf` is absent. **FIX 4 and FIX 5 are independently verified in the corpus text** at §10.3 L461 and L463; the log is corroborated on those entries and corrected only on its final-state claim. · evidence: disk enumeration; API Contract v1.2 §10.3.

### Tooling — mandatory named edits, verified applied at Phase 12

**E-21** · `contract-conformance-check.py` L1, L6, L12 · before: `import re, glob, sys`; `for f in glob.glob('*.ts'):`; `ldd=open('Logical-Database-Design-Specification-v1.1.md').read()` · after: `import re, glob, os, sys` with `BASE = os.path.dirname(os.path.abspath(__file__))` and `LDD_NAME = 'Logical-Database-Design-Specification-v1_1.md'`; glob scoped to `BASE` with explicit UTF-8; the LDD opened behind an `isfile` guard that prints to stderr and exits 2. · evidence: the actual repository filename. **Proven:** CONFORMANT at exit 0 across 18 storage types; missing-file branch exits 2 cleanly; a seeded `risk_tier` `'high'`→`'severe'` violation produces exit 1 with the correct canonical-only/storage-only split. The gate discriminates; the pass is not vacuous.

**E-22** · `generate-canonical-schemas.py` L23 · before: `SRC = Path('/mnt/user-data/outputs')` · after: `SRC = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent` · evidence: the script's own repository location. **Proven byte-identical:** SHA-256 `d6464979c9f11cba…`, 109,729 bytes, across baseline, no-argument and explicit-argument runs.

**E-23** · `assemble-openapi.py` L475 · before: output to `/mnt/user-data/outputs/securesphere-openapi-3.1.yaml` (dotted, sandbox path) · after: repository-relative `securesphere-openapi-3_1.yaml` · evidence: the actual repository filename.

### Banners — four files, four distinct statuses

**E-24** · `LDD-v1_1.md` · **Superseded by** `Logical-Database-Design-Specification-v1_1.md` — the only genuine document supersession of the four.
**E-25** · `securesphere-openapi-3_1.yaml` · **Not authoritative** — generated artifact of a parallel lineage; `openapi.yaml` is authoritative on the ICD cross-reference basis (26/26 versus 14/26).
**E-26** · `assemble-openapi.py` · **Retained tooling of a non-authoritative lineage** — produces the above; not superseded by anything.
**E-27** · `generate-canonical-schemas.py` · **Retained tooling of a non-authoritative lineage** — feeds the above; does **not** produce the flat `d0_*_schema.json` files (D-01).

No banner names a successor that does not exist. Three of these four have no successor; they have a status.

### Status corrections

**E-28** · `GAP-3-Persistence-Reconstruction.md` L6 · before: *"**Status:** For ratification. On ratification these sections merge into the Persistence Architecture Specification (Revision 2) and this wrapper is discarded."* · after: *"**Status:** Ratified — Architecture Owner, Ruling R3 §6c. These sections merge into the Persistence Architecture Specification (Revision 2) and this wrapper is discarded."* · evidence: R3 §6c.

**E-29** · `DesignNote-Corpus-Split-Independence.md` L3 · before: *"**Status:** For architectural review. No specification change proposed until reviewed."* · after: *"**Status:** Ratified (R2 R-4.3). Adopted as D0.5 `SNAPSHOT_FORMAT_VERSION 1.1.0`; split-v1 retired."* · evidence: `snapshot_format_v1.ts` L121 (split-v1 retired, split-v2 keyed on registrable domain), L124 (`splitKey`), L242 (invariant S-2a).

**E-32** · `Contract-Integrity-Report.md` · dated amendment block appended, body untouched: the G-8 claims at L250 and L348 are not met as written. `contract-conformance-check.py` is **not invoked by `ci.yml`**, which contains zero occurrences of `contract-conformance`, `d0_` or `schema.json`. The gate is executable and was executed CONFORMANT with two negative controls during this audit; it is not a continuously operating CI control. · evidence: `ci.yml` as parsed. (D-24b)

### Raised during staged production (Section 2.1 acknowledgment protocol)

Both were raised by the reviewer at Document 2, not found in Phase 5. Recorded as such so the register does not imply the analysis phases caught them.

**E-30** · `passresult_contract_v1.ts` L17, `snapshot_format_v1.ts` L21, `boundary_interfaces_v1.ts` L20 · before: `* STATUS: DRAFT — pending confirmation.` · after: `* STATUS: FROZEN at Stage 0.` · evidence: the wording is taken verbatim from `evaluation_contract_v1.ts` L10, so nothing is authored. The frozen position is attested in three independent places — MANIFEST §1 records all six version constants as authoritative; `Implementation-Readiness-Review.md` returns a compilation-based GO; `Contract-Integrity-Report.md` resolves eight drifts across D0.1–D0.10 and establishes G-8, which has since executed CONFORMANT. **No other line in any of the three files changes** — verified at one changed line per file.

**E-31** · `MANIFEST.md` §1 · append one line: *"Module specifiers inside the contract files follow the implementation repository's dotted `packages/contracts` convention (`./evidence.contract.v1`); this specification repository stores the same files underscore-named per §Preamble. The two differ by design and neither is a defect."* · evidence: the dotted convention is attested in `FIX_LOG.md`, `Contract-Integrity-Report.md` and `OpenAPI-Generation-Report.md`, and `Implementation-Readiness-Review.md` names `evaluation.contract.v1.ts` directly while reporting a compilation-based GO; the underscore convention is stated at MANIFEST L7. **No file is renamed** — renaming would alter six artifacts to close a documentation gap.

*Unit note, per R16 §3:* export counts of 28/21/22/13/12/18 count exported **types** (`interface | type | enum`). Counting `export const` as well gives 33/22/23/14/13/19. Both are correct measurements of different things; the type count is the one used in Phase 1 and matches MANIFEST §1.

### Resolved ambiguities — recorded, not defects

These are not register entries. They are recorded here so they do not vanish.

| Item | Disposition | Authorising ruling |
|---|---|---|
| **AM-1** — supersession evaluation timing | **Closed** on the ratification of New Decision N-1 (lazy supersession, evaluated on canonicalization under the current policy version). The gate at GAP-3 L748 — *"PostgreSQL Logical Schema Design — SKR identity and Current Security State: Ready on ratification of N-1"* — is satisfied | R3 §6d |
| **AM-2** — orphaned field list, page 13 | **Contained** — declared loss with documented non-exposure. The reconstruction declines to place the fields because doing so would require inventing a structure the evidence does not support; Backend v1.3 L692 records the unplaced Knowledge Metadata field set as unexposed; API Contract v1.2 L793 cites AM-2 by name as the reason the endpoint does not exist | R4 §7 |
| **AM-3** — §35 Domain Assessment Governance partially missing | **Contained** — declared loss with documented non-exposure. Named in Backend v1.3's §0 page-loss table; L692 declines to expose Domain Security State or Knowledge Metadata; API Contract v1.2 L792 cites AM-3 by name. Counter-check run: no `.ts` source, no generated schema, and no schema, property or path name in `openapi.yaml` exposes either construct | R4 §7 |
| **AM-4** — deletion under external obligation | **Reconciled — stated architectural prohibition, carrying §43 routing**, with a `Not Verifiable` note that Persistence §6, §21, §43 and §44 are external to this repository and absent from the corpus | R6 §4, applied at E-09 |

### Phase 11 addendum — reviewer decisions

Recorded per Phase 11: attributed to the reviewer (Architecture Owner), **not** to any corpus document. Each is Tier 0 evidence for its specific item only.

**A-01 · D-01 · Ruling R13 §1 — schemas adopted by digest.** The five flat `d0_*_schema.json` files are adopted as canonical artifacts of record, anchored to their recorded SHA-256 digests rather than to a derivation chain. Provenance remains unestablished; this decision does not establish it. Reconstruction of the generating tool becomes a mandated Phase I implementation obligation. **Updates:** finalized `MANIFEST.md` §1 — the planned `⚠ UNRESOLVED — Pre-Implementation Decision #1` marker is replaced verbatim by the R13 §1 adoption text.

**A-02 · D-03 · Ruling R13 §2 — malformed keys deferred to regeneration.** `d0_1_schema.json` is not edited. The two malformed keys are corrected by the reconstructed generator. All eight orphan monomorphizations are retained: removing them would be a behavioural change beyond the scope of the defect. **Updates:** finalized `MANIFEST.md` §1, `d0_1_schema.json` row — the planned `⚠ UNRESOLVED — Pre-Implementation Decision #2` marker is replaced verbatim by the R13 §2 text.

**A-03 · Ruling R13 §2 — acceptance test scoped, correcting an impossible criterion in this report.** As originally written, §8.7 required the reconstructed generator both to reproduce the recorded digests and to fix the two malformed `$defs` keys. Those cannot both hold: correcting the keys changes `d0_1_schema.json`'s bytes, so its digest cannot remain `d3d435ac649f497e…`. The acceptance test is scoped:

| File | Acceptance criterion |
|---|---|
| `d0_3`, `d0_4`, `d0_9`, `d0_10` | **Byte-identical.** Digests must match `9603668a9a00b430…`, `c9d06ed60db08070…`, `0ae07b4ddd6599ca…`, `0eb18d1cb0554c50…` exactly. Any divergence fails. |
| `d0_1` | All 28 correctly-named `$defs` byte-identical in content; the two malformed keys corrected to `Observation<readonly RedirectHop[]>` and `Observation<readonly LoginFormObservation[]>`. **Digest changes by design**, and the new digest is recorded in MANIFEST §1 at that point, superseding `d3d435ac649f497e…`. |

**A-04 · D-20 · Ruling R13 §3 — Category 5 explicitly left open.** The reviewer declined both offered resolutions: supplying a System Architecture document would author normative content absent from the corpus, and ruling that no distinct layer exists would contradict the evidence this audit produced. The item keeps its §8.8 entry and its `Major / Flagged` disposition, and Phase 12 proceeds with it open.

---

## 8.7 Pre-Implementation Decisions Required — **both resolved at Phase 11**

Two decisions genuinely required a human before implementation. **Both were decided by the Architecture Owner at Ruling R13** and are recorded as Reconciliation Log addenda A-01 through A-03. Neither `⚠ UNRESOLVED` marker survives into the finalized `MANIFEST.md`; each is replaced verbatim by the decision text below.

**The underlying conditions persist.** No generator was found; no schema was edited. What changed is the governance status of artifacts whose provenance the corpus cannot establish, which is a decision only the Architecture Owner could make. The central finding at §8.1 stands unchanged.

### PID #1 — the canonical schema generator does not exist in this repository · **DECIDED (R13 §1)**
**Location:** finalized `MANIFEST.md` §1, at the D0.x schema table. **Register:** D-01, Blocking → Reconciled (Tier 0 — adoption).

**What the evidence shows.** The five flat `d0_*_schema.json` files are referenced by two independent documents and are digest-consistent with MANIFEST. But no tool in the repository produces them. `generate-canonical-schemas.py` writes a single `{schemas, issues}` envelope of 50 schemas to `/tmp/canonical-schemas.json`, with no `$id`, `$schema` or `$defs` structure. The flat files carry 66 `$defs` across five documents, each with a full envelope, and **twelve `$defs` names appear in the flat files and in no generator output** — including `FindingPath`, `ItemPath`, `ValuePath`, `CollectionPath` and six mangled `Observation<…>` forms. The flat schemas could not have been produced by this generator even with its `SRC` corrected.

**What would resolve it.** The missing generator, or an authoritative statement of where these files came from.

**Three demonstrated mechanism differences (amended at Ruling R14 §3, from executing the generator rather than from reading it).** These are constructive evidence, not inference from absent names:

1. **The generator never emits a named `Observation<T>` schema at all.** `observation_schema()` returns an inline `oneOf` structure directly; no monomorphization is ever hoisted into a named component. Its output contains **zero** `Observation<…>` keys. The missing tool *names and hoists* them. This is a difference in design rather than a naming bug, and it accounts for all eight orphan keys at once.
2. **Different root set.** This generator emits the transitive closure of six `WIRE_ROOTS` — `SecurityEvidence`, `SecurityStateView`, `InvocationContext`, `UserDisposition`, `RecommendedResponse`, `RuleSet` — producing 50 schemas. The flat files carry **66 `$defs` across five documents**, including `FindingPath`, `ItemPath`, `ValuePath` and `CollectionPath` (all four in `d0_3_schema.json`), none of which appears in the generator's output. The missing tool emits **per-contract-file completeness**, one document per D0.x source, not wire-root closure.
3. **Different reference style and envelope.** This generator emits 115 `#/components/schemas/…` references and **zero** `#/$defs/…`, inside a single `{schemas, issues}` object with no `$id`, `$schema` or `$defs`. The flat files use `#/$defs/…` inside five separate documents, each carrying `$schema`, `$id`, `title` and `$defs`.

**Negative finding — this closes off the wrong hypothesis.** The generator reports **no translation issues** on a clean run. It is not a broken tool that would produce the flat files once repaired; it is a different tool with a different design. An implementer's first instinct will be to fix this generator until its output matches. That instinct is wrong and will waste time.

The defect also fingerprints the tool required: TypeScript-AST-based; monomorphizes generic types into concrete `$defs`; resolves `string[]` correctly but fails to resolve display names for arrays of interface types, emitting internal compiler symbol IDs instead; and produces `$id`/`$schema`/`title`/`$defs` envelopes across five files. Whoever reconstructs it must reproduce the six correct `Observation<…>` names and fix the two broken ones. **The acceptance test is scoped at addendum A-03**, because reproducing the recorded `d0_1` digest and correcting those keys are mutually exclusive.

**External consequence, distinct from the governance answer.** No CI gate can verify that the five schemas derive from the TypeScript contracts. G-8 validates TypeScript against the LDD's PostgreSQL enums and touches no JSON artifact. The chain TypeScript → JSON Schema → OpenAPI → ICD is therefore **unverifiable at its first link**, and Categories 3 and 11 inherit that. Digest adoption is a sound governance answer; it is not a reproducible build. Generator reconstruction is **release-gating**, not optional.

**Why no fix was possible here.** Regenerating requires a tool that is not in the corpus, and MANIFEST §6 states generated schemas are never hand-edited — which Section 7 independently forbids.

### PID #2 — two malformed `$defs` keys in `d0_1_schema.json` · **DECIDED (R13 §2)**
**Location:** finalized `MANIFEST.md` §1, beside the `d0_1_schema.json` row. **Register:** D-03, Major → Reconciled (Tier 0 — deferred to regeneration).

**What the evidence shows.** Of 30 `$defs`, eight are `Observation<T>` monomorphizations — `<string>`, `<number>`, `<boolean>`, `<string[]>`, `<LoginFingerprint>`, `<SensitivePermission>`, and two carrying unresolved compiler symbol IDs that should read `Observation<readonly RedirectHop[]>` and `Observation<readonly LoginFormObservation[]>`. All eight are unreferenced orphans; their bodies are well-formed and correctly reference `RedirectHop` and `LoginFormObservation`. Only the keys are broken. Reachability from `SecurityEvidence` — the name `openapi.yaml` references — covers 13 `$defs`, none malformed, and no `$ref` anywhere in the file targets any `Observation<…>` key.

**Why it is Major and not Blocking.** `openapi.yaml` resolves cleanly today. But the keys are not URI-fragment-safe — `<`, `>`, `[` and `]` require percent-encoding in a JSON Pointer fragment — so any future bundling, regeneration or `$ref`-walking tool that enumerates all `$defs` would emit invalid pointers. Latent, not theoretical. And Section 6's Schema ↔ DTO parity row cannot be reported as a clean pass while two monomorphizations map back to no DTO type name.

**What would resolve it.** Regeneration by the tool described in PID #1. Note for whoever cites MANIFEST §1 as corroboration: the `$defs: 30` figure is accurate, but the artifact is not clean — 8 of the 30 are orphans and 2 are malformed. The count is right; the file is not.

### PID #3 — wire `contract-conformance-check.py` into CI
**Register:** D-24b, and the qualification carried by D-02.

E-21 fixed the gate's path and it executes CONFORMANT across 18 storage types, with a missing-file branch exiting 2 and a seeded `risk_tier` violation exiting 1. **That is a demonstrated capability, not an operating control.** `ci.yml` never invokes it, so the eight contract drifts resolved in `Contract-Integrity-Report.md` are guarded only when someone runs the gate by hand. This is a one-line CI step and the corpus does not contain it; adding it here would be authoring.

### PID #4 — resolve the `G-8` identifier collision
**Register:** D-24a. Two gates carry the identifier and the corpus does not say which is correct: the rule-set static validator in `ci.yml` and `Stage0-Completion-Pack.md`, and the enum-conformance check in `Contract-Integrity-Report.md`. Renaming either would be authoring. A human must assign the identifier and rename the other.

### Flagged without a decision required

**D-17** (Minor) — no corpus document names Backend v1.3 as its product. No corpus evidence supplies one, so no correction was planned and no inline marker was inserted; per the reconciliation rules, Minor defects may be left with the decision recorded. The governance trail is incomplete but the architecture is not: v1.3's content and API Contract v1.2 §18.2.1 corroborate each other bidirectionally.

**D-20** — see §8.8. Listed in §8.5 as Major/Flagged and resolved there rather than duplicated as a third decision.

---

## 8.8 Open Governance Questions

### Category 9 — the browser-extension client is architecturally undocumented

Recorded here rather than left standing as a bare `Not Applicable` in §8.5, because the two readings of "Extension Architecture" have opposite consequences and only one of them is a genuine inapplicability.

**What is genuinely Not Applicable:** a plugin or extensibility framework. Section 2's definition describes a capability this system does not have, and that ruling is unchanged.

**What is missing:** the browser extension's own architecture — manifest version, content-script and service-worker boundaries, message passing, storage, and update path.

*Correction to this finding's item list, made on re-verification (R30 §2).* **CSP and Manifest V3 are not absent from the corpus.** `Backend-Architecture-Decision-Record.md` discusses the extension's MV3 CSP directly — *"Manifest V3 blocks WebAssembly by default; enabling it requires `script-src 'self' 'wasm-unsafe-eval'` in the extension CSP"* — with `MV3|Manifest V3` appearing 3 times there. The finding survives, because a WebAssembly-adoption decision record is not an extension architecture, but CSP and MV3 are recorded as **touched elsewhere** rather than absent. `permissions` likewise appears in 4 files, all permission-*evaluation* contexts. The absences that hold are: `client architecture` 0 · `extension architecture` 0 · `popup|side panel` 0 · `storage.local|chrome.storage` 0 · `manifest_version` 0 · `content script` 0 · `background script` 0 · `message passing` 0 · `chrome.runtime` 0. Role A is half the system and no corpus document describes it. The measured evidence is in §8.3 Category 9.

**The ICD reaches this boundary and stops short.** IF-15 documents the Role A ↔ Role B in-process boundary, names `boundary_interfaces_v1.ts` as its authoritative contract, and describes both types' behaviour without naming either. That locates the gap precisely: **the boundary is documented at interface-control level and undocumented at architectural level.** It is not that nothing reaches it.

**Why this matters more than its severity suggests.** An outside reviewer will see the pattern within minutes — Role B documented in four specifications, Role A in none — and a record reading `Not Applicable` will look like evasion rather than the narrow definitional ruling it was. Scoped with Category 5 as Phase II documentation work.

### Category 5 — System Architecture

**No defensible base document exists.** No file in the corpus, and no section of any file, is titled or structured as a system architecture. This was confirmed twice: at Phase 1 by inspection, and again after a completed classification and authority pass in which no candidate surfaced.

MANIFEST §1 assigns *"overall system architecture, rule engine"* to `SecureSphereX-RuleEngine-Spec-v0_8.md`. That assignment is **unsupported by the document's content** — its headings run §1 Design Philosophy through §22 Freeze Statement and are rule-engine-scoped throughout. Logged as D-09 in §8.5 and corrected at E-02, recorded once rather than counted twice.

**What the missing document costs, concretely.** This question no longer rests on absence alone. Two frozen canonical interfaces have no architectural description anywhere in the corpus:

- **`SecurityStatePublisher`** — declares `get()` and `subscribe()`, the latter returning an unsubscribe closure.
- **`PassInvocationResult`** — the discriminated return union of `AnalysisInvoker`: `{status:'committed', passResult}` or `{status:'abandoned', reason}`.

Both are at `BOUNDARY_CONTRACT_VERSION 1.1.0` and carry real invariants — the `interventionLocked` G-02 poisoning-window guard is documented in the contract file itself. The ICD is the wrong home: it is an HTTP interface document, and a closure has no wire projection. Backend v1.3 is also the wrong home: these are extension-side, not backend-side. A System Architecture document is the only correct home, and there isn't one.

**Left open by explicit reviewer decision (R13 §3), and Phase 12 proceeds with it open.** Both available resolutions were declined for stated reasons: supplying the document would author normative content absent from this corpus, and ruling that no distinct layer exists would contradict the evidence above.

**Definition of done.** Designated the **first documentation deliverable of Phase II**. The document must describe the **Role A ↔ Role B in-process boundary** and must, at minimum, assign an owner to:

- `SecurityStatePublisher` — `get()` and `subscribe()`, the latter returning an unsubscribe closure
- `PassInvocationResult` — the discriminated return union of `AnalysisInvoker`, `{status:'committed', passResult}` or `{status:'abandoned', reason}`

---

## 8.9 Appendix: Full File Classification Ledger

### Candidate-Final — 13

| File | Category | Evidence |
|---|---|---|
| `SecureSphereX-RuleEngine-Spec-v0_8.md` | 6 | *"FROZEN — Implementation Contract"*; §0.1 supersedes all prior review discussion |
| `Backend-Architecture-Specification-v1_3.md` | 7, and source of the 8 extract | *"Frozen, with one declared carve-out"*; carries the E-1/E-2 architecture amendment |
| `Logical-Database-Design-Specification-v1_1.md` | 4 | *"For freeze"*; uniquely carries the approval statement, freeze gate and Appendices A/B/C |
| `API-Contract-Specification-v1_2.md` | 10 | *"For freeze — both escalations resolved by architecture amendment"*, both verified independently |
| `openapi.yaml` | 3 | Resolves 26/26 of the ICD's cited operationIds; complete reference integrity |
| `SecureSphereX-Interface-Control-Document-v2.md` | 11 | *"Frozen for implementation… supersedes any prior ICD export"*; 26/26 operationIds resolve |
| `MANIFEST.md` | 12 | Digest and version claims verified against disk; admitted as witness, not judge |
| `evidence_contract_v1.ts` | 2 | `EVIDENCE_CONTRACT_VERSION = 1.1.0`, matching MANIFEST §1 |
| `evaluation_contract_v1.ts` | 2 | `EVALUATION_CONTRACT_VERSION = 1.1.0`; ten-module closed union |
| `ruleset_format_v1.ts` | 2 | `RULESET_FORMAT_VERSION = 1.1.0`; carries the HB-1 `ItemPath`/`ValuePath` fix |
| `passresult_contract_v1.ts` | 2 | `PASS_RESULT_CONTRACT_VERSION = 1.0.0` |
| `snapshot_format_v1.ts` | 2 | `SNAPSHOT_FORMAT_VERSION = 1.1.0`; split-v2 and invariant S-2a |
| `boundary_interfaces_v1.ts` | 2 | `BOUNDARY_CONTRACT_VERSION = 1.1.0`; carries the `gateOrdinal` canonical definition |

### Superseded — 7

| File | Superseded by | Evidence |
|---|---|---|
| `Backend-Architecture-Specification.md` | v1.3 | *"For architectural review"*; Decision Record states *"Amends: v1.0 → v1.1"* |
| `Backend-Architecture-Specification-v1_1.md` | v1.3 | Closure Report states *"Produces: … v1.2"* |
| `Backend-Architecture-Specification-v1_2.md` | v1.3 | Lacks the E-1/E-2 amendment |
| `API-Contract-Specification.md` | v1.2 | *"For certification"*; superseded through v1.1's escalation cycle |
| `API-Contract-Specification-v1_1.md` | v1.2 | Its own §18.2.1: *"cannot be frozen until both are resolved"* |
| `Logical-Database-Design-Specification.md` | v1.1 | *"For review"*; five defects found including two blockers, both resolved in v1.1 |
| `LDD-v1_1.md` | `Logical-Database-Design-Specification-v1_1.md` | Lacks the approval statement, freeze gate and Appendices A/B/C |

### Generated-Artifact — 8

`d0_1_schema.json` (30 `$defs`, SHA `d3d435ac649f497e`, carries D-03) · `d0_3_schema.json` (23, `9603668a9a00b430`) · `d0_4_schema.json` (2, `c9d06ed60db08070`) · `d0_9_schema.json` (7, `0ae07b4ddd6599ca`) · `d0_10_schema.json` (4, `0eb18d1cb0554c50`) — all five digest- and count-verified against MANIFEST §1, provenance unestablished (D-01), and simultaneously the sole Category 1 candidates. · `securesphere-openapi-3_1.yaml` — non-authoritative lineage. · `assemble-openapi.py` — generator of the above. · `generate-canonical-schemas.py` — feeds the above; does not produce the flat schemas.

### Implementation-File — 4

`capture.py` — Role C corpus capture; captures raw material only, deliberately extracts no evidence. · `migrate_split_v2.py` — split-v1 → split-v2 migration keyed on registrable domain; refuses to run once calibration has begun. · `contract-conformance-check.py` — governance gate G-8; fixed and executed CONFORMANT. · `ci.yml` — Stage 0 CI baseline, gates G-1 through G-7 with a deliberate-violation job.

### Supporting-Evidence — 13

`Backend-Final-Architecture-Review.md` — review of Backend v1.0; five findings, F-1 an internal contradiction between BI-24 and E2. · `Backend-Architecture-Decision-Record.md` — resolves those six decisions; *"Amends: v1.0 → v1.1"*. · `Final-Architecture-Closure-Report.md` — closes five ambiguities; *"Produces: v1.2"*. · `Contract-Integrity-Report.md` — eight contract drifts across D0.1–D0.10, now verified rather than assumed by the executed G-8. · `LDD-Final-Architecture-Verification.md` — review of LDD v1.0; five defects, two blockers. · `Implementation-Readiness-Review.md` — HB-1 and HB-2 fixed; verdict GO. · `Implementation-Ownership-Plan.md` — role allocation A/B/C; explicitly no architectural change. · `OpenAPI-Generation-Report.md` — generation record for `openapi.yaml`; stale counts corrected by append-only amendment (D-11). · `Stage0-Completion-Pack.md` — D0.6 scaffold, D0.7 CI gates G-1…G-10, D0.1 capability spike, day-one capture plan. · `DesignNote-Corpus-Split-Independence.md` — ratified in substance; status corrected at E-29. · `FIX_LOG.md` — prior remediation session; corroborated on FIX 4 and FIX 5, corrected on its final-state claim (D-12). · `GAP-3-Persistence-Reconstruction.md` — **Ratified** (R3 §6c); 255 evidence tags, coverage of §12–15, §31–34, §41–42 complete with no internal gap. · `GAP3_Reconstruction.pdf` — convenience rendering, 28 pages, no extractable text layer; pages 2–27 were never compared and **equivalence with the Markdown is not asserted**; the Markdown is authoritative by ratification, not by demonstrated equivalence.

---

---

## 8.10 External Defensibility Assessment

**What this section tests.** Not consistency with the other eleven documents — that is §8.4's job and it passed. This asks whether each finalized deliverable holds up when a reviewer outside this process reads it alone and pushes on it.

**Why §8.5 could not contain these.** An internal-consistency audit compares documents that are present. A reference to a document that is *absent* creates no contradiction, because there is nothing for it to conflict with. The corpus is internally consistent **because** of these gaps, not despite them. That is the structural blind spot, and it is why these are numbered `EDF-n` outside the `D-nn` register rather than folded into it — folding them in would misrepresent both.

> **§8.10 is not exhaustive, and three of its seven entries did not survive verification.** EDF-1's central claim was false; EDF-7's scope claim was false; EDF-4 was wrong on two of its three claims. All three were reviewer-issued. Two were caught by the auditor on verification; one was caught by the reviewer on re-examination. **One of them reached a delivered document** — EDF-4's inaccurate text shipped in Document 10's header and was withdrawn at re-delivery, before finalization rather than after. The remaining four were each subjected to a deliberate attempt to break them, by the same test that broke EDF-1 — *does the content resolve elsewhere under a different name, version or section title?* — and all four survived. The method that produced all seven tested each deliverable against Section 2's definition of its category and against its cross-references — it was **not** systematic against artifact-type content checklists. Absence of further findings here is not evidence of their absence.

**The closure standard.** An External Defensibility Finding says: an outside reviewer will ask X, and this corpus has no answer. There are two remedies — supply the answer, or state the absence precisely, in the right place, at the right prominence. **The first is unavailable for all six at Stage 0**, because each needs an artifact or a measurement that does not yet exist: a confusion matrix cannot precede an implementation, and an extension architecture cannot be authored inside a documentation audit without violating Section 7. The second is not a fallback but the correct engineering answer at this stage. An undisclosed gap is a defect; a disclosed, scoped, correctly-located gap is a governance record. **All six are closed by moving from the first state to the second.**

| ID | Finding | Severity | Categories affected | Closure |
|---|---|---|---|---|
| EDF-1 | Contracts cite their normative source as `Specification v0.7`; the document present is the same specification at v0.8 | Minor | 2 (label only) | Disclosed — one sentence naming the successor. **Restated at R28 §1; the original Critical claim was false** |
| EDF-2 | Persistence Architecture is absent; §43, §6, §21, §35 and §44 are cited and unreadable | Major | 4, 7 | Disclosed — E-09 amended to name the routing target as external |
| EDF-3 | The browser-extension client is architecturally undocumented across the entire corpus, and the record read `Not Applicable` | **Critical** | 9, 5 | §8.3 and §8.8 amended; scoped as Phase II documentation |
| EDF-4 | The Security Architecture deliverable is a verbatim extract and reads as one; it lacks a residual-risk statement | Minor | 8 | Extract header naming source, ranges and departing cross-references. **Restated at R29 §2; the threat-model and asset-register claims were false** |
| EDF-5 | The data-contract chain has no verifiable root; no CI gate can confirm the schemas derive from the TypeScript contracts | **Blocking** (= D-01) | 1, 3, 11 | §8.7 amended — generator reconstruction is release-gating |
| EDF-6 | Every rule is unvalidated and no threshold is empirically calibrated | Major | 6 | Surfaced in §8.1 executive summary, not only in Row 7's qualifier |
| EDF-7 | A backup posture is stated but no operational recovery parameters exist | Major | 4 | Disclosed, crediting LDD §17.8. **Rescoped at R28 §2; the original "anywhere" claim was false** |

### EDF-1 — WITHDRAWN as stated · restated Minor

**The original finding was false and is withdrawn.** It claimed `Specification v0.7` was absent and that *"an outside reviewer cannot verify a single invariant against its stated authority."* Both are wrong.

All **15 of 15** sections cited by the contract files resolve as **exact headings** in `SecureSphereX-RuleEngine-Spec-v0_8.md`, and the labels match the content — §3.2 Tier Definitions for *"lifecycle/tiers"*, §16.1 Latency Budgets for *"latency"*, §17.2 Deterministic Replay Gate for *"replay gate"*, §20.11 for ACEM. That document's header reads `Specification Version: 0.8`, and its version note names every addendum: v0.7 clarified DL-01 evaluation scope (§7.2), v0.8 fixed the benchmark unit (§13.3), and **"no predicate, weight, threshold, suppression, or pipeline stage has been altered across any addendum."**

**`Specification v0.7` is not an absent document. It is that document, one addendum earlier.** The original error was measuring a filename and concluding something about content.

**What survives — `Terminology Drift` / Minor.** The contracts cite a version label one addendum behind the document present. Closure, one sentence: *"The normative source is `SecureSphereX-RuleEngine-Spec-v0_8.md`. Contracts cite it at v0.7, one addendum earlier, with no normative change between — see that document's version note."* The claim that this affects Categories 2, 6, 7, 8 and 11 is withdrawn; only the label is affected.

**Category 5 is unaffected.** §0.1 scopes that document to the Rule Engine alone — no topology, no deployment, no Role A. D-09, E-02 and the Open Governance Question all stand.

### EDF-2 — Persistence Architecture absent · closed by disclosure, and not optional

Only the GAP-3 reconstruction exists, covering §12–15, §31–34, §41–42. Backend v1.3 and the LDD cite Persistence §6, §21, §35, §43 and §44 — none reconstructed. The consequence is live in a delivered document: E-09 routes external and regulatory deletion obligations to *"the §43 architecture-change process,"* and §43 is unreadable. **AM-4 is the first thing a data-protection reviewer probes**, and pointing them at an unnamed unreadable process is worse than naming it as external.

*Closure:* E-09's text amended to name the routing target as defined in the Persistence Architecture Specification and not part of this delivered set, with §43 added to the `Not Verifiable` citation list. Applied at Document 3 re-delivery.

### EDF-3 — Role A undocumented · closed by amending the record

See §8.3 Category 9 and §8.8. The `Not Applicable` ruling is preserved in its narrow, correct sense and no longer stands alone next to the gap.

### EDF-4 — RESTATED Minor · two of three claims were false

**Withdrawn as stated.** The original finding asserted *"no first-class threat model"* and *"no asset register."* Both are false, and both were asserted from section titles without reading the sections.

- **§10.14 *Threat Mitigations* enumerates nine threats in its own left column**, each paired with a mitigation: forged verdict submission · evidence poisoning to force Allow · SSRF via evidence acquisition · rule-set tampering · request replay · cross-user data access · credential stuffing · browsing-history inference · Authentication History exfiltration. Threat enumeration paired with mitigations **is** a threat model, and it is inside the extract.
- **§10.13.2 *Complete trust-boundary inventory*** is a `Data | Crosses? | Mechanism` table of **eleven data rows** — a data-asset inventory performing the function under another name.

**What survives — Minor.** The deliverable is a verbatim extract rather than an authored security architecture and reads as one. It contains **no residual-risk or risk-acceptance statement**: `residual risk|risk acceptance|accepted risk` returns 0 inside both extracted ranges, and Backend §21 *Risk Register* sits at source L1828, outside them. Six cross-references leave the extract and are enumerated in its header per R3 §4.

*Closure:* the Category 8 header names the extract, its source, both ranges, the six departing cross-references, and this restated limitation.

### EDF-5 — unverifiable chain root · already D-01, external consequence recorded

See §8.7 PID #1.

### EDF-6 — rules unvalidated · surfaced in the executive summary

See §8.1. The specification states its own unvalidated status directly, which is why this is the strongest passage in the corpus and its largest substantive gap simultaneously.

### EDF-7 — RESCOPED · no operational recovery parameters

**The original finding claimed no backup, restore or disaster-recovery position existed anywhere. That is false.** `Logical-Database-Design-Specification-v1_1.md` §17.8 *Encryption and Backup* (L1936) states one, and reasons from AM-4 to reach it:

> *"Backups inherit the no-deletion property: a restore must not be usable to reintroduce a deleted row, because no row is ever deleted. Backup retention should therefore be set for disaster recovery, not for archival — the live database is already the archive."*

The original measurement was correct for `Backend-Architecture-Specification-v1_3.md` alone — `\bbackup` 0, `disaster` 0 — and was generalised to the corpus without being run against it. Corpus-wide the same matchers return 6 and 3.

**What survives, and it is real.** Corpus-wide, word-bounded and case-insensitive: `\bRPO\b` **0** · `\bRTO\b` **0** · `point-in-time` **0** · `\bfailover\b` **0** · `\bpg_dump\b` **0**. **The corpus states a backup posture and no operational recovery parameters.**

Four established properties make that gap material rather than a checklist item: **AM-4** — deletion prohibited by construction, the store only grows; **P-12** — a Pass Result is immutable once committed; **LM-5** — the specification's own limitation that the single-instance database topology provides logical but not operational independence, with the API tier scaling and the database not; and **no re-derivation path**, since evidence is client-submitted and time-bound, with D0.5's own rationale noting phishing URLs decay within hours. An append-only, immutable, single-instance store of irreplaceable records, with a retention posture but no recovery objectives.

**The sharpest statement of it:** the corpus is rigorous about preventing deletion and quiet about preventing loss. AM-4 is enforced by six roles, zero `DELETE`/`TRUNCATE` grants and five `BEFORE DELETE` triggers, verified through Appendix A.1 C-1. A data-protection reviewer probes the first and gets a strong answer; an operations reviewer probes the second and gets a retention sentence.

`Major`, sited against **Category 4**. Closed by disclosure. **No backup section is authored into any specification** — that would be normative content absent from the corpus.

### Per-category defensibility

| # | Category | Internally consistent | Survives outside review | Gap |
|---|---|---|---|---|
| 1 | JSON Schemas | Yes | **No** | EDF-5 |
| 2 | TypeScript DTO | Yes | Partly | EDF-1 |
| 3 | OpenAPI | Yes | Yes | inherits EDF-5 |
| 4 | Logical Database Design | Yes | Partly | EDF-2 |
| 5 | System Architecture | — | **No** | absent; OGQ |
| 6 | Rule Engine | Yes | Partly | EDF-6, EDF-1 |
| 7 | Backend Architecture | Yes | Partly | EDF-1, EDF-2 |
| 8 | Security Architecture | Yes | **No** | EDF-4 |
| 9 | Extension Architecture | — | **No** | EDF-3 |
| 10 | API Contract | Yes | **Yes** | strongest of the twelve |
| 11 | ICD | Yes | Yes | HTTP-scoped only |
| 12 | MANIFEST | After 8 edits | Yes | — |

**Three categories — 1, 8 and 9 — would not survive rigorous outside scrutiny in their current form.** Two more, 5 and the Role A gap it shares with 9, are already acknowledged as open. **Category 10, the API Contract Specification, is the strongest deliverable in the set** and is the one to lead with.

---

*End of Audit Report, as amended at Phase 11 (Ruling R13). Both Section 8.7 items are decided; the Category 5 Open Governance Question is explicitly left open. Phase 12 is authorized.*
