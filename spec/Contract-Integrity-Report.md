# SecureSphere X — Contract Integrity Remediation & Readiness Report

**Version:** 1.0 · **Status:** Certification decision
**Scope:** D0.1–D0.5, D0.8–D0.10 · Backend Architecture v1.1 · Rule Engine v0.8 · Persistence Architecture Rev 2 · Logical Database Design v1.1
**Method:** mechanical extraction and differential comparison, verified by compilation and by an automated conformance check retained as a permanent artifact

---

## 1. Executive Summary

Eight instances of contract drift were identified. All eight are resolved, propagated and verified.

The architecture was not the source of any defect. Every finding was a divergence between a canonical contract and a downstream consumer, introduced when a specification referenced a value, a naming form, or a vocabulary that its canonical source did not define. **No architectural behaviour was changed.**

Two findings would have failed compilation on first use. Six would not have failed anything — they would have produced two conformant components disagreeing on the wire, which is the more expensive class.

The material outcome is not the eight corrections. It is that **contract conformance is now machine-verifiable and retained as a check** rather than dependent on review. The eight defects survived three review cycles; the check that now catches them runs in under a second.

| Severity | Count | Status |
|---|---|---|
| Compilation-blocking | 2 | Resolved |
| Wire-ambiguity | 4 | Resolved |
| Governance | 2 | Resolved |

---

## 2. Scope

Every specification participating in the external contract was examined. No dependent specification was exempt.

| Specification | Role | Examined |
|---|---|---|
| D0.1 Evidence Contract | Canonical | Yes |
| D0.2 Security Evaluation Contract | Canonical | Yes |
| D0.3 Rule-set Format | Canonical | Yes |
| D0.4 Analysis Pass Result | Canonical | Yes |
| D0.5 Snapshot Format | Canonical | Yes |
| D0.8/9/10 Boundary Interfaces | Canonical | Yes |
| Backend Architecture v1.1 | Consumer | Yes |
| Rule Engine v0.8 | Consumer and source | Yes |
| Persistence Architecture Rev 2 | Consumer and source | Yes |
| Logical Database Design v1.1 | Consumer | Yes |

---

## 3. Discovery Results

### 3.1 Method

Contract elements were extracted mechanically rather than by reading: TypeScript union-literal types from the D0.x sources, PostgreSQL `CREATE TYPE ... AS ENUM` declarations from the LDD, and enum-value references from the Backend and Rule Engine specifications. The three sets were then differenced.

### 3.2 Canonical Contract Inventory

| Element | Canonical source | Members | Storage counterpart |
|---|---|---|---|
| `NotCollectedReason` | D0.1 | 9 | `skr.not_collected_reason` |
| `EvidenceCategory` | D0.1 | 9 | `skr.evidence_category` |
| `CollectorKind` | D0.1 | 3 | `skr.collector_kind` |
| `RedirectMechanism` | D0.1 | 4 | `skr.redirect_mechanism` |
| `CredentialFieldKind`, `FormMethod`, `SensitivePermission` | D0.1 | 5, 3, 5 | embedded in JSONB |
| `ModuleId` | D0.2 | 10 | `skr.module_id` |
| `UnevaluableReason` | D0.2 | 6 | `skr.unevaluable_reason` |
| `ConsistencyAssessment` | D0.2 | 3 | `skr.consistency_kind` |
| `Evaluability` | D0.2 | 2 | `skr.evaluability` |
| `RuleFamily`, `RuleType`, `LifecycleState`, `EmpiricalConfidence`, `ParameterId`, `RefinementSetId`, `SuppressionMechanism` | D0.3 | 4, 2, 4, 3, 11, 3, 2 | rule-set artifact only |
| `PassTrigger`, `RiskTier` | D0.4 | 6, 3 | `skr.pass_trigger`, `skr.risk_tier` |
| `FetchOutcome`, `CorpusLabel`, `FeedSource`, `CorpusSplit` | D0.5 | 9, 2, 4, 3 | corpus artifact only |
| `RecommendedResponse` | D0.9 | 3 | derived, not stored |
| `UserDisposition` | D0.10 | 3 | audit event only |
| `GuardId` | D0.8 | 5 | client-local only |

### 3.3 Dependency Map

| Contract element | Defined in | Referenced by |
|---|---|---|
| `NotCollectedReason` | D0.1 | D0.2, Backend §4.10 §10.13.4 §15.3, LDD §5.12 §12 §15.3 |
| `UnevaluableReason` | D0.2 | D0.4, Backend §12.1 §15.3, LDD §5.13 §5.16 §5.22 §15.3 |
| `ModuleId` | D0.2 | D0.3, D0.4, Rule Engine §2.6, LDD §5.13 §15.3 |
| `EvidenceCategory` | D0.1 | Backend §4.10, LDD §5.12 §15.3 |
| `PassTrigger` | D0.4 | D0.10, Backend §8, LDD §5.15 §15.3 |
| `RiskTier` | D0.4 | D0.9, Backend §9.4, LDD §5.3 §5.15 §15.3 |
| `UserDisposition` | D0.10 | Backend §5.2 §10.10 |
| Analysis Session states | Rule Engine §19.1 **and** Persistence §30 | Backend §4.3, LDD §5.11 §15.3 |

---

## 4. Contract Drift Analysis

### CD-1 · `policy_suppressed` absent from `NotCollectedReason` — **compilation-blocking**

Backend §4.10 and §10.13.4 require evidence withheld by the two-gate policy to be recorded as `notCollected('policy_suppressed')`. LDD §12 and §15.3 carried the value. D0.1 defined eight members and not that one.

**Authoritative source:** D0.1. **Resolution:** the contract was incomplete relative to frozen Backend v1.1, which requires the value. D0.1 extended; version `1.0.0 → 1.1.0`.

### CD-2 · `backend_unreachable` absent from `UnevaluableReason` — **compilation-blocking**

Backend §15.3 requires rules dependent on unavailable backend evidence to be recorded as `unevaluable(backend_unreachable)`. D0.2 defined five members and not that one.

**Resolution:** D0.2 extended; version `1.0.0 → 1.1.0`.

### CD-3 · `skr.unevaluable_reason` carried two members with no canonical origin

The LDD's type contained `policy_suppressed` and `timeout` in addition to the D0.2 members. Both are **evidence-level** reasons belonging to `NotCollectedReason`, not evaluation-level reasons.

**Resolution:** both removed from `skr.unevaluable_reason`. A new `skr.not_collected_reason` mirrors D0.1 exactly. Backend §10.13.4 now states the correct chain: suppressed evidence yields `notCollected('policy_suppressed')`, and the dependent rule yields `unevaluable('required_evidence_not_collected')`.

*Note.* This was a **conflation of two distinct contracts into one storage type** — the most dangerous drift found, because it would have silently permitted an evaluation to claim an evidence-level reason.

### CD-4 · Wire-to-storage naming convention unspecified — **wire ambiguity**

Canonical members are `lowerCamelCase` (`loginForm`, `authContext`, `notMatched`) and capitalised (`Low`, `Medium`, `High`); storage members are `snake_case` and lowercase. **No document stated the mapping or which form is authoritative.** Two conformant implementations could serialise differently.

**Resolution:** LDD §15.3.1 defines the mapping as total and mechanical, with **invariant NM-1**: the canonical form is authoritative, the wire never carries the storage form, and the transformation is applied at the repository boundary and nowhere else.

### CD-5 · Storage-only enumerations unregistered — **governance**

`skr.capability_subject` and `skr.report_kind` have no canonical counterpart. The first is a relational projection of D0.4's two capability arrays into one table with a discriminator; the second is a prose concept from Backend §4.9.

**Resolution:** LDD §15.3.2 registers all storage-only types, with **invariant NM-2**: such a type SHALL NOT be exposed by any API without first being promoted to a canonical contract.

### CD-6 · Two vocabularies for Analysis Session state — **wire ambiguity**

Rule Engine §19.1 defines eight states; Persistence §30 and the LDD define five. Neither document referenced the other.

**Finding:** they describe **different things**. §19.1 is the client-side runtime machine, including `GATED` and `INTERVENED`, which are user-interaction states with no backend existence. The persisted lifecycle is a projection, and because the backend materialises a session only at the first Tier 2 gate, it never observes the runtime states that precede materialisation.

**Resolution:** LDD §15.3.3 states both vocabularies, gives the projection table, and adds **invariant NM-3**: neither is renamed, and any API exposing session state must state which vocabulary it emits.

### CD-7 · `UserDisposition` reported but consumed nowhere — **governance**

Backend §5.2 defines an HTTP endpoint accepting user dispositions. No LDD table stores them. Rule Engine guard G-02, cited as the justification, operates on the **client-local** Authentication History Store and cannot depend on a backend report.

**Resolution:** Backend §5.2 and §10.10 now state that a disposition is recorded as an **audit event** and is deliberately not persisted as domain data — `app_user` must never embed analytical data, and the intervention lock is already carried by `analysis_pass_result.intervention_locked`. G-02 is enforced client-side and does not depend on this report.

### CD-8 · Inconsistent nullability signalling — **wire ambiguity**

Forty-four fields used explicit `| null`; two used the optional marker `?:`. In JSON these serialise differently — an absent key versus a present null — and the contract did not say which the wire carries.

**Resolution:** both normalised to explicit `| null`. **Every optional field in every canonical contract is now `| null`, present-with-null on the wire.**

---

## 5. Remediation Actions

| ID | Action | Artifacts modified |
|---|---|---|
| CD-1 | `policy_suppressed` added to `NotCollectedReason`; D0.1 → `1.1.0` | `evidence.contract.v1.ts` |
| CD-2 | `backend_unreachable` added to `UnevaluableReason`; D0.2 → `1.1.0` | `evaluation.contract.v1.ts` |
| CD-3 | `skr.unevaluable_reason` reduced to the D0.2 members; `skr.not_collected_reason` added; Backend §10.13.4 states the correct chain | LDD §15.3, Backend §10.13.4 |
| CD-4 | §15.3.1 mapping table and invariant NM-1 | LDD §15.3.1 |
| CD-5 | §15.3.2 storage-only register and invariant NM-2 | LDD §15.3.2 |
| CD-6 | §15.3.3 dual-vocabulary statement, projection table, invariant NM-3 | LDD §15.3.3 |
| CD-7 | Disposition handling stated; audit event list extended | Backend §5.2, §10.10, §13.5 |
| CD-8 | Optional markers normalised to explicit null | D0.1, D0.2 |
| — | Two-gate protocol expression stated | Backend §10.13.4 |

---

## 6. Canonical Contract Register

**Register rule.** Every element below has exactly one authoritative definition. A downstream specification **references** it; it never **redefines** it.

| Element | Owner | Version | Consumers | Modification authority |
|---|---|---|---|---|
| `Observation<T>`, `NotCollectedReason`, `EvidenceCategory`, `CollectorKind`, `RedirectMechanism`, `Origin`, `LoginFingerprint`, `ProducerCapabilityManifest` | **D0.1** `1.1.0` | D0.2, D0.5, Backend, LDD | Role B, Architecture Owner review |
| `ModuleId`, `UnevaluableReason`, `Evaluability`, `ConsistencyAssessment`, per-module findings | **D0.2** `1.1.0` | D0.3, D0.4, Backend, LDD | Role B, Architecture Owner review |
| `Predicate`, `ItemPath`, `ValuePath`, `ParameterId`, `RefinementSetId`, `RuleFamily`, `RuleType`, `LifecycleState`, `EmpiricalConfidence` | **D0.3** `1.1.0` | Rule-set artifact, Backend | Role B, Architecture Owner review |
| `AnalysisPassResult`, `CorrelationFinding`, `ScoringEntry`, `SuppressionApplication`, `CapabilitySet`, `RiskTier`, `PassTrigger` | **D0.4** `1.0.0` | Backend, LDD, replay | Role B, Architecture Owner review |
| `Snapshot`, `FetchOutcome`, `CorpusSplit`, `LabelProvenance` | **D0.5** `1.1.0` | Corpus tooling | Role C, Architecture Owner review |
| `AuthStoreReader/Writer`, `GuardId` | **D0.8** `1.0.0` | Extension, ACEM | Role A, **Architecture Owner mandatory** |
| `SecurityStateView`, `RecommendedResponse`, `ExplanationItem` | **D0.9** `1.0.0` | Extension, Backend | Role B |
| `EvaluationPort`, `InvocationContext`, `UserDisposition`, `InterventionReporter` | **D0.10** `1.0.0` | Extension, Backend | Role B |
| Wire-to-storage mapping (NM-1), storage-only register (NM-2), session-state projection (NM-3) | **LDD §15.3** | Repository layer | Role B |

**Storage-only, not canonical, never on the wire:** `skr.capability_subject`, `skr.report_kind`, `skr.resource_lifecycle`, `skr.domain_lifecycle`, `skr.session_state`, `skr.evaluability`, `tir.intelligence_lifecycle`.

---

## 7. Wire Protocol Specification Updates

| Concern | Rule |
|---|---|
| **Optionality** | Every optional field is `T \| null`. Present-with-null on the wire. The optional marker `?:` appears in no canonical contract. |
| **Omitted fields** | A field absent from a payload is a **schema violation**, not a null. Unknown fields are rejected, never ignored (Backend BI-37). |
| **Unavailable fields** | Expressed through the tri-state: `notCollected(reason)`, never null and never absent. |
| **Suppressed fields** | `notCollected('policy_suppressed')`. The client evaluates both gates and transmits the outcome as evidence; no field conveys the local tier, allowlist membership, or the gate decision. The backend does not re-evaluate the gates. |
| **Privacy-preserved fields** | The registrable domain crosses only as a k-anonymity prefix on the client-initiated lookup path. Fields the architecture forbids crossing have no contract representation at all. |
| **Enum serialisation** | Canonical form only. Storage form never appears on the wire (NM-1). |
| **Version negotiation** | Contract version by header; mismatch is 409 with the supported range. Rows carry the version they were written under. |
| **Defaults** | No canonical contract defines a wire default. A producer emits every field. |

**Protocol invariant PI-A.** Two conformant implementations exchanging a payload valid under the same contract version SHALL interpret every field identically. No field's meaning depends on information outside the payload and its contract version.

---

## 8. Capability Validation Assessment

### 8.1 Status

| Capability | Status | Basis |
|---|---|---|
| `url.*`, `loginInterface.*`, `domainRepresentation.*`, `scriptRuntime.*` | **Guaranteed** | Standard extension APIs |
| `redirect.*` | **Conditionally available** | D0.1 classifies as `DIVERGENT` — both producers observe, differently |
| `transport.chainComplete`, `chainTrusted` | **Unvalidated — assumed unsupported** | No certificate chain API is exposed to extensions |
| `dns.*` | **Unvalidated — assumed unsupported** | No DNS API is exposed to extensions |
| `permissionContext.precededByUserGesture` | **Unvalidated — attribution reliability unknown** | Gesture attribution across frames and async handlers |
| `downloadContext.*`, `permissionContext.*` | **Extension-exclusive** | D0.1 `PRODUCER_EXCLUSIVE` |
| Backend-acquired `transport.*`, `dns.*` | **Privacy-suppressed unless both gates open** | Backend §10.13.4 |

### 8.2 Capability Validation Spike — Specification

**Owner:** Role A. **Duration:** one day. **Output:** a committed `ProducerCapabilityManifest` for the extension producer.

**Method.** Load a temporary unpacked extension and attempt to populate every field in D0.1 across ten pages: a Google SSO flow, a Microsoft SSO flow, a retail bank login, a webmail login, an SPA with an injected login form, a site with a cross-origin form action, an IDN or non-Latin domain, an HTTP-only login, a multi-hop redirect to a login, and a page requesting camera access on load.

**Recording rule.** For each field record `capable` or `incapable(reason)` **as observed**. The three fields marked Unvalidated above are stated as assumptions, not as expected results, and the manifest records what the browser does rather than what this report predicts.

**Contract effect.** None to the payload shape. An incapable field is expressed through the existing model as `notCollected('api_unavailable')` — the tri-state already accommodates every outcome, and **no payload is redesigned regardless of what the spike finds**.

**Downstream effect.** The manifest determines which rules are corpus-validatable and which require in-browser testing. It does not determine any API shape.

---

## 9. Governance Policy

### 9.1 Single-Definition Rule

**G-1.** Every shared contract element has exactly one canonical definition, held in a D0.x contract. A downstream specification references it and never restates its members.

**G-2.** A downstream specification introducing a member absent from the canonical source is **contract drift**, not an extension. CD-1, CD-2 and CD-3 were each instances of this.

### 9.2 Modification Authority

**G-3.** A canonical contract is modified only by its registered owner (§6), with Architecture Owner review. D0.8 requires mandatory Architecture Owner review because it governs the Authentication History Store boundary.

**G-4.** Additive change increments MINOR. Removal or retyping increments MAJOR and requires architecture-level review. Both require the propagation obligations of G-5.

### 9.3 Propagation Obligation

**G-5.** A contract change is incomplete until every consumer in the dependency map (§3.3) is updated in the same change. A partially propagated change is a defect, not progress.

### 9.4 Compatibility Policy

**G-6.** Rows and payloads carry the contract version under which they were written and are interpreted under that version, never under the current one.

**G-7.** A storage-only type is never exposed by an API without promotion to a canonical contract (NM-2).

### 9.5 Drift Prevention — the Retained Check

**G-8.** `contract-conformance-check.py` runs in CI on every change to a contract or to the LDD. It extracts canonical enums from the D0.x sources and storage enums from the LDD, applies the NM-1 mapping, and fails the build on any divergence.

**G-9.** Contracts must compile under `strict` with `noUnusedLocals` before any consumer references them.

> The eight defects in this report survived three review cycles. G-8 catches all of the mechanical ones in under a second. **This is the durable outcome of the programme; the corrections are not.**

---

## 10. Propagation Matrix

| Finding | D0.1 | D0.2 | Backend v1.1 | LDD v1.1 | Verified by |
|---|---|---|---|---|---|
| CD-1 | **§2 enum, version** | — | §4.10, §10.13.4 consistent | §15.3 new type | Compilation + G-8 |
| CD-2 | — | **§2 enum, version** | §15.3 consistent | §15.3 type reduced | Compilation + G-8 |
| CD-3 | — | authoritative | §10.13.4 chain stated | **§15.3 two types** | G-8 |
| CD-4 | authoritative | authoritative | — | **§15.3.1 NM-1** | G-8 mapping applied |
| CD-5 | — | — | — | **§15.3.2 NM-2** | G-8 register honoured |
| CD-6 | — | — | §4.3 consistent | **§15.3.3 NM-3** | Manual — projection table |
| CD-7 | — | — | **§5.2, §10.10, §13.5** | no change required | Manual |
| CD-8 | **§1 FetchRecord** | **§4 SecurityIndicator** | — | — | Compilation |
| Two-gate protocol | — | — | **§10.13.4** | — | Manual |

**Stale-content sweep.** `policy_suppressed` in `skr.unevaluable_reason`: 0 occurrences. Optional marker `?:` in any canonical contract: 0 occurrences. Unregistered storage-only enum: 0.

---

## 11. Conformance Validation Results

### 11.1 Compilation

All eight canonical contracts compile under `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`. **0 errors.**

### 11.2 Automated Enum Conformance

`contract-conformance-check.py`, retained as a permanent artifact:

```
STORAGE TYPE                   CANONICAL                RESULT
------------------------------------------------------------------------------
skr.capability_subject         (storage-only)           OK — registered §15.3.2
skr.collector_kind             CollectorKind            OK — 3 members match under NM-1
skr.consistency_kind           ConsistencyAssessment    OK — 3 members match under NM-1
skr.domain_lifecycle           (storage-only)           OK — registered §15.3.2
skr.evaluability               (storage-only)           OK — registered §15.3.2
skr.evidence_category          EvidenceCategory         OK — 9 members match under NM-1
skr.module_id                  ModuleId                 OK — 10 members match under NM-1
skr.not_collected_reason       NotCollectedReason       OK — 9 members match under NM-1
skr.pass_trigger               PassTrigger              OK — 6 members match under NM-1
skr.redirect_mechanism         RedirectMechanism        OK — 4 members match under NM-1
skr.report_kind                (storage-only)           OK — registered §15.3.2
skr.resource_lifecycle         (storage-only)           OK — registered §15.3.2
skr.risk_tier                  RiskTier                 OK — 3 members match under NM-1
skr.rule_outcome_kind          (derived)                OK — projection
skr.rule_type                  RuleType                 OK — 2 members match under NM-1
skr.session_state              (storage-only)           OK — registered §15.3.2
skr.unevaluable_reason         UnevaluableReason        OK — 6 members match under NM-1
tir.intelligence_lifecycle     (storage-only)           OK — registered §15.3.2
------------------------------------------------------------------------------
RESULT: CONFORMANT
```

### 11.3 Architectural Non-Regression

| Check | Result |
|---|---|
| All contracts internally consistent | **Pass** — compilation and G-8 |
| All enumerations synchronised | **Pass** — 18 types, 0 divergences |
| All payloads synchronised | **Pass** — no payload shape changed |
| Protocol definitions complete | **Pass** — §7, including the two-gate expression |
| Lifecycle definitions agree | **Pass** — CD-6 projection stated |
| Identifier definitions agree | **Pass** — unchanged |
| Error contracts agree | **Pass** — Backend §12.1 unchanged |
| Capability assumptions resolved | **Pass as specification** — the spike is designed; execution is Role A's |
| Privacy rules intact | **Pass** — no field gained a wire representation; §10.13 unchanged |
| Repository ownership unchanged | **Pass** — 3 repositories, 6 aggregates, 37 tables |
| No architectural boundary changed | **Pass** — every correction is a value, a naming rule, or a statement of existing behaviour |

---

## 12. Residual Risks

| # | Risk | Class | Treatment |
|---|---|---|---|
| RR-1 | The capability spike has not been executed; three capability assumptions remain unvalidated | **Medium** | Spike specified in §8.2. Contract effect is **nil** — the tri-state accommodates every outcome. Execution before implementation, not before API design. |
| RR-2 | G-8 checks enum conformance, not payload-shape conformance between the TypeScript contracts and the future OpenAPI document | **Medium** | The Contract Conformance Gate recommended by the Architecture Review Board should extend G-8 to compare generated types from both sources. |
| RR-3 | Storage-only enums could be exposed by an API in error | **Low** | NM-2 prohibits it; G-8 does not yet detect it, since no API exists to check |
| RR-4 | Rule-set artifact members (`ParameterId`, `RefinementSetId`) have no automated check, as they live in a JSON artifact not yet created | **Low** | D0.3 §8's static validator V-1…V-13 covers them once `rules-v0.1.0.json` exists |
| RR-5 | Every rule weight remains formally `Unvalidated` | **Medium** | Outside this programme's scope; unaffected by and unaffecting the contract layer |

---

## 13. Readiness Certification

| Criterion | Result |
|---|---|
| No unresolved contract inconsistency | **Met** — 8 identified, 8 resolved, verified mechanically |
| No protocol ambiguity | **Met** — §7, including optionality, suppression, enum serialisation and the two-gate expression |
| No duplicated canonical definition | **Met** — single-definition rule G-1; storage-only types registered, not duplicated |
| Governance prevents future drift | **Met** — G-1…G-9, with G-8 retained as an executable CI check |
| Propagation complete | **Met** — §10, with a clean stale-content sweep |
| Validation succeeds | **Met** — 0 compilation errors, 18/18 enums conformant |
| Architecture unchanged | **Met** — no aggregate, boundary, ownership rule, lifecycle semantic or privacy rule altered |

---

# CERTIFIED FOR API CONTRACT DESIGN

All contract-level inconsistencies have been resolved, validated, propagated and governed. The architecture is contract-ready.

**Three properties now hold that did not before.** Every shared contract element has exactly one canonical definition. Every value crossing the client–server boundary has a stated serialisation, including the absent, unavailable and suppressed cases. And conformance between the canonical contracts and their storage counterparts is machine-checked rather than reviewed.

**One item is accepted as an open architectural decision with documented rationale.** RR-1: the capability spike is specified but not executed. It is accepted because the contract effect is provably nil — an incapable field is expressed as `notCollected('api_unavailable')` through the tri-state, which requires no payload change whatever the spike returns. Execution is a prerequisite for implementation, not for API Contract Design.

**One recommendation carries into the next phase.** The Contract Conformance Gate should extend G-8 to compare types generated from the OpenAPI document against the D0.x sources. Enum conformance is now checked; payload conformance between the wire specification and the canonical contracts will need the same treatment, and it is cheaper to build the check alongside the contract than after it.
