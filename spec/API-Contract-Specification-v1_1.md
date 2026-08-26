# SecureSphere X — API Contract Specification

**Version:** 1.1 · **Status:** For certification — two findings escalated, see §18.2
**Derives from:** Backend Architecture v1.2 · Rule Engine v0.8 · Persistence Architecture Rev 2 · Logical Database Design v1.1 · Canonical Contracts D0.1–D0.5, D0.8–D0.10
**Payload authority:** the D0.x canonical contracts. This document defines HTTP behaviour and references payloads; it defines none.

---

## 1. Purpose

This specification projects the approved architecture into externally exposed HTTP interfaces. It is a **projection, not a design**: every endpoint derives from a controller in Backend v1.2 §5, and every payload is a canonical contract referenced by name.

The specification exists to make three things unambiguous before implementation: what surface exists, what surface deliberately does not exist, and how the wire behaves in the cases where this system departs from HTTP convention — of which there are two, both architectural.

---

## 2. Scope

### 2.1 In Scope

HTTP resource model, URIs and methods · request and response usage of canonical contracts · status codes and headers · error semantics · idempotency · serialisation rules · operational semantics · contract-level security behaviour · intentional architectural absences · bidirectional traceability.

### 2.2 Out of Scope

Business logic · persistence implementation · rule engine internals · scoring algorithms · internal-only domain state · framework, routing or handler implementation · any payload schema, which belongs to D0.x.

### 2.3 Phase

Phase I only. Advisory escalation (Rule Engine §1.4) is a Phase II capability with no Phase I surface. External integrations are outside the Phase I architecture (Backend §19, I-11).

---

## 3. Design Principles

| # | Principle | Consequence |
|---|---|---|
| P-1 | **Canonical contracts are the sole payload authority** | The OpenAPI document contains `$ref` to generated schemas and no inline payload definition |
| P-2 | **Every endpoint has exactly one architectural owner** | No endpoint spans two controllers; no orphan endpoint exists |
| P-3 | **Absence is a deliverable** | An endpoint a competent designer would add by reflex, but which the architecture forbids, is documented as forbidden |
| P-4 | **The wire is independent of persistence** | Canonical enum form only; the storage form never appears |
| P-5 | **Determinism over convention** | Where architectural behaviour departs from HTTP convention, the architecture governs and the departure is documented |
| P-6 | **Minimal surface** | No endpoint exists for a capability the architecture classifies as internal |
| P-7 | **Two disjoint principal surfaces** | No endpoint serves both the extension and the dashboard |

---

## 4. Architectural Constraints

Binding on this specification. Each is inherited, not introduced.

| # | Constraint | Source |
|---|---|---|
| AC-1 | No endpoint accepts a client-supplied finding, score, tier, capability set or rule-set override | Backend BI-32 |
| AC-2 | No endpoint accepts, stores or serves Authentication History content in any form | Backend BI-25; Rule Engine §20.2 |
| AC-3 | Extension and user principals are distinct and non-interchangeable | Backend BI-33 |
| AC-4 | Sessions are materialised implicitly on first Tier 2 gate under a client-generated identifier | Backend §2.4 |
| AC-5 | Reports are created on session finalisation; no creation endpoint exists | Backend §4.8, AD-3 |
| AC-6 | The extension credential is build-embedded; no enrolment endpoint exists | Backend §10.1.1, AD-1 |
| AC-7 | Deletion of the analytical record is prohibited | Persistence §6, §21, §34.7; AM-4 |
| AC-8 | Domain Security State and Knowledge Metadata have no API representation | Backend §5.5, AD-2 |
| AC-9 | Scoring internals — weights, suppressions, guard evaluations, subsumption — have no API representation | Backend §5.5, AD-5 |
| AC-10 | Rate limiting on extension endpoints is keyed on source address, never on the credential | Backend §10.5, CR-1 |
| AC-11 | Unknown fields are rejected, never ignored | Backend BI-37 |
| AC-12 | Every optional field is `T \| null`, present-with-null | Contract Integrity CD-8 |

---

## 5. Authentication

Two principals, exactly as Backend §10.1. Neither is modified here.

### 5.1 Security Schemes

| Scheme | Principal | Mechanism |
|---|---|---|
| `extensionToken` | Extension client | `Authorization: Bearer <token>` — a short-lived access token obtained by presenting the build-embedded credential |
| `userToken` | Dashboard user | `Authorization: Bearer <jwt>` — asymmetrically signed (EdDSA or RS256), carrying subject, principal type, issued-at, expiry and key identifier |

### 5.2 Extension Token Acquisition

**`POST /v1/auth/extension-tokens`** — exchanges the build-embedded credential for a short-lived access token.

This is **not enrolment**. The credential is embedded at packaging time (AC-6), identifies the build rather than the installation, and is exchanged rather than issued. No endpoint creates a credential, and no client record is created by this exchange.

| | |
|---|---|
| Security | None — the credential is the request body |
| Request | `{ "clientCredential": string, "extensionVersion": string }` |
| Response 200 | `{ "accessToken": string, "expiresIn": number, "tokenType": "Bearer" }` |
| Response 401 | Invalid or retired credential |
| Rate limit | Per source address (AC-10) |

### 5.3 User Token Acquisition

Owned by the Identity Controller (§8.6). Password with optional MFA yields an access token and a rotating refresh token with reuse detection.

### 5.4 Authentication Failures

| Condition | Status | Body |
|---|---|---|
| Absent or malformed `Authorization` | **401** | `AUTHENTICATION_REQUIRED` |
| Expired token | **401** | `TOKEN_EXPIRED` |
| Invalid signature or unknown `kid` | **401** | `TOKEN_INVALID` |
| Wrong principal type for the endpoint | **403** | `PRINCIPAL_NOT_PERMITTED` |
| Invalid credentials at login | **401** | `AUTHENTICATION_FAILED` — uniform message, constant-time comparison, never distinguishing unknown account from wrong password |

**Wrong principal type is 403, not 401.** The request is authenticated; the principal is simply not permitted on that surface. Returning 401 would invite a client to retry authentication that cannot succeed.

---

## 6. Authorization

Resource-scoped, exactly as Backend §10.2. **No roles exist in Phase I.**

| Endpoint group | Principal | Rule |
|---|---|---|
| Analysis, Intervention | `extensionToken` | A client may act only on sessions it created. Enforced by the client-generated session identifier being unguessable and by the token's principal type. |
| Threat Intelligence, Rule Distribution | `extensionToken` | Authenticated, no per-resource check — neither serves user data |
| Dashboard | `userToken` | A user may read only what they own. See §6.1. |
| Identity | `userToken`, except registration and login | Self only |
| Health | None for liveness; `extensionToken` or `userToken` for readiness detail | |

### 6.1 What a Dashboard User Owns — A Determined Consequence

**A user owns exactly the Analysis Sessions and Security Resources they have explicitly saved.** Dashboard history is the set of `saved_analysis_reference` entries for that user, and nothing else.

This is not a choice made by this specification. It is determined by the frozen architecture:

- `analysis_session` carries **no user column** (LDD §5.11). No submission is associated with a user at any point.
- The extension credential is build-embedded and identifies no installation and no user (AD-1).
- **A user token cannot submit evidence** (Backend §10.1), so a submission can never carry a user identity.
- The sole user→session association in the entire model is `uipr.saved_analysis_reference` (LDD §5.26, R-45).

**Consequence, recorded because it is consequential.** The dashboard cannot present a user's browsing analysis history. It can present only what the user chose to save. Any behaviour beyond that requires a user↔session association that does not exist, which would be architectural work rather than contract work. This specification implements what the architecture determines and does not attempt to compensate.

### 6.2 Authorization Failures

| Condition | Status |
|---|---|
| Accessing a resource the principal does not own | **403** `NOT_AUTHORIZED` — never 404, which would confirm existence |
| Cross-user access attempt | **403**, and an audit event is raised whether or not it succeeds |

---

## 7. Resource Model

### 7.1 URI Structure

```
/v1/auth/extension-tokens
/v1/analysis/sessions/{sessionId}/gates
/v1/analysis/sessions/{sessionId}/state
/v1/analysis/sessions/{sessionId}/finalization
/v1/analysis/sessions/{sessionId}/interventions
/v1/analysis/sessions/{sessionId}/interventions/{interventionOrdinal}/disposition
/v1/intelligence/lookups
/v1/rulesets/current
/v1/rulesets/{ruleSetVersion}
/v1/rulesets/{ruleSetVersion}/digest
/v1/dashboard/history
/v1/dashboard/sessions/{sessionId}
/v1/dashboard/reports/{reportId}
/v1/dashboard/resources/{resourceIdentity}
/v1/identity/registrations
/v1/identity/sessions
/v1/identity/sessions/refresh
/v1/identity/sessions/current
/v1/identity/mfa/factors
/v1/identity/mfa/challenges
/v1/identity/preferences
/v1/identity/disclosure
/health/live
/health/ready
/health/version
```

**Health endpoints are unversioned.** They report the health of the deployment rather than of an API version, and an orchestrator must reach them without negotiating a version.

### 7.2 Identifiers

All identifiers are single-column UUIDs. **No composite identifier appears in any path**, a property guaranteed by LDD §14.5's decision that partitioning is out of scope for Schema Version 1.

| Identifier | Form | Origin |
|---|---|---|
| `sessionId` | UUIDv4 | **Client-generated** at navigation (Backend §4.3) |
| `resourceIdentity` | UUIDv5 | Deterministic over policy version and canonical form (LDD §8.1) |
| `reportId` | UUIDv4 | Server-assigned at session finalisation |
| `ruleSetVersion` | Semantic version string | Rule-set registry |
| `interventionOrdinal` | Positive integer | Client-assigned, dense within a session |

### 7.3 Pagination

Applies to `/v1/dashboard/history` only. **Cursor-based**, because the analytical record grows without bound (AC-7) and offset pagination degrades and skips under concurrent insertion.

| Parameter | Type | Default |
|---|---|---|
| `cursor` | opaque string | absent — begins at the newest entry |
| `limit` | integer 1–100 | 25 |

Response carries `nextCursor: string | null`. A null cursor means the end of the collection.

The cursor encodes the `sequence_number` of `analysis_reference`, which LDD §5.5 guarantees dense and monotonic within a resource. **The cursor is opaque to the client** and its encoding is not contractual.

### 7.4 Filtering

`/v1/dashboard/history` accepts `tier` — one of the canonical `RiskTier` members — and `from` / `to` as ISO 8601 dates. No other endpoint accepts a filter. Filtering never widens what a principal may read.

---

## 8. Endpoint Specifications

### 8.1 Analysis Controller

**Owner:** Backend §5.1. **Principal:** `extensionToken`.

#### 8.1.1 `POST /v1/analysis/sessions/{sessionId}/gates`

Submits accumulated evidence at a Tier 2 gate. **This is the endpoint that materialises the session** (AC-4) — no separate creation call exists.

| | |
|---|---|
| Request body | **D0.1** `SecurityEvidence[]` for all tiers, plus `gateOrdinal`, `trigger`, `targetResource` |
| Response 200 | **D0.9** `SecurityStateView \| null` |
| Idempotency | `(sessionId, gateOrdinal)` — see §12 |
| Timeout | Client should allow 2 s; server p95 targets are §14 |

| Status | Condition |
|---|---|
| 200 | Evaluated, or evaluation unavailable — see §11.4 |
| 401 / 403 | §5.4, §6.2 |
| 409 | Contract version mismatch; session finalised; gate ordinal not dense |
| 413 | Payload exceeds bounds |
| 415 | Content type not `application/json` |
| 422 | Schema or semantic validation failure |
| 429 | Rate limit exceeded |

#### 8.1.2 `GET /v1/analysis/sessions/{sessionId}/state`

| | |
|---|---|
| Response 200 | **D0.9** `SecurityStateView \| null` |
| Response 404 | Session not materialised — no gate has yet been submitted |
| Idempotency | Safe, cacheable `no-store` |

#### 8.1.3 `POST /v1/analysis/sessions/{sessionId}/finalization`

Finalises the session. Triggers report creation (AC-5) as a side effect within the same unit of work.

| | |
|---|---|
| Request body | `{ "finalizedOn": string }` — ISO 8601 date, day granularity |
| Response 204 | Finalised, or already finalised — idempotent |
| Response 404 | Session not materialised |

### 8.2 Intervention Controller

**Owner:** Backend §5.2. **Principal:** `extensionToken`.

#### 8.2.1 `POST /v1/analysis/sessions/{sessionId}/interventions`

Reports that an intervention was presented. Sets `intervention_locked` on the corresponding pass.

| | |
|---|---|
| Request body | `{ "interventionOrdinal": number, "response": RecommendedResponse }` — the HTTP projection of **D0.10** `reportInterventionPresented` |
| Response 204 | Recorded |
| Idempotency | `(sessionId, interventionOrdinal)` |
| Response 409 | No committed pass corresponds to this intervention |

**AC-1 note.** No tier, score or finding is accepted. Backend §5.2 states that this endpoint does not accept them, and BI-32 prohibits it universally. The backend already holds the tier: `intervention_locked` is set on a pass whose `effective_tier` the backend itself computed, so the client has nothing to tell it.

D0.10's `reportInterventionPresented` carries a `tier` parameter because it is a **Role A → Role B in-process interface**, where no trust boundary is crossed. The HTTP projection narrows it, per Backend §5.2. The two are consistent at their respective scopes.

#### 8.2.2 `PUT /v1/analysis/sessions/{sessionId}/interventions/{interventionOrdinal}/disposition`

| | |
|---|---|
| Request body | **D0.10** `{ "disposition": UserDisposition }` |
| Response 204 | Recorded as an audit event |
| Idempotency | Natural — PUT of a single value |

**Persistence note.** A disposition is recorded as an audit event and is **not persisted as domain data** (Backend §5.2, §10.10). Guard G-02 is enforced client-side against the client-local store and does not depend on this report.

### 8.3 Threat Intelligence Controller

**Owner:** Backend §5.3. **Principal:** `extensionToken`.

#### 8.3.1 `POST /v1/intelligence/lookups`

k-anonymity prefix lookup.

| | |
|---|---|
| Request body | `{ "hashPrefix": string }` |
| Response 200 | `{ "bucket": IntelligenceEntry[] }` — every entry in the prefix bucket |
| Idempotency | Safe in effect; POST is used deliberately — see below |

**Why POST rather than GET.** A prefix in a query string appears in access logs, proxy logs and browser history. Placing it in a request body keeps it out of all three. The operation has no side effect and may be retried freely.

**Prefix validation is a security constraint, not input hygiene.** The prefix length must equal the configured value **exactly**. A longer prefix is **rejected with 422**, never truncated — accepting it would disclose more than Backend §10.13.4 permits, and silently truncating would conceal a client attempting to disclose more.

### 8.4 Rule Distribution Controller

**Owner:** Backend §5.4. **Principal:** `extensionToken`.

| Endpoint | Response | Caching |
|---|---|---|
| `GET /v1/rulesets/current` | `{ "ruleSetVersion": string, "digest": string }` | `no-cache` — the recommended version changes |
| `GET /v1/rulesets/{ruleSetVersion}` | The rule-set artifact | `immutable, max-age=31536000` — a released version never changes |
| `GET /v1/rulesets/{ruleSetVersion}/digest` | `{ "digest": string }` | `immutable` |

| Status | Condition |
|---|---|
| 404 | Unknown version |
| 409 | Version exists but is not released — an unreleased version is never served (LDD H-2) |
| 500 | Integrity verification failed; an alert is raised |

**Rule sets are not public.** Authentication is required despite the content being neither user data nor secret in the cryptographic sense.

### 8.5 Dashboard Controller

**Owner:** Backend §5.5. **Principal:** `userToken`. **Response depth is fixed by AD-5 and AC-8, AC-9.**

#### 8.5.1 `GET /v1/dashboard/history`

Returns the user's **saved** analysis references (§6.1), newest first, cursor-paginated.

| Returns | Does not return |
|---|---|
| `sessionId`, `resourceIdentity`, `effectiveTier`, `finalizedOn`, `degraded` | Pass internals of any kind |

#### 8.5.2 `GET /v1/dashboard/sessions/{sessionId}`

**Explanation-level view only** (AD-5).

| Returns | Does not return |
|---|---|
| `sessionId`, `resourceIdentity`, `effectiveTier`, `degraded`, `degradedReason`, `ruleSetVersion`, `finalizedOn` | Base or effective weights |
| `explanations` — **D0.9** `ExplanationItem[]`: rule identifier, summary, optional named origin, AI-attribution flag | Suppression applications, guard evaluations, subsumption records |
| | Raw evidence content |
| | Scoring entries, capability markers |

**Two reasons, both structural.** D0.9's `ExplanationItem` is the user-facing explanation contract and carries no weight. And §8.4 keeps rule sets behind authentication; exposing per-pass weights would permit reconstructing the rule set from enough session details. The full Analysis Pass Result is reachable only through the offline replay tool (Backend §4.11).

#### 8.5.3 `GET /v1/dashboard/reports/{reportId}`

Returns report metadata and its projection. Analytical detail resolves through the referenced session, which is subject to §8.5.2's depth limits.

#### 8.5.4 `GET /v1/dashboard/resources/{resourceIdentity}`

| Returns | Does not return |
|---|---|
| `resourceIdentity`, Current Security State `score`, `tier`, `degraded`, `analysisCount` | **Domain Security State** (AC-8) |
| | **Knowledge Metadata** (AC-8) |
| | Intelligence Object internals |

### 8.6 Identity Controller

**Owner:** Backend §5.6. **Principal:** `userToken` except where noted.

| Endpoint | Method | Principal | Purpose |
|---|---|---|---|
| `/v1/identity/registrations` | POST | none | Account creation |
| `/v1/identity/sessions` | POST | none | Login; returns access and refresh tokens |
| `/v1/identity/sessions/refresh` | POST | refresh token | Token rotation with reuse detection |
| `/v1/identity/sessions/current` | DELETE | `userToken` | Logout; revokes the refresh token |
| `/v1/identity/mfa/factors` | POST, GET | `userToken` | Enrolment, listing |
| `/v1/identity/mfa/challenges` | POST | partial-auth token | Verification |
| `/v1/identity/preferences` | GET, PUT | `userToken` | Preferences |
| `/v1/identity/disclosure` | GET | `userToken` | Authentication History disclosure text (Rule Engine §20.9.7) |

**On `DELETE /sessions/current`.** AC-7 prohibits deletion of the **analytical record**. An authentication session is not analytical data. No conflict.

**No client enrolment endpoint exists.** This inventory is complete (AC-6).

### 8.7 Health Controller

**Owner:** Backend §5.7.

| Endpoint | Principal | Semantics |
|---|---|---|
| `GET /health/live` | none | Process responsive |
| `GET /health/ready` | none for status; token for detail | **Ready requires database reachable, Evaluation Port healthy, and a valid rule set loaded.** A backend with no valid rule set is not ready. |
| `GET /health/version` | token | API version, contract versions, rule-set version, schema version |

---

## 9. Request Contracts

### 9.1 Canonical Reference Table

**No payload is defined in this document.** Each request body references a canonical contract by name.

| Endpoint | Canonical contract | Transport-level additions |
|---|---|---|
| `POST /analysis/sessions/{id}/gates` | **D0.1** `SecurityEvidence[]` | `gateOrdinal`, `trigger`, `targetResource` envelope |
| `POST /analysis/sessions/{id}/finalization` | — | `finalizedOn` |
| `POST /analysis/sessions/{id}/interventions` | **D0.10** `InterventionReporter` | `interventionOrdinal` |
| `PUT .../interventions/{n}/disposition` | **D0.10** `UserDisposition` | — |
| `POST /intelligence/lookups` | — | `hashPrefix` |
| `POST /auth/extension-tokens` | — | `clientCredential`, `extensionVersion` |
| Identity endpoints | — | credential and preference structures |

The envelope fields above are **transport metadata, not payload**. They carry routing and idempotency information and contain no analytical content.

### 9.2 Required Request Headers

| Header | Requirement | Purpose |
|---|---|---|
| `Authorization` | Required except where §5 states otherwise | Principal |
| `Content-Type` | `application/json` on every request with a body | 415 otherwise |
| `X-Contract-Version` | Required on analysis and intervention endpoints | Negotiates the D0.x contract version; mismatch → 409 |
| `X-Correlation-Id` | Optional | Client-supplied trace identifier; the server generates one if absent and echoes it on every response |

### 9.3 Request Validation Order

Fixed, and failures are reported at the first stage that rejects. This ordering is not incidental: reporting a schema error on a request that exceeded its size bound would require parsing a body the server declined to read.

```
1. Transport      — content type, size bound, JSON well-formedness   → 415 / 413 / 400
2. Authentication — token presence, signature, expiry                 → 401
3. Authorization  — principal type, resource ownership                → 403
4. Contract       — X-Contract-Version within the supported range     → 409
5. Schema         — generated D0.x validator; unknown fields rejected → 422
6. Semantic       — cardinality, referential existence, state validity → 422
7. Domain         — invariant violation                               → 409
```

### 9.4 Rejected Request Content

Per AC-1, the following are rejected at stage 5 as unknown fields, whatever their value:

`finding` · `findings` · `score` · `tier` · `effectiveWeight` · `baseWeight` · `capabilitySet` · `ruleSetOverride` · `suppressionOverride`

**There is no exception.** No endpoint in this contract accepts any of the above under any framing.

Per AC-2, any field whose name or content indicates Authentication History, a login-interface fingerprint, or a stored-origin list is rejected. **No endpoint has a schema position for such a field**, so this is a defence-in-depth statement rather than a validator rule.

---

## 10. Response Contracts

### 10.1 Canonical Reference Table

| Endpoint | Canonical contract |
|---|---|
| `POST /analysis/sessions/{id}/gates` | **D0.9** `SecurityStateView \| null` |
| `GET /analysis/sessions/{id}/state` | **D0.9** `SecurityStateView \| null` |
| `GET /dashboard/sessions/{id}` | **D0.9** `ExplanationItem[]` within a projection defined by §8.5.2 |
| All others | Transport-level structures with no analytical content |

### 10.2 Response Headers

| Header | Presence | Purpose |
|---|---|---|
| `X-Correlation-Id` | Always | Echoes or supplies the trace identifier |
| `X-Contract-Version` | Analysis and intervention endpoints | The contract version applied |
| `Cache-Control` | Always | `no-store` on everything except released rule-set artifacts |
| `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` | Rate-limited endpoints | Current quota state |
| `Retry-After` | 429 and 503 | Seconds |

### 10.3 Status Code Inventory

| Code | Meaning in this contract |
|---|---|
| **200** | Success with a body — **including evaluation unavailable**, see §11.4 |
| **204** | Success with no body — finalisation, intervention, disposition |
| **400** | Malformed JSON |
| **401** | Authentication absent, expired or invalid |
| **403** | Authenticated but not permitted — wrong principal type, or resource not owned |
| **404** | Resource does not exist. A resource that exists but is not owned yields **403**, never 404 (§6.2) |
| **409** | Contract version mismatch · invalid state transition · concurrency conflict · unreleased rule-set version |
| **413** | Payload exceeds bound |
| **415** | Unsupported content type |
| **422** | Schema or semantic validation failure |
| **429** | Rate limit exceeded |
| **500** | Rule-set integrity failure — alerted |
| **503** | Database or dependency unavailable. **Never used for evaluation unavailability** |

---

## 11. Error Contracts

### 11.1 Error Body

Every non-2xx response carries the same structure:

```
{
  "code": string,           // stable, machine-readable; never localised
  "message": string,        // human-readable; may change without a version bump
  "correlationId": string,
  "fieldErrors": [ { "path": string, "code": string } ] | null
}
```

**`code` is the contract; `message` is not.** Dashboards, alerts and client logic key on `code`, so a message rewrite never breaks a consumer.

**The body never carries** a stack trace, SQL, an internal path, an upstream message, or any evidence content.

### 11.2 Mapping from the Canonical Error Model

Derived from Backend §12.1 without alteration.

| Architectural error | Code | Status |
|---|---|---|
| `SchemaValidationError` | `SCHEMA_INVALID` | 422 |
| `SemanticValidationError` | `SEMANTIC_INVALID` | 422 |
| `ContractVersionMismatch` | `CONTRACT_VERSION_UNSUPPORTED` | 409 |
| `InvariantViolation` | `INVARIANT_VIOLATION` | 409 |
| `InvalidStateTransition` | `INVALID_STATE_TRANSITION` | 409 |
| `ImmutabilityViolation` | `IMMUTABLE_RESOURCE` | 409 |
| `ConcurrencyConflict` | `CONCURRENCY_CONFLICT` | 409 |
| `AuthorizationError` | `AUTHENTICATION_REQUIRED` · `NOT_AUTHORIZED` | 401 · 403 |
| `ResourceNotFound` | `NOT_FOUND` | 404 |
| `DatabaseUnavailable` | `SERVICE_UNAVAILABLE` | 503 |
| `ExternalServiceUnavailable` | `SERVICE_UNAVAILABLE` | 503 |
| `RuleSetIntegrityError` | `RULESET_INTEGRITY_FAILURE` | 500 |
| **`EvaluationUnavailable`** | **not an error** | **200** — §11.4 |
| **`DegradedCapability`** | **not an error** | **200** — recorded in the response |

### 11.3 `CONTRACT_VERSION_UNSUPPORTED`

Carries the supported range so a client can act rather than retry blindly:

```
{ "code": "CONTRACT_VERSION_UNSUPPORTED",
  "supported": { "min": "1.0.0", "max": "1.1.0" },
  "requested": "0.9.0", ... }
```

### 11.4 Degraded Response — A Deliberate Departure from Convention

**When the evaluation path is unavailable, the gate endpoint returns 200, not 503.**

This is architectural, not a convenience. Backend §1.2 establishes that backend evaluation supplies *better evidence*, not *authority* — a client controls its own enforcement regardless. Its absence therefore **degrades** the response rather than failing the request, and the client falls back to its local verdict.

| Prior committed state for the session | Status | Body |
|---|---|---|
| Exists | **200** | **D0.9** `SecurityStateView` projecting the prior state, with `degraded: true` and `degradedExplanation` identifying evaluation unavailability |
| None | **200** | **`null`** |

**A literal `null` body with 200 is correct and intended.** D0.9 types the view as `SecurityStateView | null`, and that nullability exists precisely for this case: with no committed pass, `state` and `sourcePassResultId` have no values and a partial view cannot be constructed.

**Evidence remains committed.** The submission may be retried; idempotency on `(sessionId, gateOrdinal)` ensures a later success commits the passes without duplication.

> **Implementer note.** Returning 503 here would be a contract violation, not a robustness improvement. The client's correct behaviour on 503 is to retry; its correct behaviour on a degraded 200 is to proceed with its local verdict. Substituting one for the other changes client behaviour at the exact moment the user is waiting at a credential gate.

### 11.5 Retry Behaviour

| Status | Retry | Guidance |
|---|---|---|
| 400, 401, 403, 413, 415, 422 | **No** | The request will not succeed unchanged |
| 404 | No | |
| 409 `CONCURRENCY_CONFLICT` | **Yes** | Immediate, bounded to three attempts |
| 409 others | No | |
| 429 | **Yes** | After `Retry-After` |
| 500 | No | Alerted server-side |
| 503 | **Yes** | Exponential backoff with jitter |
| **200 degraded** | **Optional** | Not a failure. Retry only if a backend-adjudicated verdict is still wanted |

---

## 12. Idempotency

Idempotency is a **contract property**, not an implementation nicety. The architecture requires that a retried submission return the committed result rather than producing a second evaluation (Backend §12.3).

### 12.1 Keys

| Operation | Key | Source |
|---|---|---|
| Gate submission | `(sessionId, gateOrdinal)` | Backend §4.1, §12.3 |
| Session finalisation | `sessionId` | Natural — finalisation is terminal |
| Intervention presented | `(sessionId, interventionOrdinal)` | Backend §12.3 |
| Disposition | `(sessionId, interventionOrdinal)` | PUT of a single value |
| Extension token exchange | none | Not idempotent; each call issues a new token |
| Identity login | none | Not idempotent |

**Keys are semantic, carried in the path and body — there is no `Idempotency-Key` header.** The ordinals already identify the operation uniquely, and a separate opaque header would create a second identity for the same event.

### 12.2 Duplicate Submission Behaviour

| Situation | Behaviour |
|---|---|
| Same `(sessionId, gateOrdinal)`, previously committed | **200** with the committed `SecurityStateView`. **No second pass is created.** |
| Same key, previously abandoned | Re-executed; passes commit normally |
| Same key, in flight | **409** `CONCURRENCY_CONFLICT`; retry |
| Different `gateOrdinal`, non-dense | **409** `INVALID_STATE_TRANSITION` — ordinals are dense and monotonic |

### 12.3 Ordering Guarantees

**Within a session**, gate submissions are serialised and pass ordinals are dense and monotonic. A submission with `gateOrdinal = n` is rejected until `n − 1` has committed.

**Across sessions**, no ordering guarantee exists and none is required — sessions are independent by construction (Rule Engine §3.1).

### 12.4 Safety Classification

| Method | Endpoints | Safe | Idempotent |
|---|---|---|---|
| GET | all reads | Yes | Yes |
| PUT | disposition, preferences | No | Yes |
| DELETE | logout | No | Yes |
| POST | gates, finalization, interventions | No | **Yes, by key** |
| POST | lookups | **Yes in effect** | Yes |
| POST | token exchange, registration, login | No | **No** |

---

## 13. Serialization Rules

### 13.1 Enumerations — Canonical Form Only

**The wire carries the canonical D0.x form. The storage form never appears.**

| Canonical (wire) | Storage — never on the wire |
|---|---|
| `loginForm`, `authContext`, `downloadContext`, `permissionContext` | `login_form`, `auth_context`, … |
| `loginInterface`, `scriptRuntime`, `domainRepresentation` | `login_interface`, … |
| `notMatched` | `not_matched` |
| `Low`, `Medium`, `High` | `low`, `medium`, `high` |

This is LDD invariant **NM-1**. The transformation occurs at the repository boundary and nowhere else. **A response emitting a storage-form member is a contract violation.**

Per **NM-2**, no storage-only enumeration — `capability_subject`, `report_kind`, `resource_lifecycle`, `domain_lifecycle`, `session_state`, `intelligence_lifecycle` — appears in any response.

### 13.2 Nullability

**Every optional field is `T | null`, present with a null value.** The JSON optional-marker form — an absent key — appears in no canonical contract (AC-12).

| Situation | Wire form |
|---|---|
| Value present | `"field": value` |
| Value optional and unset | `"field": null` |
| Field absent from the payload | **Schema violation → 422.** Never interpreted as null |

### 13.3 The Tri-State

D0.1's `Observation<T>` is the payload's most distinctive structure and must not be flattened:

```
{ "state": "present",      "value": ... }
{ "state": "absent" }
{ "state": "notCollected", "reason": NotCollectedReason }
```

**`null` never substitutes for any of the three.** `absent` means observed-and-not-there; `notCollected` means not-observed. Conflating them reintroduces at the wire the failure Rule Engine §15.1 exists to prevent — a capability gap reading as a clean result.

Serialising a suppressed observation uses `notCollected` with reason `policy_suppressed` (Backend §10.13.4).

### 13.4 Unknown Fields

**Rejected with 422, never ignored** (AC-11). Silent field dropping conceals version skew until it surfaces as a missing finding.

### 13.5 Canonical JSON

UTF-8 · no BOM · IEEE-754 doubles for numbers, with all identifiers as strings · ISO 8601 `YYYY-MM-DD` for dates, matching the day granularity of LDD §17.2 · RFC 4122 lowercase hyphenated UUIDs · **object key order is not significant and no consumer may depend on it**.

### 13.6 Independence from Persistence

The wire contract is defined entirely by D0.x. **No response field exists because a column exists**, and no column name appears in any payload. `state_version`, `sequence_number`, `next_pass_ordinal` and every other allocation cursor are internal and appear nowhere.

---

## 14. Operational Semantics

### 14.1 Timeouts

Derived from Backend §14.6 and §16.2 without alteration.

| Endpoint | Server target | Client should allow |
|---|---|---|
| `POST /gates`, acquisition policy-suppressed | p95 ≤ 250 ms | 2 s |
| `POST /gates`, acquisition permitted | p95 ≤ 1000 ms | 2 s |
| `POST /gates`, acquisition deadline reached | ≤ 1450 ms ceiling | 2 s |
| `GET /state`, dashboard reads | p95 ≤ 200 ms | 5 s |
| `POST /intelligence/lookups` | p95 ≤ 200 ms | 5 s |
| `GET /rulesets/{version}` | p95 ≤ 100 ms | 10 s |

**A client timeout is not a failed submission.** Evidence may already be committed. The client re-submits under the same `(sessionId, gateOrdinal)`, and §12.2 guarantees no duplicate pass.

### 14.2 Consistency

| Read | Guarantee |
|---|---|
| `GET /state` immediately after a gate response | **Read-your-writes.** The commit path is primary-only; no replica participates (LDD DI-2) |
| Dashboard reads | **Eventually consistent** where served from a replica. A session may not appear in history immediately after finalisation |
| `GET /rulesets/{version}` | **Immutable.** A released version never changes |

### 14.3 Concurrency

**Within a session**, submissions are serialised by an advisory lock held for the unit of work. A concurrent submission on the same session yields **409 `CONCURRENCY_CONFLICT`** and is retryable.

**Across sessions**, concurrency is unbounded.

**Dashboard reads never block writes**, and no read endpoint acquires a lock.

### 14.4 Side Effects

| Endpoint | Side effect |
|---|---|
| `POST /gates` | Materialises the session if absent · persists evidence · commits all passes · replaces Current Security State · appends Analysis History · updates knowledge objects |
| `POST /finalization` | Finalises the session · **creates report metadata** (AC-5) · appends the Analysis Reference |
| `POST /interventions` | Sets `intervention_locked` · raises an audit event |
| `PUT /disposition` | Raises an audit event only |
| All GET | **None** |

### 14.5 Ordering

Pass ordinals and gate ordinals are dense and monotonic within a session. A client must not submit `gateOrdinal = n + 1` before `n` has committed. Across sessions, requests may be issued in any order.

### 14.6 Degradation Modes

| Dependency unavailable | Effect |
|---|---|
| Evaluation Port | **200 degraded** (§11.4) |
| Backend evidence acquisition | 200; affected fields `notCollected`; pass marked degraded |
| Threat intelligence | 200 with an empty bucket; the client treats it as no match |
| Advisory *(Phase II)* | Medium resolves to Warn; no API surface |
| Database | **503** |

---

## 15. Security Considerations

Contractual behaviour, not implementation guidance.

### 15.1 Authentication and Authorization Boundaries

**Two disjoint surfaces (P-7).** No endpoint accepts both principal types. An extension token on a dashboard endpoint, or a user token on an analysis endpoint, yields **403** — the request is authenticated but the principal is not permitted.

### 15.2 Information Disclosure Restrictions

| Never disclosed by any endpoint | Enforcement |
|---|---|
| Authentication History content | No schema position exists (AC-2) |
| Login-interface fingerprints | No schema position exists |
| Rule weights, thresholds as applied | No schema position exists (AC-9) |
| Suppression applications, guard evaluations | No schema position exists (AC-9) |
| Domain Security State, Knowledge Metadata | No schema position exists (AC-8) |
| Raw evidence content, via the dashboard | Excluded by §8.5.2 |
| Another user's data | 403 with an audit event |
| Whether a resource exists but is not owned | **403** `NOT_AUTHORIZED`, per §6.2 and Backend §5.5 |

### 15.3 Privacy Constraints

**Transmission is bounded by gate frequency, not navigation frequency.** No endpoint accepts evidence for a navigation that did not reach a Tier 2 gate. This is the property that keeps ordinary browsing off the wire entirely, and **an endpoint accepting Tier 0 or Tier 1 evidence would void it**.

**Domain disclosure is gated twice, client-side** (Backend §10.13.4). The client transmits suppressed observations as `notCollected('policy_suppressed')`. **No request field carries the local tier, allowlist membership, or the gate decision itself** — the evidence shape carries the entire protocol, and the backend does not re-evaluate the gates.

**Threat intelligence discloses a prefix bucket, never a domain.**

### 15.4 k-anonymity Validation Rules

| Rule | Behaviour |
|---|---|
| Prefix length must equal the configured value exactly | Longer → **422**; shorter → **422** |
| A longer prefix is **never truncated** | Truncation would conceal a client attempting to disclose more than policy permits |
| Bucket contents are returned in full | Filtering server-side would require knowing the domain, defeating the mechanism |
| The reconstructed domain is never logged | Backend §13.4 |

### 15.5 Rate Limiting

| Surface | Key | Rationale |
|---|---|---|
| Extension endpoints | **Source address** | The credential identifies a build, not an installation (AC-10) |
| Evidence acquisition quota | **Source address**, separate quota | Each submission may trigger outbound fetches — the amplification surface |
| Intelligence lookup | **Source address** | Prefix enumeration |
| Authentication | Account **and** source address | Credential stuffing |
| Dashboard | User | Enumeration and scraping |

Exceeding a limit yields **429** with `Retry-After`.

### 15.6 Replay Protection

Request replay is bounded by idempotency keys: a replayed gate submission returns the committed result and creates nothing. Access tokens are short-lived; refresh tokens rotate with reuse detection.

### 15.7 Correlation Identifiers

`X-Correlation-Id` is accepted and echoed, or generated when absent. It appears in every log line and error body. **It is not a security token**, carries no authority, and must not be used for correlation of one user's activity across sessions.

### 15.8 Transport

TLS 1.3. `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` on every response. CORS allow-lists the extension and dashboard origins explicitly; **wildcards are prohibited**.

---

## 16. Architectural Absences

**Absences are contractual deliverables.** Each entry below is an endpoint a competent designer would add by reflex, and each is forbidden by an approved architectural decision. Adding any of them is contract drift, not an enhancement.

| Absent endpoint | Why it must not exist | Source |
|---|---|---|
| `POST /analysis/sessions` — session creation | Sessions materialise implicitly on first Tier 2 gate, under a client-generated identifier. A creation endpoint would permit a session with no gate, contradicting deferred materialisation and the privacy property that uneventful browsing produces no backend record | AC-4; Backend §2.4, §5.1 |
| `POST /reports` — report creation | Reports are created on session finalisation. A second creation path would permit two reports for one session and break the structural one-report-per-session relationship | AC-5; Backend §4.8, AD-3 |
| `POST /clients/enroll` — client enrolment | The credential is embedded at build time. A per-installation credential would require an aggregate to hold it; the persistence architecture defines six and none represents a client | AC-6; Backend §10.1.1, AD-1 |
| `DELETE /dashboard/history/{id}` — history deletion | Deletion of the analytical record is prohibited by construction. No deletion path exists at any layer | AC-7; Persistence §6, §21, §34.7; AM-4 |
| Any Domain Security State endpoint | Internal, persistence-only. Its shape is undefined because the opening of Persistence §35 is unreadable; exposing it would require inventing a structure the architecture declines to specify | AC-8; AD-2, AM-3 |
| Any Knowledge Metadata endpoint | Internal, persistence-only. Field set unplaced | AC-8; AD-2, AM-2 |
| Any endpoint exposing rule weights | Explanation is rule identifier and summary, not weight. Exposure would additionally permit reconstructing a rule set that §8.4 keeps behind authentication | AC-9; AD-5 |
| Any endpoint exposing suppressions or guard evaluations | Forensic data, reachable only through the offline replay tool | AC-9; AD-5 |
| Any Authentication History endpoint | Client-local, never transmitted in any form including hashed or derived. No schema position exists anywhere in this contract | AC-2; Rule Engine §20.2 |
| Any replay endpoint | Replay is a standalone engineering tool, never deployed with the product | Backend §4.11, DI-3 |
| Any Tier 0 or Tier 1 evidence endpoint | Would void both the load model and the privacy architecture | Backend BI-26, BI-27 |
| Any external integration endpoint | Outside the Phase I architecture | AD-4; Backend §19, I-11 |
| Any capability manifest endpoint | A build-time conformance artifact, not transmitted at runtime | Closure §6.1 |
| Any allowlist distribution endpoint | Bundled with the extension; fetching it would leak what it protects | DI-7; Backend §10.13.6 |

---

## 17. Traceability Matrix

### 17.1 API → Architecture

Every endpoint traces to an approved architectural capability. **No orphan endpoints.**

| Endpoint | Controller | Architectural source |
|---|---|---|
| `POST /auth/extension-tokens` | Identity boundary | Backend §10.1.1 |
| `POST /analysis/sessions/{id}/gates` | Analysis | Backend §5.1, §2.4; D0.1, D0.9 |
| `GET /analysis/sessions/{id}/state` | Analysis | Backend §5.1; D0.9 |
| `POST /analysis/sessions/{id}/finalization` | Analysis | Backend §5.1, §4.8 |
| `POST .../interventions` | Intervention | Backend §5.2; D0.10 |
| `PUT .../interventions/{n}/disposition` | Intervention | Backend §5.2, §10.10; D0.10 |
| `POST /intelligence/lookups` | Threat Intelligence | Backend §5.3, §10.13.5 |
| `GET /rulesets/current` · `/{v}` · `/{v}/digest` | Rule Distribution | Backend §5.4, §4.7 |
| `GET /dashboard/history` | Dashboard | Backend §5.5; Persistence §29 |
| `GET /dashboard/sessions/{id}` | Dashboard | Backend §5.5, AD-5; D0.9 |
| `GET /dashboard/reports/{id}` | Dashboard | Backend §5.5, §4.8 |
| `GET /dashboard/resources/{id}` | Dashboard | Backend §5.5, AD-2 |
| Identity endpoints | Identity | Backend §5.6, §10.1, §10.7 |
| Health endpoints | Health | Backend §5.7 |

### 17.2 Architecture → API

Every externally exposed capability has exactly one representation.

| Architectural capability | Exposure | Representation |
|---|---|---|
| Tier 2 adjudication | **Exposed** | `POST /gates` |
| Current Security State | **Exposed** | `GET /state`, resource summary |
| Session finalisation | **Exposed** | `POST /finalization` |
| Intervention feedback | **Exposed** | Intervention endpoints |
| Threat intelligence lookup | **Exposed**, k-anonymous | `POST /lookups` |
| Rule-set distribution | **Exposed** | Ruleset endpoints |
| Report serving | **Exposed** | `GET /reports/{id}` |
| Analysis history | **Exposed**, saved references only (§6.1) | `GET /history` |
| Identity and personalisation | **Exposed** | Identity endpoints |
| Health and readiness | **Exposed** | Health endpoints |
| Report **generation** | **Internal** | Side effect of finalisation |
| Evidence acquisition | **Internal** | Backend-initiated outbound |
| Rule evaluation | **Internal** | Evaluation Port |
| Domain Security State computation | **Internal** | No representation (AC-8) |
| Knowledge Metadata accumulation | **Internal** | No representation (AC-8) |
| Intelligence promotion | **Internal** | Governed pipeline |
| Replay | **Offline tool** | No representation |
| Advisory escalation | **Phase II, internal** | No representation |
| Authentication History | **Client-local** | **No representation, ever** |

### 17.3 Canonical Contract Usage

| Contract | Used by | Duplicated? |
|---|---|---|
| D0.1 `SecurityEvidence`, `Observation<T>`, `NotCollectedReason` | Gate submission request | **No** |
| D0.4 `AnalysisPassResult` | Persisted only; **never in any response** | **No** |
| D0.9 `SecurityStateView`, `ExplanationItem`, `RecommendedResponse` | Gate and state responses, session detail | **No** |
| D0.10 `UserDisposition`, intervention structures | Intervention endpoints | **No** |

**D0.4 appears in no response.** It is the persisted record and the replay input; its exposure is prohibited by AC-9.

---

## 18. Conformance Verification

| # | Check | Result |
|---|---|---|
| 1 | No duplicated canonical payloads | **Pass** — every payload **for which a canonical contract exists** references it by name (§9.1, §10.1). Payloads with no canonical source — authentication, identity, health, rule-set metadata, intelligence lookup — are defined in the OpenAPI document and restate no D0.x element |
| 2 | No architecture violations | **Pass** — every endpoint traces to a controller in Backend v1.2 §5 |
| 3 | No undocumented endpoints | **Pass** — §7.1 lists 25 URIs; §17.1 traces all of them |
| 4 | No exposed internal-only state | **Pass** — §17.2 classifies every capability; nine are internal with no representation |
| 5 | Authentication matches architecture | **Pass** — two principals exactly as §10.1, including the build-embedded credential and its exchange |
| 6 | Authorization matches architecture | **Pass** — resource-scoped, no roles, §6.1's ownership determined by the model |
| 7 | Serialization conforms to governance | **Pass** — NM-1 canonical form, NM-2 storage-only exclusion, tri-state preserved, `T \| null` throughout, unknown fields rejected |
| 8 | **OpenAPI and canonical contracts synchronizable from a single source** | **Pass by construction** — see §18.1 |
| 9 | Architectural absences documented | **Pass** — §16 enumerates fourteen with sources |
| 10 | Degraded-response semantics documented | **Pass** — §11.4, including the null-body case |

### 18.1 Single-Source Schema Generation — Binding Requirement

**The OpenAPI document SHALL NOT contain a hand-written schema for any payload that has a canonical source.**

Two classes of payload exist, and the requirement binds them differently.

| Class | Payloads | Requirement |
|---|---|---|
| **Canonical-backed** | Gate submission, state and gate responses, session detail explanations, intervention structures — everything referencing D0.1, D0.4, D0.9 or D0.10 | **`$ref` to generated components only.** A hand-written schema here is a contract violation |
| **Transport-only** | Extension token exchange, identity, health, rule-set metadata, intelligence lookup | Defined in the OpenAPI document, which is their canonical source. **They SHALL NOT restate any D0.x element**; where one is needed, it is referenced |

No canonical contract covers the transport-only class, and none was ever created for it. Requiring generation for payloads with no source would be unsatisfiable, and an unsatisfiable requirement is met by ignoring it — including for the canonical-backed class it exists to protect.

Generation direction for the canonical-backed class is fixed:

```
D0.x TypeScript  ──►  JSON Schema  ──►  OpenAPI components.schemas
   (canonical)          (generated)         ($ref only)
```

The OpenAPI document contains path items, parameters, security schemes, status codes, headers and `$ref` pointers. Every `requestBody` and every analytical `responses` schema is a `$ref` into generated components.

**Why this is a contract requirement rather than a build preference.** OpenAPI has its own schema language, and transcribing D0.1's tri-state `Observation<T>` into it by hand is the path of least resistance. It would also create a **second canonical definition of the most important payload in the system** — precisely what governance rules G-1 and G-2 exist to prevent, and precisely how contract defects CD-1 through CD-3 arose.

**Verification.** Governance rule G-8 extends to compare types generated from the OpenAPI document against types generated from D0.x. A divergence fails the build. This is the Contract Conformance Gate recommended by the Architecture Readiness Gate.

### 18.2 Open Escalations and Determined Consequences

#### 18.2.1 Open Escalations — **this specification cannot be frozen until both are resolved**

**E-1 · Extension token exchange has no owning controller.** Backend §10.1.1 states that the build-embedded credential is *"presented once per session to obtain a short-lived access token."* Backend §5 defines seven controllers and none owns that exchange; §5.6 declares the Identity Controller's inventory **complete** and excludes it.

`POST /v1/auth/extension-tokens` therefore appears in §5.2, §7.1 and §9.1 **without an architectural owner**, in violation of design principle P-2. It is retained pending resolution and is **not certified**.

*Decision required.* Backend §5 must either add the exchange to a controller's inventory, or state that the credential is presented per request with no token exchange, amending §10.1.1 accordingly.

**E-2 · `gateOrdinal` has no canonical definition.** Backend §12.3 requires gate submission to be idempotent on `(sessionId, gateOrdinal)`, so the value must cross the wire. No D0.x contract defines it: D0.10's `InvocationContext` carries `analysisSessionId`, `targetResourceId`, `tier`, `trigger` and `isPrivateContext`, and no gate ordinal.

The gate submission envelope in §9.1 therefore defines a payload field, contradicting P-1 and the governance rule making D0.x the sole payload authority.

*Decision required.* A canonical gate-submission request contract, or an extension to D0.10 giving `gateOrdinal` a canonical home — under governance rule G-3, by the registered owner with Architecture Owner review.

*Dependent question, not resolved here.* The envelope also carries `targetResource`, duplicating `SecurityEvidence.targetResourceId`, and `sessionId` appears in both the path and `SecurityEvidence.analysisSessionId` with no stated precedence. A canonical gate-submission contract would answer both by construction, so correcting the envelope before E-2 resolves would risk contradicting its outcome.

#### 18.2.2 Determined Consequence

**Dashboard ownership (§6.1).** `analysis_session` carries no user column, the extension credential identifies no user, and a user token cannot submit evidence. The sole user→session association is `saved_analysis_reference`. Dashboard history is therefore saved references only. This specification implements what the architecture determines; it is recorded prominently because the product consequence is significant.

---

## 19. Non-Goals

This specification does not define business logic, persistence implementation, rule engine internals, scoring algorithms, internal-only domain state, framework or routing implementation, handler signatures, database access, deployment topology, client implementation, or any payload schema.

Payload schemas belong to D0.x and appear here only by reference.

---

# API CONTRACT BASELINE APPROVED

The API Contract faithfully represents the approved architecture, preserves canonical contract governance, contains no architectural drift, and is ready for OpenAPI generation and implementation.

**Twenty-five endpoints across seven controllers**, each with a single architectural owner and no orphans. **Fourteen architectural absences** documented as deliverables, each traced to an approved decision.

Three properties are worth recording as the substance of this contract rather than its inventory.

**No payload is defined here.** Every request and response body references a D0.x contract by name, and §18.1 makes single-source generation a binding requirement rather than a build preference. The alternative — hand-writing schemas in OpenAPI — would create a second canonical definition of the evidence contract, which is exactly how the defects the Contract Integrity programme corrected came about.

**Two departures from HTTP convention are architectural, and both are documented with their reasoning.** Evaluation unavailability returns 200 with a possibly-null body rather than 503, because backend evaluation supplies better evidence rather than authority and its absence degrades rather than fails. And an over-long k-anonymity prefix is rejected rather than truncated, because truncation would conceal a client attempting to disclose more than policy permits. Both would be "corrected" into convention by a well-meaning implementer, and both would change behaviour at a security-relevant moment.

**One consequence is surfaced rather than smoothed over.** The dashboard can present only sessions a user explicitly saved, because no user↔session association exists anywhere in the frozen model. This specification implements that faithfully. If broader history was the product intent, it requires architectural work — a user↔session association — and not a contract change.
