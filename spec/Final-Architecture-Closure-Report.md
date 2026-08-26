# SecureSphere X — Final Architecture Closure Report

**Version:** 1.0 · **Status:** Certification decision
**Closes:** the four ambiguities identified by the Architecture Readiness Gate, plus one found during the sweep
**Produces:** Backend Architecture Specification **v1.2**
**Method:** every ambiguity resolved by an explicit decision, a scope clarification, or a correction — none deferred

---

## 1. Executive Summary

Five architectural ambiguities are closed. Four were identified by the Readiness Gate; one was found during the sweep of §6 and is the more consequential of the set.

**No architectural behaviour changed.** Every closure is a decision the architecture already constrained to a single admissible answer, a statement of scope, or the correction of wording that implied a mechanism which does not exist.

The decision that required genuine judgement was **G-1, extension client credential issuance**. It resolved itself once the constraint was checked: a per-installation credential requires an aggregate to hold it, the persistence architecture defines six aggregates and none represents a client, and introducing one is prohibited. Binding clients to `User` would require a dashboard account before the extension functions — a behavioural change, equally prohibited. **A build-embedded credential is the only option consistent with the frozen architecture**, and it carries one consequence that had to be corrected: the credential cannot serve as a rate-limiting key.

| # | Ambiguity | Closure | Class |
|---|---|---|---|
| AD-1 | Extension client credential issuance | Architectural decision | Decision |
| AD-2 | Domain state exposure | Scope clarification | Clarification |
| AD-3 | Report lifecycle | Architectural decision | Decision |
| AD-4 | External integration scope | Scope clarification | Clarification |
| AD-5 | Session detail response depth | Scope clarification | Clarification — **found in sweep** |
| CR-1 | Rate-limit basis for extension endpoints | Correction, consequent on AD-1 | Correction |

---

## 2. Closure Scope

| Specification | Modified | Nature |
|---|---|---|
| Backend Architecture | **v1.1 → v1.2** | §5.5, §5.6, §4.8, §10.1.1 (new), §10.5, §19 |
| Domain Model | No | AD-4 clarifies its §8.6.6 without altering it |
| Rule Engine v0.8 | No | No contact surface |
| Persistence Architecture | No | AD-2 confirms two states remain internal |
| Logical Database Design v1.1 | No | No table, column or constraint affected |
| Canonical Contracts D0.x | No | No contract element added, removed or retyped |

---

## 3. Architectural Decisions

### AD-1 · Extension Client Credential — Build-Embedded, No Enrolment

**Decision.** The extension authenticates with a credential **embedded in the extension build**. There is no enrolment, no enrolment endpoint, and no controller participates in issuance.

| Property | Definition |
|---|---|
| Issuer | The build pipeline, at packaging time |
| Identifies | The extension **build**, not the installation |
| Enrolment | None |
| Owning controller | None — §5.6's inventory is complete without one |
| Lifecycle | Bound to the build; rotated by shipping a new version; the prior credential is revoked when that version is retired |
| Exchange | Presented once per session for a short-lived access token; the token authorises requests |

**Alternatives eliminated by the frozen architecture, not by preference:**

| Alternative | Why unavailable |
|---|---|
| Per-installation credential via an enrolment endpoint | Requires an aggregate to hold it. Persistence §17 defines six aggregates and none represents a client. A seventh is an architectural change. |
| Binding client credentials to `User` | Would require a dashboard account before the extension functions. Behavioural change. |
| Unauthenticated extension endpoints | Contradicts §10.1, which defines the extension as an authenticated principal. |

**Trust assumptions, now explicit.** The credential ships in a package the user controls and must be assumed public. It therefore confers no authority beyond submitting evidence about the submitter's own sessions and fetching rule sets — precisely the position §10.15 already takes, that a hostile client can misrepresent its own page and nothing else. It is not an identity, does not distinguish installations, and is never used for authorisation beyond principal type.

**Propagated to:** Backend §10.1.1 (new), §10.1 table, §5.6.

### AD-3 · Report Lifecycle — Automatic on Session Finalisation

**Decision.** Report metadata is created **automatically on Analysis Session finalisation**, within the same unit of work that appends the Analysis Reference. There is **no report creation endpoint**.

| Concern | Definition |
|---|---|
| Creation trigger | Session finalisation |
| Creating component | Report Service, invoked by Analysis Orchestration |
| Generation and persistence timing | Synchronous, in the finalisation unit of work |
| Retrieval | On demand, by report identifier or session identifier |
| Ownership | SKR, metadata only |

**Rationale.** A client-initiated creation endpoint would establish a second creation path for an immutable artifact and would permit two reports for one session. Binding creation to finalisation makes the one-report-per-session relationship structural. Volume is bounded by the same property that bounds sessions: deferred materialisation means only gated navigations produce one.

**Propagated to:** Backend §4.8.

---

## 4. Scope Clarifications

### AD-2 · Domain State Exposure

Every domain state is classified. Two are confirmed **internal with no API representation**.

| State | Classification | API representation |
|---|---|---|
| Current Security State | Externally visible | Score, tier, degraded flag — via D0.9 `SecurityStateView` and resource summaries |
| Analysis History | Externally visible | Session identifiers, tiers, dates — ordered by sequence |
| Analysis Pass Result | **Internal — analytical** | **None.** Reached only through the offline replay tool |
| Security Evidence | **Internal — analytical** | **None** |
| Security Evaluation | **Internal — analytical** | **None** |
| Correlation Finding | Partially visible | Rule identifier and summary only, via `ExplanationItem` |
| Scoring Entry, Suppression Application, Guard Evaluation, Capability Marker | **Internal — analytical** | **None** |
| **Domain Security State** | **Internal — persistence-only** | **None** |
| **Knowledge Metadata** | **Internal — persistence-only** | **None** |
| Resource Identity, Domain Identity | Externally visible | Identifiers only |
| Intelligence Object internals | **Internal** | **None** — only k-anonymity prefix buckets cross |
| Authentication History | **Client-local** | **None** — no endpoint accepts or serves it |
| Session lifecycle state | **Internal — persistence-only** | **None** — see LDD §15.3.3 |

**Why Domain Security State and Knowledge Metadata are internal.** Neither has a defined shape. The opening of Persistence §35 is unreadable and the Knowledge Metadata field set is unplaced. Exposing either would require inventing a structure the architecture declines to specify. Declaring them internal resolves the ambiguity without inventing anything, and is consistent with both remaining accepted open items.

**Propagated to:** Backend §5.5.

### AD-5 · Session Detail Response Depth — **found during the sweep**

**Clarification.** `session detail` returns the **explanation-level view**, not the full Analysis Pass Result.

| Returns | Does not return |
|---|---|
| Matched rule identifiers and their summaries | Base and effective weights |
| Effective tier, degradation status | Suppression applications and guard evaluations |
| Rule-set version | Subsumption records |
| Named origin where CRED-02 matched | Raw evidence content |

**Two reasons, both structural rather than stylistic.** The user-facing explanation contract is D0.9's `ExplanationItem`, which carries a rule identifier, a summary, an optional named origin and an AI-attribution flag — **and no weight**. And §5.4 keeps rule sets behind authentication; exposing per-pass weights through a dashboard endpoint would permit reconstruction of the rule set from enough session details.

The full Pass Result exists for replay and forensics and is reached through the standalone replay tool (§4.11), which is never deployed with the product.

**Why this was found only now.** §5.5 named the endpoint without fixing its depth, and both readings were defensible. It materially affects the API payload, which is why it belongs in closure rather than in contract design.

**Propagated to:** Backend §5.5.

### AD-4 · External Integrations — Outside Phase I

**Clarification.** External integrations are **outside the Phase I architecture**. No third principal, no endpoints, no authentication scheme, no rate-limit class.

Domain Model §8.6.6 names external integrations among the consumers of the Security Assessment contract. That is a statement about the **contract's implementation-independence** — the same authoritative assessment can be consumed by different components without altering the analytical model — and not a commitment to an external API. Reading it as an API commitment would require a third principal that §10.1 does not define.

Recorded as boundary **I-11** with an explicit nothing-in, nothing-out position.

**Propagated to:** Backend §19.

---

## 5. Corrections

### CR-1 · Rate-Limit Basis for Extension Endpoints

**Consequent on AD-1, not an independent change.** §10.5 keyed three limits on "per client credential." Under AD-1 the credential identifies a build rather than an installation and therefore cannot distinguish clients, so the basis is corrected to **per source address** for Tier 2 submission, evidence acquisition quota, and intelligence lookup.

The evidence-acquisition quota is the one that most requires bounding, because each submission may trigger outbound fetches — an amplification surface identified in §10.14 and BR-5.

**Propagated to:** Backend §10.5.

---

## 6. Remaining Ambiguity Sweep

The sweep covered every category capable of altering API resources, endpoint inventory, authentication, authorisation, payloads, lifecycle, workflow, security, versioning, ownership or external contracts.

| Category | Examined | Outcome |
|---|---|---|
| **API resources** | Six aggregates against §5 controllers | Complete. No aggregate lacks an owning controller where exposure is intended |
| **Endpoint inventory** | Seven controllers | Complete after AD-1 (no enrolment) and AD-3 (no report creation) |
| **Authentication** | Both principals | Complete after AD-1 |
| **Authorization** | Resource-scoped model, §10.2 | Complete. No roles in Phase I, stated |
| **Payloads** | D0.1, D0.4, D0.9, D0.10 | Complete after AD-2 and AD-5 fix response depth |
| **Lifecycle** | Six aggregates, session states, report | Complete after AD-3; session-state vocabularies resolved by LDD §15.3.3 |
| **Workflow** | Synchronous throughout; two background operations, neither exposed | Complete |
| **Security** | Trust boundaries TB-1…TB-8 | Complete after AD-1's trust assumptions and CR-1 |
| **Versioning** | URI plus header-negotiated contract version | Complete; supported-range policy is a contract decision, not architectural |
| **Ownership** | Three repositories, six aggregates | Unchanged |
| **External contracts** | Ten boundaries plus I-11 | Complete after AD-4 |

### 6.1 Items Examined and Confirmed Not Ambiguous

| Item | Finding |
|---|---|
| Popularity allowlist distribution | No endpoint required. §10.13.6 bundles it with the extension; DI-7 prohibits fetching at evaluation time |
| Producer capability manifest | Build-time conformance artifact, not transmitted at runtime. The per-pass capability set is computed from evidence |
| Extension version reporting | Carried as `collector_version` in D0.1's collection context. No separate endpoint |
| Authentication History user controls | D0.8 `AuthStoreUserControl` is client-local. No HTTP surface, correctly |
| Advisory service | Phase II, backend-internal. No external surface |
| Analysis history pagination | Schema supports cursor pagination through `analysis_reference.sequence_number`, dense and monotonic. Cursor versus offset is a contract decision |
| k-anonymity prefix length | Endpoint defined; prefix length is an empirical parameter the contract references |
| User-initiated data deletion | No endpoint. Deletion is prohibited by construction (AM-4), and this is a documented architectural position rather than an omission |

---

## 7. Propagation Verification

| Decision | Backend v1.2 | Domain Model | Persistence | LDD | D0.x |
|---|---|---|---|---|---|
| AD-1 | §10.1 table, **§10.1.1 new**, §5.6 | — | — | — | — |
| AD-2 | §5.5 response scope | — | Confirms §35, AM-2 internal | — | — |
| AD-3 | §4.8 lifecycle | — | — | Confirms `report` lifecycle | — |
| AD-4 | §19 I-11 | Clarifies §8.6.6 without altering | — | — | — |
| AD-5 | §5.5 response scope | — | — | — | Confirms D0.9 `ExplanationItem` |
| CR-1 | §10.5 | — | — | — | — |

**Contradiction sweep.** No specification contradicts another after propagation. Specifically verified: no LDD table, column or constraint is affected; no D0.x contract element is added, removed or retyped; no aggregate boundary, repository ownership rule or privacy invariant is touched.

**Non-regression.** The contract conformance check (`contract-conformance-check.py`, governance rule G-8) remains passing — no contract was modified in this phase.

---

## 8. Remaining Ambiguity Assessment

**No architectural ambiguity remains.**

Three items remain open as **formally accepted architectural decisions with documented rationale**. None can alter the API Contract.

| # | Item | Why it cannot affect API Contract Design |
|---|---|---|
| **AM-2** | Knowledge Metadata field set unplaced | AD-2 classifies it internal with no API representation. The LDD stores it as append-only entries whose shape no endpoint exposes |
| **AM-3** | Persistence §35 opening unreadable; Domain Security State shape undefined | AD-2 classifies it internal with no API representation |
| **AM-4** | No deletion path exists, by construction | No deletion endpoint is designed. This is a property of the frozen architecture, documented and accepted |

One item remains open as an **execution prerequisite for implementation**, not for contract design.

| # | Item | Why it cannot affect API Contract Design |
|---|---|---|
| **RR-1** | Capability spike unexecuted | Contract effect is provably nil. An incapable field is expressed as `notCollected('api_unavailable')` through the existing tri-state, which requires no payload change whatever the spike returns |

---

## 9. Final Freeze Verification

| Criterion | Result |
|---|---|
| Architecture internally consistent | **Pass** — no specification contradicts another |
| System scope complete | **Pass** — every capability classified as exposed, internal, implementation-only, Phase I or deferred |
| Authentication architecture complete | **Pass** — issuance, issuer, enrolment, ownership, lifecycle and trust assumptions all defined (AD-1) |
| Public API scope complete | **Pass** — endpoint inventory closed; services that SHALL NOT be exposed are named |
| Architectural responsibilities complete | **Pass** — every controller's response depth is now fixed |
| External boundaries complete | **Pass** — eleven boundaries, including I-11 |
| No unresolved architectural ambiguity | **Pass** — three accepted decisions and one execution prerequisite, all documented, none API-affecting |
| Architecture unchanged except by clarification and completion | **Pass** — no aggregate, boundary, ownership rule, workflow, lifecycle semantic, privacy rule or contract element altered |

---

# ARCHITECTURE BASELINE APPROVED

The architecture is complete, internally consistent, fully scoped, and ready for API Contract Design.

Five ambiguities are closed by explicit decision or scope clarification, and one correction follows from AD-1. **Backend Architecture Specification v1.2 is the current baseline**; every other specification is unchanged.

Two closures are worth recording as the substantive outcomes.

**AD-1 was constrained to a single answer, not chosen among several.** A per-installation credential requires an aggregate the persistence architecture does not define, and creating one is prohibited. Recognising that turned an apparently open design question into a determination — and surfaced the consequence that the credential cannot be a rate-limiting key, which CR-1 corrects.

**AD-5 was found during the sweep, not by the gate.** §5.5 named a `session detail` endpoint without fixing its depth, and both readings were defensible: the full Pass Result, or the explanation-level view. It materially changes the payload and would have surfaced during contract design as a redesign rather than a decision. The explanation-level view is correct because D0.9's `ExplanationItem` carries no weight, and because exposing per-pass weights would permit reconstruction of a rule set that §5.4 keeps behind authentication.

API Contract Design may begin without introducing architectural risk.
