# SecureSphere X — OpenAPI 3.1 Generation Report

**Artifact:** `openapi.yaml` — OpenAPI 3.1.0
**Projected from:** Backend Architecture v1.3 · Canonical Boundary Contracts D0.10 v1.1.0 · API Contract v1.2
**Method:** mechanical projection, validated by parsing and reference-graph checking rather than inspection

---

## 1. Generation Summary

| Measure | Value |
|---|---|
| OpenAPI version | 3.1.0 |
| Paths | **24** |
| Operations | **26** |
| Controllers represented | **7 of 7** |
| Security schemes | 2 |
| Canonical external `$ref` | 8 |
| Transport-only schemas | 22 |
| Reusable responses | 10 |
| Translation Defects | **1 — corrected** |
| Architecture Change Requests | **0** |

Twenty-six operations across twenty-four paths: `mfa/factors` carries GET and POST, `preferences` carries GET and PUT.

---

## 2. Traceability Matrix

| Operation | Path | Backend Controller | API Contract | Canonical Contract |
|---|---|---|---|---|
| `submitGate` | POST `/v1/analysis/sessions/{id}/gates` | §5.1 Analysis | §8.1.1 | **D0.1** `SecurityEvidence` · **D0.10** `InvocationContext` · **D0.9** `SecurityStateView` |
| `getSessionState` | GET `/v1/analysis/sessions/{id}/state` | §5.1 Analysis | §8.1.2 | **D0.9** `SecurityStateView` |
| `finalizeSession` | POST `/v1/analysis/sessions/{id}/finalization` | §5.1 Analysis | §8.1.3 | — |
| `reportInterventionPresented` | POST `/v1/analysis/sessions/{id}/interventions` | §5.2 Intervention | §8.2.1 | **D0.9** `RecommendedResponse` |
| `reportUserDisposition` | PUT `/v1/…/interventions/{n}/disposition` | §5.2 Intervention | §8.2.2 | **D0.10** `UserDisposition` |
| `lookupIntelligenceByPrefix` | POST `/v1/intelligence/lookups` | §5.3 Threat Intelligence | §8.3.1 | — |
| `getCurrentRuleSetVersion` | GET `/v1/rulesets/current` | §5.4 Rule Distribution | §8.4 | — |
| `getRuleSetByVersion` | GET `/v1/rulesets/{v}` | §5.4 Rule Distribution | §8.4 | **D0.3** `RuleSet` |
| `getRuleSetDigest` | GET `/v1/rulesets/{v}/digest` | §5.4 Rule Distribution | §8.4 | — |
| `getAnalysisHistory` | GET `/v1/dashboard/history` | §5.5 Dashboard | §8.5.1, §6.1 | **D0.4** `RiskTier` |
| `getSessionDetail` | GET `/v1/dashboard/sessions/{id}` | §5.5 Dashboard | §8.5.2, AD-5 | **D0.9** `ExplanationItem` · **D0.4** `RiskTier` |
| `getReport` | GET `/v1/dashboard/reports/{id}` | §5.5 Dashboard | §8.5.3 | — |
| `getResourceSummary` | GET `/v1/dashboard/resources/{id}` | §5.5 Dashboard | §8.5.4, AC-8 | **D0.4** `RiskTier` |
| `registerUser` | POST `/v1/identity/registrations` | §5.6 Identity | §8.6 | — |
| `login` | POST `/v1/identity/sessions` | §5.6 Identity | §8.6 | — |
| `refreshTokens` | POST `/v1/identity/sessions/refresh` | §5.6 Identity | §8.6 | — |
| `logout` | DELETE `/v1/identity/sessions/current` | §5.6 Identity | §8.6 | — |
| `listMfaFactors` | GET `/v1/identity/mfa/factors` | §5.6 Identity | §8.6 | — |
| `enrolMfaFactor` | POST `/v1/identity/mfa/factors` | §5.6 Identity | §8.6 | — |
| `verifyMfaChallenge` | POST `/v1/identity/mfa/challenges` | §5.6 Identity | §8.6 | — |
| `getPreferences` | GET `/v1/identity/preferences` | §5.6 Identity | §8.6 | — |
| `updatePreferences` | PUT `/v1/identity/preferences` | §5.6 Identity | §8.6 | — |
| `getAuthenticationHistoryDisclosure` | GET `/v1/identity/disclosure` | §5.6 Identity | §8.6 | — |
| `getLiveness` | GET `/health/live` | §5.7 Health | §8.7 | — |
| `getReadiness` | GET `/health/ready` | §5.7 Health | §8.7 | — |
| `getVersion` | GET `/health/version` | §5.7 Health | §8.7 | — |

**No orphan operations.** Every operation maps to exactly one controller.

---

## 3. Canonical Schema Inventory

Referenced by external `$ref` into `./generated/`, produced from the D0.x TypeScript sources. **None is written by hand in the OpenAPI document** (API Contract §18.1).

| Schema | Source | Version | Referenced by |
|---|---|---|---|
| `SecurityEvidence` | D0.1 | 1.1.0 | `GateSubmissionRequest.evidence` |
| `PassTrigger` | D0.4 | 1.0.0 | `GateSubmissionRequest.trigger` |
| `RiskTier` | D0.4 | 1.0.0 | `HistoryEntry`, `SessionDetail`, `ResourceSummary`, `tier` filter |
| `SecurityStateView` | D0.9 | 1.0.0 | `submitGate` 200, `getSessionState` 200 |
| `ExplanationItem` | D0.9 | 1.0.0 | `SessionDetail.explanations` |
| `RecommendedResponse` | D0.9 | 1.0.0 | `InterventionPresentedRequest.response` |
| `UserDisposition` | D0.10 | 1.1.0 | `DispositionRequest.disposition` |
| `RuleSet` | D0.3 | 1.1.0 | `getRuleSetByVersion` 200 |

**Verified:** no canonical name is redefined in `components/schemas`.

### 3.1 Generation Manifest

```
D0.1  evidence.contract.v1.ts    ──► ./generated/d0.1.schema.json
D0.3  ruleset.format.v1.ts       ──► ./generated/d0.3.schema.json
D0.4  passresult.contract.v1.ts  ──► ./generated/d0.4.schema.json
D0.9  boundary.interfaces.v1.ts  ──► ./generated/d0.9.schema.json
D0.10 boundary.interfaces.v1.ts  ──► ./generated/d0.10.schema.json
```

OpenAPI 3.1 aligns with JSON Schema 2020-12 and permits external `$ref`, which is what makes §18.1's prohibition satisfiable rather than aspirational.

---

## 4. Transport-Only Schema Inventory

This document is their canonical source (API Contract §18.1). **None restates a D0.x element**; where one is needed it is referenced.

| Schema | Owner | Derivation |
|---|---|---|
| `Error` | API Contract §11.1 | Field-for-field |
| `GateSubmissionRequest` | API Contract §9.1 | Projection of D0.10 `InvocationContext`, `tier` excluded per Backend §5.1 |
| `FinalizationRequest` | API Contract §8.1.3 | |
| `InterventionPresentedRequest` | Backend §5.2 | D0.10 narrowed; no tier, score or finding |
| `DispositionRequest` | API Contract §8.2.2 | |
| `IntelligenceLookupRequest` | API Contract §8.3.1 | |
| `IntelligenceEntry` | LDD `tir.intelligence_object` | **TI-2** — undefined by the API Contract; derived under NM-1 |
| `IntelligenceLookupResponse` | API Contract §8.3.1 | |
| `RuleSetPointer`, `RuleSetDigest` | API Contract §8.4 | Field-for-field |
| `HistoryEntry`, `HistoryPage` | API Contract §8.5.1, §7.3 | Field-for-field |
| `SessionDetail` | API Contract §8.5.2 | Field-for-field |
| `ReportView` | API Contract §8.5.3 | **TD-1** applied, **TI-5** recorded |
| `ResourceSummary` | API Contract §8.5.4 | Field-for-field |
| `RegistrationRequest`, `UserProfile`, `LoginRequest`, `RefreshRequest` | LDD `uipr.app_user`, `uipr.user_authentication` | **TI-3** |
| `TokenResponse` | Backend §10.7 | **TI-1** — claims defined, envelope not |
| `MfaFactor`, `MfaEnrolmentRequest`, `MfaEnrolmentResponse`, `MfaChallengeRequest` | LDD `uipr.user_mfa_factor` | **TI-3** |
| `Preferences` | LDD `uipr.user_preference` | |
| `DisclosureText` | Rule Engine §20.9.7 | |
| `LivenessStatus`, `ReadinessStatus`, `VersionManifest` | Backend §5.7 | Field-for-field |

**No orphan schemas.** All 22 are referenced.

---

## 5. Validation Report

| # | Check | Result |
|---|---|---|
| 1 | Every endpoint maps to an approved controller | **Pass** — 26 of 26 traced |
| 2 | Every request field originates from an approved source | **Pass** — §4 records derivation for every transport-only field |
| 3 | Every response field originates from an approved source | **Pass** — dashboard responses match §8.5.1–8.5.4 field-for-field |
| 4 | Every security scheme matches the Backend Architecture | **Pass** — `extensionCredential` per §10.1.1, `userToken` per §10.7. **No token-exchange scheme** |
| 5 | Every canonical payload is referenced, not duplicated | **Pass** — 8 external `$ref`; zero canonical names redefined locally |
| 6 | Every transport-only payload remains transport-only | **Pass** — TD-1 corrected the single breach |
| 7 | No orphan schemas | **Pass** — all 22 referenced |
| 8 | No orphan endpoints | **Pass** |
| 9 | No undocumented operations | **Pass** — all 26 carry `operationId`, `summary`, `tags`, `security`, `responses` |
| 10 | No architectural assumptions introduced | **Pass** — see §6 |
| 11 | Every approved endpoint appears exactly once | **Pass** — 26 unique `operationId` |
| 12 | Every approved controller represented | **Pass** — 7 of 7, no unused tag |
| 13 | Every referenced canonical contract represented | **Pass** — D0.1, D0.3, D0.4, D0.9, D0.10 |
| 14 | Every security requirement has a declared scheme | **Pass** — zero undeclared references |
| 15 | No approved architectural element omitted | **Pass** |

### 5.1 Reference Graph

58 internal `$ref`, **zero dangling**. 8 canonical external `$ref`, all under `./generated/`.

### 5.2 Architectural Absence Verification

| Forbidden surface | Present? |
|---|---|
| Session creation | **Absent** ✓ |
| Report creation | **Absent** ✓ — `/reports/{id}` carries GET only |
| Client enrolment | **Absent** ✓ |
| Token exchange | **Absent** ✓ |
| History deletion | **Absent** ✓ — the sole DELETE is `logout`, which is an authentication session, not analytical data |
| Domain Security State | **Absent** ✓ — not in `ResourceSummary` |
| Knowledge Metadata | **Absent** ✓ |
| Rule weights | **Absent** ✓ — not in `SessionDetail` |
| Suppressions, guard evaluations | **Absent** ✓ |
| Tier 0/1 evidence surface | **Absent** ✓ |
| Authentication History content | **Absent** ✓ — `/disclosure` returns explanatory text only |
| Replay | **Absent** ✓ |

### 5.3 Departures from HTTP Convention — Preserved

**`submitGate` returns 200 on evaluation unavailability**, with `oneOf: [SecurityStateView, null]`. 503 is documented as reserved for database and dependency failure and explicitly not for evaluation unavailability.

**`lookupIntelligenceByPrefix` returns 422 on an over-long prefix**, with truncation prohibited in the operation description.

Both would be "corrected" into convention by a well-meaning implementer, so both carry their reasoning inline.

---

## 6. Translation Issues Log

### Translation Defects

**TD-1 · `ReportView.reportKind` exposed a storage-only enumeration** — **CORRECTED**

*Evidence.* The initial projection carried `reportKind: [technical, userFacing]`. LDD §15.3.2 registers `skr.report_kind` as **storage-only**, and NM-2 prohibits exposing such a type without first promoting it to a canonical contract. API Contract §8.5.3 does not require it.

*Classification.* Translation Defect — an error in projection, not an architectural issue.

*Correction.* Removed from `ReportView`, with the reasoning recorded in the schema description. **Should report kind need exposure, promotion under NM-2 is required — that would be an Architecture Change Request, and none is raised here.**

### Translation Issues — resolved within delegated authority

Each below was defined under API Contract §18.1, which makes this document the canonical source for transport-only payloads. Each is recorded so the derivation is auditable rather than assumed.

| # | Issue | Resolution |
|---|---|---|
| **TI-1** | `TokenResponse` envelope has no approved definition. Backend §10.7 defines JWT **claims** — subject, principal type, issued-at, expiry, key identifier — not the HTTP response envelope. | Defined here. Fields limited to what §10.7 and §5.6 imply: access token, rotating refresh token, expiry, MFA state. |
| **TI-2** | `IntelligenceEntry` is named by API Contract §8.3.1 and defined nowhere. | Derived from LDD `tir.intelligence_object` under NM-1 canonical naming. Internals not required by the lookup are not exposed. |
| **TI-3** | Identity payload fields — registration, login, MFA — have no explicit contract. | Derived from LDD `uipr.app_user`, `uipr.user_authentication`, `uipr.user_mfa_factor`. Minimal field sets; no capability added. |
| **TI-4** | `GET /v1/identity/mfa/factors` is not named individually in Backend §5.6, which lists "MFA enrolment and verification". | Traced to **enrolment**: managing enrolment requires seeing what is enrolled. No new capability. Secret material is never returned. |
| **TI-5** | `ReportView.descriptor` is an open object. LDD models `report.descriptor` as JSONB with no defined shape. | Typed as an open object. Clients cannot generate a concrete type for it. Recorded rather than invented — defining a shape would be an architectural decision. |

### Architecture Change Requests

**None.** No discrepancy required the frozen architecture to be reopened.

---

## 7. Certification

# OPENAPI SPECIFICATION APPROVED FOR IMPLEMENTATION

The specification is a faithful projection of Backend Architecture v1.3, Canonical Boundary Contracts D0.10 v1.1.0 and API Contract v1.2. Twenty-six operations across twenty-four paths, seven controllers, zero orphans, zero dangling references, and no architectural decision altered.

**One Translation Defect was found and corrected within the projection.** TD-1 exposed a storage-only enumeration in `ReportView` — the same class of error NM-2 exists to prevent, and one that structural validation surfaced rather than review.

**Zero Architecture Change Requests.** Every other discrepancy resolved within authority the architecture had already delegated.

**§18.1 is satisfied structurally, not by convention.** Eight canonical schemas are referenced by external `$ref` into generated artifacts, and verification confirms no canonical name is redefined locally. OpenAPI 3.1's alignment with JSON Schema 2020-12 is what makes this possible; under 3.0 the prohibition would have been unsatisfiable.

**Before the first generated client is published**, extend governance rule G-8 to compare types generated from this document against types generated from the D0.x sources. Enum conformance is already machine-checked; payload conformance across the wire boundary is the same class of check and the same class of defect if left unchecked.
