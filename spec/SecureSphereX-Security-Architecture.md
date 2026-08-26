# SecureSphere X — Security Architecture

**Category 8 deliverable · Documentation Authority Audit.**

> **This document is a verbatim extract, not an authored specification.**
>
> **Source:** `Backend-Architecture-Specification-v1_3.md` (Category 7 authoritative base)
> **Extracted ranges:** **L112–121** (§1.7 Security Principles) and **L1003–1223** (§10 Security Architecture, §10.1 through §10.15)
> **Extraction rule:** verbatim, both blocks, in source order. Nothing added, nothing removed, nothing reworded. No content in this document originates outside those two ranges.
>
> **Cross-references leaving the extract.** Per Ruling R3 §4, references pointing outside the extracted ranges are preserved as written rather than rewritten or removed. Six resolve against the source document and not within this extract: **§2.4, §5, §5.1, §5.3, §5.4, §5.6**. To follow any of them, read them against `Backend-Architecture-Specification-v1_3.md`.
>
> **Known limitation (EDF-4, restated at Ruling R29 §2 — `Minor`).** This is a verbatim extract rather than an authored security architecture, and it reads as one. It *does* carry a threat model: **§10.14 enumerates nine threats in its own left column**, each paired with a mitigation — forged verdict submission, evidence poisoning, SSRF via evidence acquisition, rule-set tampering, request replay, cross-user data access, credential stuffing, browsing-history inference, and Authentication History exfiltration. It also carries a data-asset inventory under another name: **§10.13.2 *Complete trust-boundary inventory*** is an eleven-row `Data | Crosses? | Mechanism` table. What it lacks is a **residual-risk or risk-acceptance statement** — Backend §21 *Risk Register* sits at source L1828, outside both extracted ranges, and the extract contains no such statement. Authoring one inside this audit would introduce normative content absent from the corpus; it is Phase II work.

---

## Extract 1 — §1.7 Security Principles (source L112–121)

### 1.7 Security Principles

**Zero trust toward the client.** Evidence arrives from an extension running on a machine the operator does not control. It is schema-validated, semantically validated and bounded. A client can submit observations and nothing else.

**The client cannot influence its own verdict beyond evidence.** No endpoint accepts a finding, score, tier, capability set or rule-set override.

**Least knowledge.** The backend stores the minimum required for its responsibilities and receives the minimum required to compute a verdict (§10.13).

**Trust boundaries are explicit** (§10.12) and every crossing is validated.


---

## Extract 2 — §10 Security Architecture (source L1003–1223)

## 10. Security Architecture

### 10.1 Authentication

Two distinct principals:

| Principal | Mechanism | Scope |
|---|---|---|
| **Extension client** | Credential embedded in the extension build, presented on each request | Analysis endpoints, intelligence lookup, rule distribution |
| **Dashboard user** | Password with optional MFA; JWT access token, rotating refresh token | Dashboard, identity endpoints |

An extension token cannot read dashboard data; a user token cannot submit evidence. Conflating them would let a compromised extension credential read a user's history.

#### 10.1.1 Extension Client Credential

**The credential is embedded in the extension build. There is no enrolment, and no endpoint issues it.**

| Property | Definition |
|---|---|
| **Issuer** | The build pipeline, at packaging time |
| **Identifies** | The extension **build**, not the installation |
| **Enrolment** | None. No enrolment endpoint exists, and §5.6's inventory is complete without one |
| **Owning controller** | None. No controller participates in issuance |
| **Lifecycle** | Bound to the build. Rotated by shipping a new extension version; the prior credential is revoked when the version is retired |
| **Presentation** | Presented on **each request**. There is no token exchange and no endpoint issues, derives or refreshes anything from it |

**Why no per-installation credential.** A per-installation credential would require an aggregate to hold it. The persistence architecture defines six aggregates and none represents a client; introducing one would be an architectural change. Binding clients to `User` instead would require a dashboard account before the extension could function, which is a behavioural change. Both are prohibited at this stage, and neither is necessary.

**Trust assumptions, stated explicitly.**

1. The credential is **extractable**. It ships in a package the user controls, and it must be assumed public.
2. It therefore confers **no authority beyond submitting evidence about the submitter's own sessions** and fetching rule sets. This is exactly the position §10.15 already takes: a hostile client can misrepresent its own page and nothing else.
3. It is **not an identity**. It does not distinguish installations, does not associate a submission with a user, and is never used for authorisation decisions beyond principal type.
4. Because it does not distinguish installations, **it is not a rate-limiting key**. See §10.5.

**Why there is no token exchange.** Every extension-facing controller — §5.1, §5.3, §5.4 — states that it authenticates with the *extension client credential*. A short-lived token derived from that credential would add nothing: the credential is assumed public (assumption 1), so anyone able to obtain a token already holds the credential, and revocation operates at build level rather than token level, so a token grants no finer expiry. Introducing an exchange would create an endpoint owned by no controller and a security property that does not exist.

The credential is therefore presented directly, on each request, exactly as §5 specifies.

### 10.2 Authorization

Resource-scoped rather than role-scoped, because Phase I defines no roles:

- A client may act only on Analysis Sessions it created.
- A user may read only Analysis Sessions they own.
- No endpoint permits cross-user access.
- Rule distribution and intelligence lookup require authentication but no per-resource check.

### 10.3 Input Validation

Three stages, in order:

1. **Transport** — content type, size limits, well-formedness.
2. **Schema** — generated contract validation; unknown fields rejected, not ignored.
3. **Semantic** — cardinality bounds, referential existence, state validity.

Rejected outright at the boundary: any client-supplied finding, score, tier, capability set, effective weight or rule-set override. The evidence contract is the entire client input surface, and it contains observations only.

### 10.4 Output Validation

Responses are constructed from contract types, never serialised from ORM objects, preventing disclosure of columns added later.

### 10.5 Rate Limiting

| Surface | Basis | Rationale |
|---|---|---|
| Authentication | Per-account and per-IP, strict | Credential stuffing |
| Tier 2 submission | **Per source address** | The embedded credential identifies a build, not an installation (§10.1.1), so it cannot serve as a rate-limiting key. Gate frequency is bounded by design; a source exceeding it is malfunctioning or hostile |
| Evidence acquisition (indirect) | **Per source address**, separate quota | Each submission may trigger outbound fetches — an amplification surface, and the one that most requires bounding |
| Intelligence lookup | **Per source address** | Prefix enumeration |
| Dashboard queries | Per user | Enumeration and scraping |

### 10.6 CORS and CSRF

CORS: extension and dashboard origins allow-listed explicitly; wildcards prohibited.

CSRF: analysis endpoints are token-authenticated with no ambient credentials, so CSRF does not apply. Dashboard endpoints using cookie-based refresh require `SameSite=Strict` and a double-submit token on state-changing operations.

### 10.7 JWT Strategy

Asymmetric signing (EdDSA or RS256), so the verification key may be distributed without granting issuance. Short access tokens; rotating refresh tokens with reuse detection. Claims carry subject, principal type, issued-at, expiry and key identifier. Rotation uses an overlap window with `kid` selecting the verifying key. Symmetric signing is not used: it requires every verifier to hold the issuing key.

### 10.8 Session Management

Dashboard sessions are refresh-token-based with server-side revocation. **Analysis Sessions are not user sessions**; the analytical sense is always qualified in this document.

### 10.9 Encryption

TLS 1.3 in transit, including internal hops. At rest: managed volume encryption; credential material additionally hashed with a memory-hard KDF.

### 10.10 Audit Logging

Audit events are written to an append-only store, separate from application logs, with independent retention and access control: authentication outcomes, authorisation denials, rule-set version changes, integrity failures, promotion decisions, configuration changes, cross-user access attempts, **interventions presented, and user dispositions reported**.

### 10.11 Security Headers

Strict transport security, content-type options, frame options, referrer policy, and a restrictive content security policy on any served surface.

### 10.12 Trust Boundaries

| # | Boundary | Direction | Control |
|---|---|---|---|
| TB-1 | Extension → API | Untrusted → trusted | Authentication, full validation, rate limiting |
| TB-2 | Dashboard → API | Untrusted → trusted | Authentication, authorisation, CSRF |
| TB-3 | Application → Evaluation adapter | Trusted → trusted, process or runtime boundary | Local-only transport; never network-exposed |
| TB-4 | Backend → external resolvers | Trusted → untrusted | SSRF controls, deadlines, response caps |
| TB-5 | Backend → threat feeds | Trusted → untrusted | Signature and TLS verification, schema validation |
| TB-6 | Backend → AI provider *(II)* | Trusted → untrusted | No user identifiers transmitted; output never sole basis for Block |
| TB-7 | Client device ↔ backend | **Authentication History never crosses** | No endpoint accepts it |
| TB-8 | Client → backend, domain disclosure | **Gated twice** | §10.13.4 |

### 10.13 Privacy Architecture

Tier 2 gates fire predominantly on credential submission. Unconstrained backend evidence acquisition would therefore tell the backend, with high precision, which sites the user authenticates to — the most sensitive category of browsing data. The following controls are architectural, not configurable behaviour.

#### 10.13.1 Principle

> The backend learns the minimum necessary to improve a verdict, and learns nothing at all about routine authentication to well-known services.

#### 10.13.2 Complete trust-boundary inventory

| Data | Crosses? | Mechanism |
|---|---|---|
| Target Resource URL | **Conditionally** | Plaintext, only when both gates of §10.13.4 open |
| Registrable domain, client-initiated intelligence lookup | **Never in plaintext** | k-anonymity hash prefix |
| Registrable domain, backend acquisition-time intelligence lookup | Only where already disclosed | Occurs solely for domains disclosed under §10.13.4; no additional disclosure |
| Login form structure, field types, action domain | Yes | Structural description; no field values |
| Redirect chain | Yes | URLs in the chain |
| Script runtime observations | Yes | Behavioural flags; no script source |
| Login-interface fingerprint | **Never** | Client-local; feeds the Authentication Context module only |
| Authentication History Store | **Never** | Client-local, in any form including hashed or derived |
| Credential values, form inputs, cookies, tokens | **Never** | Never collected at all |
| Tier 0/1 evidence for navigations that never gate | **Never** | Deferred session materialisation (§2.4) |
| Tier 0/1 local evaluation results | **Never** | Discarded after rendering the passive indicator |

#### 10.13.3 What never leaves the client

The Authentication History Store; login-interface fingerprints; local evaluation results at any tier; and all evidence for the large majority of navigations, which never reach a Tier 2 gate.

#### 10.13.4 Two-gate acquisition policy

Backend DNS and TLS acquisition occurs **only when both conditions hold**.

**Gate 1 — Popularity allowlist, evaluated client-side.** A bundled list of the top *N* registrable domains ships with the extension and is evaluated locally. A domain on the list is never sent for acquisition. Routine authentication to major services therefore produces no backend domain disclosure at all.

**Gate 2 — Local risk threshold.** Acquisition is requested only where the client's local evaluation is not Low. A page unremarkable on local evidence is not escalated for infrastructure inspection.

The intersection — not well-known, and already locally suspicious — is the entire population about which the backend learns a domain.

Where either gate closes, affected evidence is `notCollected('policy_suppressed')`, affected rules are `unevaluable('required_evidence_not_collected')`, and the pass is marked degraded. Suppression is recorded, never silent.

**Protocol expression.** Both gates are evaluated **client-side**, and the client transmits the outcome as evidence rather than as a decision. The submission carries the affected observation fields already marked `notCollected('policy_suppressed')`. No field conveys the local tier, the allowlist membership, or the gate decision itself — BI-32 prohibits an endpoint accepting a client-supplied tier, and the suppression reason is the only signal that crosses.

The backend does not re-evaluate the gates. It observes that the fields were suppressed, records the capability gap, and does not attempt acquisition for them. A conformant client and a conformant backend therefore require no negotiation: the evidence shape carries the entire protocol.

#### 10.13.5 Threat intelligence lookup paths

Two lookup paths exist. They have different disclosure properties and must not be conflated.

**Client-initiated lookup — k-anonymous, always.**

1. The client computes a hash of the registrable domain.
2. The client transmits a **prefix only**, through the API Gateway.
3. The backend returns every intelligence entry in that prefix bucket.
4. The client performs the final match locally.

The backend learns a bucket containing many domains, never which one. This path runs on **every** Tier 2 gate, irrespective of the two-gate acquisition policy: intelligence is consulted far more often than acquisition occurs, and must not become the channel that leaks what §10.13.4 protects. Prefix length is an empirical parameter balancing bucket size against response payload.

**Backend acquisition-time lookup — plaintext, gated.**

Where both gates of §10.13.4 open, the backend already holds the plaintext domain. Evidence Acquisition may then query the Threat Intelligence Service directly for that domain. This introduces **no disclosure beyond what §10.13.4 already permits**, and k-anonymity would add nothing.

The distinction is exact: k-anonymity protects the population §10.13.4 shields. It is not a second control over the population §10.13.4 has already released.

#### 10.13.6 Allowlist governance

Bundled with the extension, versioned, digest-verified, updated with releases. Fetching it dynamically would leak exactly the information it exists to protect. Its size is an empirical parameter: larger lists give better privacy and marginally weaker coverage of attacks on popular-but-not-top-*N* domains.

#### 10.13.7 User disclosure

The extension states plainly, in user-facing documentation and in its privacy surface:

- Nothing is transmitted for ordinary browsing.
- At the moment credentials are about to be submitted, a download initiated, or a sensitive permission requested, security metadata about that page is sent for analysis.
- Well-known sites are excluded from domain disclosure entirely.
- Threat intelligence lookups use a partial hash; the exact site is not disclosed.
- Passwords, form values, cookies and page content are never transmitted.
- The authentication history used for impersonation detection never leaves the device, and is viewable and deletable.

#### 10.13.8 Reconciliation of divergent evidence

The backend resolves DNS and TLS from a datacenter address. Phishing infrastructure cloaks against such ranges, so backend-observed infrastructure may differ from what the user reached.

| # | Rule |
|---|---|
| **R-A** | Client-observed evidence is authoritative for the rendered page — DOM, forms, scripts, redirects as experienced. |
| **R-B** | Backend-observed evidence is authoritative for infrastructure the client cannot see — DNS records, certificate chain, reputation. |
| **R-C** | Where both observe the same field and disagree, both are retained, distinguished by collection context. Neither is discarded. |
| **R-D** | Divergence is recorded as an observation, not a finding. It is a plausible cloaking indicator; a rule reading it would modify `rules-v0.1`, which is frozen. |
| **R-E** | Divergence never silently changes a verdict. Any rule reading a divergent field reads the collector-appropriate value per R-A and R-B. |

### 10.14 Threat Mitigations

| Threat | Mitigation |
|---|---|
| Forged verdict submission | No endpoint accepts findings, scores or tiers |
| Evidence poisoning to force Allow | Evidence is observations only; scoring is backend-side under a versioned rule set |
| SSRF via evidence acquisition | Private ranges blocked, redirects bounded, size capped, dedicated egress |
| Rule-set tampering | Immutable releases, digest verification, fail-closed |
| Request replay | Idempotency keyed on `(sessionId, gateOrdinal)`; short token lifetimes |
| Cross-user data access | Resource-scoped authorisation; audit on denial |
| Credential stuffing | Strict rate limiting, uniform error, constant-time comparison |
| Browsing-history inference | Deferred materialisation; two-gate policy; k-anonymity |
| Authentication History exfiltration | Structurally impossible — no endpoint, schema or service exists |

### 10.15 Zero-Trust Assumptions

The client may be modified, its credential stolen, its evidence fabricated and its enforcement bypassed. None of these compromise other users. Backend authority is per-session and per-resource; a hostile client can misrepresent its own page and nothing else. Promotion of analytical output into shared intelligence is governed and never automatic on a single session, which prevents one hostile client from poisoning shared intelligence.

---

