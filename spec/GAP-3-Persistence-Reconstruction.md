# SecureSphere X — Persistence Architecture Specification

## GAP-3 Reconstruction: Missing Sections

**Reconstructs:** §12, §13, §14, §15, §31, §32, §33, §34, completion of §41, opening of §42
**Status:** **Ratified — Architecture Owner, Ruling R3 §6c.** These sections merge into the Persistence Architecture Specification (Revision 2), at which point this wrapper is discarded. Ratification covers the two New Decisions N-1 (lazy supersession timing) and N-2 (merge and split expressed through supersession); an open evidence-tagging defect is recorded at Audit Report §8.5 and does not affect the content ratified here.
**Rule:** No surviving architecture is modified. No aggregate, ownership, boundary, invariant or contract changes.

---

## Method and Evidence Classification

Every substantive statement carries a tag.

| Tag | Meaning |
|---|---|
| **[R]** | **Recovered** — directly supported by surviving text. Source cited. |
| **[I]** | **Inferred** — a logical consequence of surviving architecture. Supporting evidence cited. |
| **[N]** | **New Decision** — reconstruction impossible from evidence. Minimal, isolated, justified, and requiring ratification. |

Where more than one reading is available, the reading requiring the fewest new decisions is taken. Where uncertainty persists it is recorded in §A.2 rather than resolved by invention.

**Scope discipline.** §3 of the surviving specification prohibits implementation concerns from this document, naming among others *concurrency and locking*, physical schema, keys, indexes, and ORM mapping. Reconstruction honours that prohibition. Where the reconstruction brief requests such material — notably compare-and-swap semantics in §33 — the conceptual requirement is specified and the mechanism is delegated downstream, with the delegation stated explicitly.

---

# §12 Repository Interaction Principles

## 12.1 Purpose

This section defines how repositories interact across ownership boundaries. Ownership itself is defined in §9, governance in §10, and independence in §11; this section governs the interactions those sections permit. **[I]** — *the section sits between §11 Repository Independence and §13 Persistence Boundaries and is titled for interaction, so its subject is the mechanics of permitted interaction rather than the assignment of ownership.*

## 12.2 Repository Responsibility

A repository is responsible for the full lifecycle of its owned aggregates — creation, update, archival, and deletion where applicable — and for enforcing the boundary, reference and invariant rules defined for each aggregate it owns. **[R §8]**

A repository is not responsible for the internal consistency of aggregates it does not own. It may only read or reference them. **[R §8]**

## 12.3 Dependency Direction

Repository dependency SHALL be one-directional. Circular dependency between repositories is PROHIBITED. **[R §6]**

The dependency graph is `UIPR → SKR → TIR`. **[R §44, ADR-005]**

- UIPR MAY reference Security Knowledge managed by SKR. **[R §39]**
- SKR MAY reference Intelligence Objects managed by TIR. **[R §39]**
- TIR SHALL remain completely independent of SKR and UIPR. **[R §39]**

This graph governs ownership and reference direction only. It SHALL NOT be interpreted as execution order, request flow, analysis pipeline, or service orchestration. **[R §39]**

## 12.4 Permitted Interactions

The only permitted cross-repository interactions are: **[R §10]**

1. **Reading** an aggregate owned by another repository.
2. **Referencing by identifier** an aggregate owned by another repository.
3. **Publishing domain events**, if adopted in the future.

A repository referencing another repository's aggregate MUST treat it as read-only. **[R §38]**

## 12.5 Prohibited Interactions

| # | Prohibition | Source |
|---|---|---|
| 12.5.1 | A repository MUST NOT create, update, archive or delete an aggregate it does not own. | **[R §6]** |
| 12.5.2 | A repository MUST NOT own another repository's aggregates. | **[R §38]** |
| 12.5.3 | Ownership SHALL NOT be transferred, shared or duplicated across repositories. | **[R §10]** |
| 12.5.4 | Nested embedding of one aggregate inside another is PROHIBITED. | **[R §6]** |
| 12.5.5 | A repository MUST NOT be bypassed for the aggregates it owns. | **[R §7]** |
| 12.5.6 | A referential constraint MUST NOT be established across a repository boundary. | **[I]** — *§11 requires each repository to exist and evolve independently; a referential constraint spanning repositories would couple their evolution and contradict that requirement. §20 additionally requires all inter-aggregate association to be identifier reference, never containment.* |

## 12.6 Consistency and Transaction Boundaries

The **aggregate is the unit of consistency**; the **repository is the unit of persistence authority**. **[R §4]**

A unit of work SHALL NOT span repositories. **[I]** — *§6 prohibits cross-repository writes; a transaction spanning repositories would necessarily write across a boundary.*

Where a use case requires several aggregates owned by **one** repository to be committed atomically, the grouping of those aggregates into a single unit of work is an implementation concern and is delegated downstream. This specification requires only that every affected aggregate's invariants hold at commit. **[I]** — *§3 places concurrency, locking and transaction mechanics outside this document; §4 and §8 fix the conceptual requirement.*

## 12.7 Repository Isolation

Each repository SHALL be capable of existing and evolving independently within the limits of the dependency direction defined in §39. **[R §11]**

TIR SHALL be able to hold and evolve threat intelligence regardless of whether SecureSphere has performed any analysis. Threat intelligence existence is NOT conditioned on analytical activity. **[R §11, §36]**

## 12.8 Repository Interaction Invariants

- **RI-1** — Interaction across a repository boundary is read-only. **[R §38]**
- **RI-2** — Reference across a repository boundary is by identifier only. **[R §6, §20]**
- **RI-3** — The dependency graph is acyclic and one-directional. **[R §6, §44]**
- **RI-4** — No aggregate is owned by more than one repository. **[R §7, §44]**
- **RI-5** — A unit of work does not span repositories. **[I §12.6]**

---

# §13 Persistence Boundaries

## 13.1 Purpose

This section defines what this architecture persists, what it deliberately does not, and where the boundaries between mutable and immutable persistence, and between persistence and privacy, are drawn. **[I]** — *the section title and its position between repository interaction and identity establish its subject.*

## 13.2 Categories of Persisted Truth

SecureSphere X persists two categories of truth: **[R §5]**

**Current knowledge** — the platform's present belief about an entity. It is mutable in the sense that it is replaced as new evidence arrives, but it is never edited retroactively; it is only superseded going forward. **[R §5]**

**Historical record** — an immutable account of what was observed and concluded at a point in time. Once written, historical record SHALL NOT be edited or deleted. **[R §5]**

Knowledge Objects — Security Resource and Domain Entity — carry current knowledge. Analysis Sessions and Analysis History carry historical record. Intelligence Objects are governed independently of both, as externally or internally sourced threat context rather than SecureSphere's own conclusions. **[R §5]**

## 13.3 Persisted Information

| Persisted | Owning repository | Category | Source |
|---|---|---|---|
| Security Resource, with Resource Identity, Current Security State, Knowledge Metadata, Analysis History, Redirect Relationships | SKR | Mixed — see §13.5 | **[R §19, §22]** |
| Domain Entity, with Domain Identity, Domain Security State, Domain Knowledge Metadata | SKR | Current knowledge | **[R §19, §22]** |
| Analysis Session, with Security Evidence, Security Evaluations, Correlation Findings, Final Security Assessment | SKR | Historical record | **[R §19, §26]** |
| Report metadata | SKR | Historical record | **[R §28]** |
| Intelligence Object, with Indicator, Source, Confidence, Validity, Metadata | TIR | Independently governed | **[R §19, §27]** |
| Threat Feed Records, IOC Collections, Threat Sources, Reputation Data | TIR | Independently governed | **[R §9]** |
| User, with Authentication, MFA, Preferences, Saved Analysis References, Notification Settings | UIPR | Current knowledge | **[R §29]** |
| Normalization Policy versions | SKR | Immutable once released | **[R §16, §40]** |

## 13.4 Information Not Persisted by This Architecture

Information not owned by an aggregate enumerated in §18 is not persisted by this architecture. **[I]** — *§7 states no repository SHALL be bypassed for the aggregates it owns, and §18 enumerates aggregate ownership exhaustively; information outside that enumeration has no owning repository and therefore no persistence authority.*

Specifically excluded:

- **Authentication History**, in any form including hashed, aggregated or derived. It is client-local and never transmitted off-device. It has no owning aggregate, no owning repository, and no place in this architecture. **[I]** — *established by the frozen Rule Engine Specification §20.2, which the reconstruction brief names authoritative.*
- Runtime execution state, request context and orchestration state. **[I]** — *§39 places runtime execution flow entirely outside this specification.*
- Analytical algorithm parameters, including the models, weighting strategies, statistical methods, confidence calculations and scoring algorithms used to compute Domain Security State. **[R §35]**
- Physical, deployment and infrastructure concerns. **[R §3]**

## 13.5 Mutable and Immutable Persistence

The boundary between mutable and immutable persistence runs **inside** the Security Resource aggregate, not around it. **[I]** — *§22 composes Security Resource from five elements; §44 declares Current Security State replaceable while Analysis History and Knowledge Metadata are not.*

| Element | Mutability | Source |
|---|---|---|
| Resource Identity | Immutable for the aggregate's lifetime | **[R §4, §44]** |
| **Current Security State** | **Replaceable** — replaced wholesale, never edited retroactively | **[R §5, §44]** |
| Knowledge Metadata | Accumulates only; never overwritten | **[R §21, §44]** |
| Analysis History | Append-only; entries never edited or deleted | **[R §21, §44]** |
| Redirect Relationships | Composed of immutable directional link records | **[R §22, §23]** |
| Analysis Session, once finalised | Immutable | **[R §6, §21]** |
| Released Normalization Policy version | Immutable | **[R §6, §16]** |

## 13.6 Privacy Boundary

The persistence boundary is also a privacy boundary. Two rules follow from the surviving architecture:

- **PB-1** — Legitimate browsing activity is not retained for profiling. **[I]** — *established by the frozen Project Vision, which the brief names authoritative.*
- **PB-2** — Information the platform has committed never to transmit off-device cannot acquire an owning repository. Persisting it would require transmission, which is prohibited. **[I]** — *Rule Engine Specification §20.2.*

## 13.7 Persistence Boundary Invariants

- **PBI-1** — Every persisted item has exactly one owning repository. **[R §7, §44]**
- **PBI-2** — Current knowledge is replaced, never retroactively edited. **[R §5]**
- **PBI-3** — Historical record is never edited or deleted. **[R §5, §6]**
- **PBI-4** — Information with no owning aggregate is not persisted. **[I §13.4]**

---

# §14 Canonical Identity Model

> This is the authoritative identity model for SecureSphere X persistence. It is the highest-priority reconstruction: Resource Identity is referenced by every analytical artifact in SKR.

## 14.1 Purpose

This section defines how identity is assigned to Knowledge Objects, how it is derived from raw resource references, and under what conditions it changes. **[I]** — *§4 requires deterministic, stable identity; §16 defines the normalization that produces it; §30 references identity-level rules defined here; the section title is explicit.*

## 14.2 Two-Tier Identity

Identity is modelled at two tiers — **Security Resource** and **Domain Entity** — both independent, deterministic Knowledge Objects. **[R ADR-002]**

| Tier | Represents | Identity descriptor |
|---|---|---|
| Security Resource | One canonical, normalized web resource | Resource Identity **[R §17, §19]** |
| Domain Entity | One FQDN's accumulated, domain-level knowledge | Domain Identity **[R §17, §19]** |

The tiers are independent. Domain Entity exists independently of any individual Security Resource beneath it. **[R §25]**

Both Resource Identity and Domain Identity are **value objects** — defined entirely by their attributes, immutable once created, and without an independent lifecycle of their own — carried by their respective aggregate roots. **[R §23]**

## 14.3 Canonical Identifiers

**Resource Identity** is the canonical identifier of one normalized web resource. **[R §17, §23]**

It SHALL be **deterministic**: the same raw resource reference, canonicalized under the same Normalization Policy version, SHALL always yield the same Resource Identity. **[R §4, §16]**

**Domain Identity** is the canonical identifier of one FQDN. **[R §17, p.7]**

## 14.4 Normalization and Canonicalization

Resource Identity is produced by **identity normalization** — the policy by which raw, incoming resource references are canonicalized into a single deduplicated Security Resource identity. **[R §16]**

This is distinct from relational normalization, which is a downstream logical-design activity and out of scope. **[R §16]**

A Normalization Policy SHALL be versioned. A released version is immutable and SHALL NOT be edited after release. Any change to normalization behaviour REQUIRES a new version. **[R §16, §40]**

Prior versions SHALL remain available for reference, so that the normalization behaviour applied to any existing Security Resource at any point in time remains reconstructable. **[R §40]**

**Every Resource Identity SHALL therefore be attributable to the Normalization Policy version under which it was derived.** **[I]** — *§40 requires the normalization behaviour applied to any existing Security Resource to remain reconstructable; reconstruction requires knowing which version was applied. ADR-006 states the same requirement as its consequence.*

## 14.5 Aliases

A Normalization Policy canonicalizes raw resource references into a **single deduplicated** Security Resource identity. **[R §16]**

It follows that **many raw resource references may resolve to one Resource Identity**. Those references are aliases of the canonical identity. **[I]** — *deduplication is meaningless unless multiple distinct inputs converge on one output.*

Aliases are a **property of the normalization function, not of the aggregate**. This architecture does not require an alias set to be persisted: any raw reference can be canonicalized on demand under a stated policy version. **[I]** — *the fewest-decisions reading. §22 composes Security Resource from five elements and an alias set is not among them; introducing one would alter the composition, which reconstruction may not do.*

## 14.6 Identity Assignment

A Security Resource acquires its Resource Identity at creation, by canonicalizing the raw resource reference that triggered creation under the then-current Normalization Policy version. **[I]** — *§30 places Created as the first lifecycle state; §16 defines canonicalization as the mechanism by which identity is produced; §4 requires identity to be stable from creation.*

A Domain Entity acquires its Domain Identity from the FQDN it represents. **[R §17, §25]**

## 14.7 Identity Stability

Identity SHALL be deterministic and SHALL remain stable across an aggregate's entire lifecycle, **including supersession**. **[R §4, §44]**

An aggregate's identity is therefore never rewritten. Where a resource must be represented under a different canonical identity, the existing aggregate is **superseded** by a new one; it is not re-identified. **[I]** — *§4 requires stability including supersession, and §44 states a superseded Security Resource retains its identity; both are contradicted by re-identification.*

## 14.8 Supersession

Supersession is the sole mechanism by which the canonical identity representing a resource changes. **[I §14.7]**

**Trigger.** A change of Normalization Policy version may cause a raw resource reference to canonicalize to a different Resource Identity than an existing Security Resource holds. Where that occurs, the existing Security Resource is superseded. **[I]** — *ADR-006 records as its consequence that versioned, immutable normalization policy "supports the supersession model (Section 15) when policy versions change"; §16 states that changing normalization behaviour requires a new version.*

**Guarantees.** A superseded Security Resource SHALL retain its identity, history, metadata and references. It SHALL NOT be deleted. **[R §30, §44]**

**Timing.** **[N-1 — New Decision, requires ratification]** Supersession occurs **lazily**: when a raw reference is canonicalized under the current Normalization Policy version and yields an identity differing from that of an existing Security Resource for the same reference.

*Justification.* The surviving text establishes that supersession exists, what triggers it, and what it guarantees, but not when it is evaluated. Two readings are possible: eager re-canonicalization of every existing Security Resource on policy release, or lazy evaluation on next observation. The lazy reading requires no bulk operation, introduces no new lifecycle state, and is consistent with §30's marking of Superseded as *optional* — a state some Security Resources never reach. The eager reading would require a migration process this specification does not describe. **This is the minimal new decision in the reconstruction and the one most in need of ratification.**

## 14.9 Merge and Split

**[N-2 — New Decision, requires ratification]** Merge and split are not distinct operations. Where a Normalization Policy change causes two previously distinct references to converge on one identity, or one reference to diverge into two, the outcome is expressed entirely through supersession as defined in §14.8.

*Justification.* The surviving text names supersession as an identity transition and names no other. Introducing merge and split as first-class operations would add lifecycle states beyond those enumerated in §30, which reconstruction may not do. Expressing them through supersession requires no new state and no new guarantee: in every case the prior Security Resource is superseded and retained with its identity and history intact.

## 14.10 Domain Identity

**A Domain Identity has no supersession concept: an FQDN is re-assessed over time, but SHALL NOT be superseded by another domain identity.** **[R — verbatim, surviving fragment, p.7]**

Domain Entities SHALL NOT be superseded. **[R §30]**

Domain Entity SHALL remain a small aggregate for the life of the system. Allowing it to absorb URLs, history, reports or intelligence would recreate a domain-centric model that has been rejected, and is PROHIBITED. **[R §25]**

## 14.11 Relationship with Analysis Sessions

An Analysis Session references its Security Resource **by identifier only**. **[R §20, §26]**

Because Resource Identity is stable across supersession, an Analysis Session recorded against a Security Resource remains correctly attributed after that resource is superseded. **[I]** — *§4 and §44 guarantee identity stability; §30 guarantees a superseded resource retains its references.*

## 14.12 Relationship with Current Security State

Current Security State is a component of the Security Resource aggregate and is scoped to its Resource Identity. **[R §19, §22]**

A superseded Security Resource retains its Current Security State as at the moment of supersession. It is not carried forward to the superseding resource. **[I]** — *§44 states a superseded Security Resource retains its identity and history; §5 states current knowledge is never edited retroactively. Copying state forward would attribute one resource's belief to another identity.*

## 14.13 Repository Ownership

Security Resource and Domain Entity are owned by SKR. **[R §9, §18]**

Resource Identity and Domain Identity are value objects carried by their aggregate roots and have no independent ownership. **[R §23]**

## 14.14 Identity Invariants

| # | Invariant | Source |
|---|---|---|
| **II-1** | Identity is deterministic. | **[R §4]** |
| **II-2** | Identity is stable across the full aggregate lifecycle, including supersession. | **[R §4, §44]** |
| **II-3** | Identity is never rewritten; a differing canonical identity is reached only by supersession. | **[I §14.7]** |
| **II-4** | A superseded Security Resource retains its identity, history, metadata and references, and is not deleted. | **[R §30, §44]** |
| **II-5** | Domain Identity is never superseded. | **[R p.7, §30]** |
| **II-6** | Every Resource Identity is attributable to the Normalization Policy version that produced it. | **[I §14.4]** |
| **II-7** | Many raw references may resolve to one Resource Identity; one raw reference resolves to exactly one, under a stated policy version. | **[R §16]**, **[I §14.5]** |
| **II-8** | Identity descriptors are value objects, immutable once created. | **[R §23]** |

---

# §15 Identity Lifecycle

## 15.1 Security Resource Lifecycle

```
Created ──► Active ──► Updated ──► Superseded (optional) ──► Retained Permanently
              ▲            │
              └────────────┘
```

**[R §30 — states verbatim]**

| State | Meaning | Source |
|---|---|---|
| **Created** | The aggregate exists; Resource Identity assigned by canonicalization. | **[R §30]**, **[I §14.6]** |
| **Active** | The aggregate is the current canonical representation of its resource. | **[R §30]** |
| **Updated** | Current Security State replaced, Knowledge Metadata accumulated, or Analysis History appended. Returns to Active. | **[R §30]**, **[I]** — *§44 and §21 define these as the only permitted modifications.* |
| **Superseded** | Optional. A differing canonical identity now represents the resource. | **[R §30]**, **[I §14.8]** |
| **Retained Permanently** | The aggregate persists indefinitely. Deletion is prohibited. | **[R §30, §6]** |

## 15.2 Domain Entity Lifecycle

```
Created ──► Updated ──► Retained
              ▲   │
              └───┘
```

**[R §30]**

Domain Entities SHALL NOT be superseded. **[R §30]** A Domain Identity has no supersession concept: an FQDN is re-assessed over time, but SHALL NOT be superseded by another domain identity. **[R p.7]**

## 15.3 Transitions

| From | To | Trigger | Source |
|---|---|---|---|
| — | Created | First canonicalization of a raw reference yielding an unrepresented identity | **[I §14.6]** |
| Created | Active | Aggregate available as canonical representation | **[R §30]** |
| Active | Updated | State replacement, metadata accumulation, or history append | **[I]** |
| Updated | Active | Modification complete | **[R §30]** |
| Active / Updated | Superseded | Canonicalization under the current policy version yields a differing identity | **[I §14.8]**, **[N-1]** |
| Any | Retained Permanently | Terminal; reached by every Security Resource | **[R §30]** |

## 15.4 Prohibited Transitions

| # | Prohibition | Source |
|---|---|---|
| 15.4.1 | Superseded SHALL NOT return to Active. | **[I]** — *§4 requires identity stability; reactivation would mean two aggregates simultaneously representing one canonical identity.* |
| 15.4.2 | No state SHALL transition to deletion. | **[R §6, §30, §44]** |
| 15.4.3 | Identity SHALL NOT be reassigned in any transition. | **[R §4, §44]** |
| 15.4.4 | A Domain Entity SHALL NOT transition to Superseded. | **[R §30, p.7]** |
| 15.4.5 | Analysis History SHALL NOT be detached from a superseded Security Resource. | **[R §30, §44]** |

## 15.5 Archival and Restoration

**Archival** is a retention state, not a removal. A Security Resource in Retained Permanently remains addressable by its Resource Identity and retains its history, metadata and references. **[I]** — *§30 names the terminal state "Retained Permanently"; §6 prohibits deletion of Analysis History and finalized Analysis Sessions; §44 states a superseded resource is not deleted.*

**Restoration is not a defined transition.** Because nothing is deleted or made unaddressable, there is no state from which restoration would be required. **[I]** — *the fewest-decisions reading; introducing restoration would require a removal state the surviving text does not define.*

## 15.6 Governance

Any change to identity assignment, supersession semantics, or the lifecycle states above constitutes an architecture-level change and REQUIRES the review process defined in §43. **[R §43]**

Informal or incremental architectural drift is PROHIBITED. **[R §43]**

---

# §31 Knowledge Lifecycle

## 31.1 Purpose

This section defines how knowledge held by Knowledge Objects evolves. **[I]** — *§41 defines Knowledge Object as a persistent aggregate storing the platform's current understanding; §5 establishes current knowledge as a category of persisted truth.*

## 31.2 The Three Constructs

Current knowledge is modelled as **three distinct constructs**: **[R ADR-004]**

| Construct | Mutability | Purpose | Source |
|---|---|---|---|
| **Current Security State** | Replaceable | The platform's present belief | **[R ADR-004, §44]** |
| **Knowledge Metadata** | Accumulating; never overwritten | Retained context across analyses | **[R ADR-004, §21]** |
| **Analysis History** | Immutable, append-only | The historical record | **[R ADR-004, §21]** |

This model was adopted because a pure "latest result" policy risks erasing historical risk signal, while a pure "historical consensus" policy risks masking genuine recent change. **[R ADR-004]**

## 31.3 Knowledge Creation

Knowledge is created when a Security Resource or Domain Entity is created. A Knowledge Object exists from creation with an identity and an initial state. **[I §14.6]**

## 31.4 Knowledge Enrichment and Refinement

Enrichment occurs through three mechanisms, and only these three: **[I]** — *ADR-004 and §44 enumerate three constructs with three distinct mutability rules; no fourth mechanism is defined.*

1. **Replacement** of Current Security State. **[R §44]**
2. **Accumulation** into Knowledge Metadata. **[R §21, §44]**
3. **Appending** to Analysis History. **[R §21]**

No mechanism overwrites or removes previously established knowledge. **[R §21, §44]**

## 31.5 Promotion

Promotion is the elevation of SecureSphere's own analytical output — a Correlation Finding or Security Assessment produced within an Analysis Session — into a reusable Intelligence Object, once it meets the governance criteria for promotion. **[R §37]**

Promotion is a one-directional, governed transition from SKR-owned analytical output into a TIR-owned Intelligence Object. A promoted Intelligence Object SHALL reference its originating Analysis Session by identifier only; it MUST NOT embed the session. **[R §37]**

**Promotion does not alter the originating knowledge.** The Analysis Session and its Security Resource are unaffected. **[I]** — *§6 and §21 make finalized Analysis Sessions immutable; §26 states a completed session SHALL NOT be altered.*

## 31.6 Supersession of Knowledge

Where a Security Resource is superseded (§14.8), the knowledge it holds is retained as at the moment of supersession and is not carried forward. **[I §14.12]**

## 31.7 Archival and Retirement

Knowledge Objects are retained permanently and are not retired. **[R §30, §6]**

Retirement applies to Intelligence Objects, which are governed by TIR independently. A retired Intelligence Object preserves historical references and is not deleted. **[R §30]**

---

# §32 Knowledge Update Policy

## 32.1 The Append-Only Principle

Two of the three knowledge constructs are strictly non-destructive: **[R §21, §44]**

- **Knowledge Metadata SHALL only accumulate; it SHALL NOT be overwritten.** **[R §21]**
- **Analysis History is append-only; entries SHALL NOT be edited or deleted.** **[R §21]**

## 32.2 Update Policy by Construct

| Construct | Permitted operation | Prohibited | Source |
|---|---|---|---|
| Current Security State | Replace wholesale | Retroactive edit; partial mutation | **[R §5, §44]** |
| Knowledge Metadata | Accumulate | Overwrite; remove | **[R §21, §44]** |
| Analysis History | Append | Edit; delete; reorder | **[R §21, §6]** |
| Resource Identity | None | Any modification | **[R §4, §44]** |
| Redirect Relationships | Append immutable link records | Edit; delete | **[R §22, §23]** |

## 32.3 Evidence Accumulation

Each completed Analysis Session contributes an immutable Analysis Reference entry to the Security Resource's Analysis History. **[R §22, §23]**

Accumulation is monotonic: the record grows and never contracts. **[I §32.1]**

## 32.4 Confidence Evolution

Confidence and Validity are first-class governed attributes of Intelligence Objects, distinct from any Security Resource or Domain Entity they may reference. **[R §36]**

Confidence evolution is therefore a TIR concern and is governed independently of SKR knowledge update. **[R §36]** SKR knowledge constructs do not carry confidence. **[I]** — *§22 composes Security Resource and Domain Entity without a confidence element; §23 lists Confidence among Intelligence Object attributes only.*

## 32.5 Promotion Policy

Promotion is governed as defined in §37 and §31.5. It is one-directional and does not modify the originating analytical output. **[R §37]**, **[I §31.5]**

## 32.6 Version Compatibility

A released Normalization Policy version is immutable; behavioural change requires a new version; prior versions remain available. **[R §16, §40]**

Knowledge established under an earlier policy version remains valid and is not re-derived. Where a policy change causes a differing canonical identity, the mechanism is supersession (§14.8), not retroactive update. **[I]** — *§5 prohibits retroactive editing of current knowledge; §40 requires historical behaviour to remain reconstructable, which retroactive re-derivation would defeat.*

## 32.7 Replay Implications

Because Analysis History is append-only and Analysis Sessions are immutable once finalized, the analytical record supporting any historical conclusion remains reconstructable. **[R §6, §21, §26]**

**Replay reads the historical record. It does not read Current Security State.** **[I]** — *Current Security State is replaceable (§44) and therefore does not describe any past moment; the historical record is immutable and does so by construction. Reconstructing a past conclusion from a replaceable construct would be unsound.*

## 32.8 Mutation Rules

- **MR-1** — Exactly one construct in the knowledge model is replaceable: Current Security State. **[R §44]**
- **MR-2** — No construct is edited in place. Replacement is wholesale; accumulation and appending add without altering. **[R §5, §21]**
- **MR-3** — No knowledge is removed. **[R §6, §30]**

---

# §33 Current Security State Governance

> The Revision 2 change log records that this section was strengthened. This reconstruction restores it to the specificity the surrounding architecture requires.

## 33.1 Definition

**Current Security State is the platform's present belief about one Security Resource.** **[R §5, §41]**

It is a component of the Security Resource aggregate, scoped to that resource's Resource Identity. **[R §19, §22]**

## 33.2 Ownership

Owned by SKR, as a component of the Security Resource aggregate. It has no independent ownership and no independent lifecycle. **[R §9, §18, §19]**

## 33.3 Mutability

Current Security State is **replaceable**. **[R §44]**

Precisely: **[R §5]**

- It is mutable in the sense that it is **replaced as new evidence arrives**.
- It is **never edited retroactively**.
- It is **only superseded going forward**.

Replacement is **wholesale**. A partial mutation would constitute retroactive editing of the portion left in place. **[I]** — *§5 prohibits retroactive editing; a partial update leaves unreplaced elements attributed to a moment they no longer describe.*

## 33.4 Lifecycle

Current Security State exists from the creation of its Security Resource and persists for that resource's lifetime, including after supersession. **[I §14.12, §31.6]**

It has no independent lifecycle states. Its transitions are replacements, each corresponding to an Updated transition of the owning Security Resource. **[I §15.1]**

## 33.5 Relationship with Analysis History

Analysis History is the **immutable record**; Current Security State is the **current belief derived from it**. **[R ADR-004]**

The two are complementary by design: this hybrid model exists because a latest-result-only policy risks erasing historical risk signal, while a historical-consensus-only policy risks masking genuine recent change. **[R ADR-004]**

**Analysis History is authoritative for what occurred. Current Security State is authoritative for what the platform presently believes.** Where they appear to disagree, Analysis History governs, because it is immutable and Current Security State is not. **[I]** — *§5 designates historical record as the immutable account of what was observed and concluded; §44 designates Current Security State replaceable.*

## 33.6 Relationship with Replay

Replay reconstructs a past conclusion from the immutable historical record. **It does not read Current Security State, and Current Security State is never an input to replay.** **[I §32.7]**

It follows that replacing Current Security State can never alter a replay result. **[I]** — *this is the property that makes the replaceable construct safe to hold alongside a determinism guarantee.*

## 33.7 Relationship with Security Resources

One Security Resource has exactly one Current Security State. **[R §22]**

A superseded Security Resource retains its Current Security State as at supersession; it is not carried forward to the superseding resource. **[I §14.12]**

## 33.8 Governance of Replacement

Replacement is governed by three requirements. Each is conceptual; the mechanism is delegated downstream.

| # | Requirement | Source |
|---|---|---|
| **CSG-1** | Replacement is **atomic**. A Current Security State is never observable in a partially replaced condition. | **[I §33.3]** — *wholesale replacement is unachievable if a partial condition is observable.* |
| **CSG-2** | Replacement is **traceable**. Every Current Security State is attributable to the analytical record that produced it. | **[I]** — *§40 and ADR-006 establish reconstructability as a governing property; a state of unknown provenance is not reconstructable.* |
| **CSG-3** | Replacement is **forward-only**. State is superseded going forward and never retroactively revised. | **[R §5]** |

**Delegation.** §3 places concurrency and locking outside this specification. The concurrency-control mechanism realising CSG-1 — including optimistic concurrency, version comparison, and compare-and-swap semantics — is therefore an implementation concern, specified downstream in the Backend Architecture and the Logical Database Design. This specification fixes the requirement; it does not prescribe the mechanism. **[R §3]**

## 33.9 Invariants

| # | Invariant | Source |
|---|---|---|
| **CSI-1** | Current Security State is the only replaceable construct in the knowledge model. | **[R §44]** |
| **CSI-2** | It is replaced wholesale, never edited in place. | **[R §5]**, **[I §33.3]** |
| **CSI-3** | It is never revised retroactively. | **[R §5]** |
| **CSI-4** | It is never an input to replay. | **[I §33.6]** |
| **CSI-5** | Analysis History governs where the two appear to disagree. | **[I §33.5]** |
| **CSI-6** | One Security Resource has exactly one Current Security State. | **[R §22]** |
| **CSI-7** | It is not carried forward across supersession. | **[I §14.12]** |

---

# §34 Analysis History Governance

## 34.1 Definition and Composition

Analysis History is a component of the Security Resource aggregate, composed of individual **Analysis Reference** entries, each an immutable pointer to one Analysis Session. **[R §22]**

Analysis Reference is a value object — defined entirely by its attributes, immutable once created, without an independent lifecycle. **[R §23]**

## 34.2 Append-Only Guarantee

Analysis History is append-only. Entries SHALL NOT be edited or deleted. **[R §21]**

Editing or deleting Analysis History is PROHIBITED. **[R §6]**

## 34.3 Evidence Linkage

Each Analysis Reference points to exactly one Analysis Session. **[R §22]**

An Analysis Session owns the complete analytical record of one execution: Security Evidence, Security Evaluations, Correlation Findings, and Final Security Assessment. Once finalized it is immutable and SHALL NOT be altered or deleted. **[R §26]**

**The linkage is therefore complete and permanent**: from a Security Resource, every analysis ever performed against it is reachable, and each reached session retains its full evidentiary basis. **[I]** — *§22 makes each entry a pointer to a session; §26 makes each session immutable and complete; §21 makes the collection append-only.*

## 34.4 Replay Guarantee

Because entries are never removed and sessions are never altered, the analytical basis of any historical conclusion remains reconstructable indefinitely. **[R §6, §21, §26]**

This is the guarantee on which replay determinism rests at the persistence layer. **[I §32.7]**

## 34.5 Audit Guarantee

Analysis History is the auditable record of what the platform observed and concluded, and when. Its immutability is what makes it evidence rather than assertion. **[R §5]**, **[I]** — *§5 designates historical record as an immutable account of what was observed and concluded at a point in time.*

## 34.6 Ordering

Analysis Reference entries are ordered by the completion of the Analysis Sessions they reference. **[I]** — *§26 defines an Analysis Session as one execution of the analysis engine, immutable once finalized; a reference cannot precede the session it points to.*

Ordering is stable, because entries are never edited, deleted or reordered. **[R §21]**

## 34.7 Retention

Analysis History is retained permanently. **[R §30, §6]**

**There is no retention limit and no expiry.** **[I]** — *§6 prohibits deletion; §30 places Security Resource in Retained Permanently; §44 states a superseded Security Resource retains its history and is not deleted. A retention limit would require deletion, which is prohibited.*

## 34.8 Deletion Policy

**Deletion of Analysis History is prohibited. No deletion policy exists at this architectural level.** **[R §6, §21]**

Where an operational or regulatory requirement demands removal of information, satisfying it would constitute an architecture-level change requiring the process defined in §43. It cannot be accommodated within the current architecture. **[I]** — *§6, §21 and §44 prohibit deletion without exception; §43 governs changes to such rules.* **This is recorded as an unresolved ambiguity in §A.2.**

## 34.9 Consistency Requirements

- **AHC-1** — Every Analysis Reference points to an Analysis Session that exists and is finalized. **[I §34.3]**
- **AHC-2** — No Analysis Session is referenced by an Analysis History other than that of its own Security Resource. **[I]** — *§26 states an Analysis Session may reference Security Resource; §20 makes association by identifier; a session belongs to one resource.*
- **AHC-3** — Analysis History contains no duplicate entries for one Analysis Session. **[I]** — *the entry is an immutable pointer; a duplicate would carry no additional information and would corrupt count-based metadata.*

## 34.10 Invariants

| # | Invariant | Source |
|---|---|---|
| **AHI-1** | Append-only. | **[R §21, §44]** |
| **AHI-2** | Entries are immutable value objects. | **[R §23]** |
| **AHI-3** | Never edited, deleted or reordered. | **[R §6, §21]** |
| **AHI-4** | Retained permanently; no expiry. | **[I §34.7]** |
| **AHI-5** | Retained through supersession. | **[R §30, §44]** |
| **AHI-6** | Authoritative over Current Security State where they appear to disagree. | **[I §33.5]** |

---

# §41 Ubiquitous Language — Completion

Four entries survive. The following complete the glossary, each defined from surviving usage.

| Term | Definition | Source |
|---|---|---|
| **Security Resource** | The primary analytical entity representing one canonical, normalized web resource. | **[R §41 — surviving]** |
| **Domain Entity** | The FQDN-level entity representing accumulated domain knowledge, independent of individual resources beneath it. | **[R §41 — surviving]** |
| **Knowledge Object** | A persistent aggregate that stores the platform's current understanding of an entity. Security Resource and Domain Entity are both Knowledge Objects. | **[R §41 — surviving]** |
| **Analysis Session** | One immutable execution of the analysis engine. | **[R §41 — surviving]** |
| **Resource Identity** | The deterministic canonical identifier of one Security Resource, produced by identity normalization. A value object carried by the aggregate root. | **[R §23]**, **[I §14.3]** |
| **Domain Identity** | The canonical identifier of one FQDN. A value object carried by the Domain Entity root. Never superseded. | **[R §23, p.7]** |
| **Current Security State** | The platform's present belief about one Security Resource. The only replaceable construct in the knowledge model. | **[R §5, §44]** |
| **Knowledge Metadata** | Accumulated context retained across analyses of one Knowledge Object. Accumulates only; never overwritten. | **[R §21, §22]** |
| **Analysis History** | The append-only record of every analysis performed against one Security Resource, composed of Analysis Reference entries. | **[R §21, §22]** |
| **Analysis Reference** | An immutable pointer entry within Analysis History, referencing one Analysis Session. A value object. | **[R §23]** |
| **Redirect Relationship** | An immutable directional link record within a Security Resource's Redirect Relationships. A value object. | **[R §23]** |
| **Intelligence Object** | One unit of externally sourced or internally promoted threat intelligence. Owned by TIR. | **[R §17, §27]** |
| **Report** | Metadata describing a generated report, referencing the Analysis Session it summarizes. Contains no analytical content. | **[R §17, §28]** |
| **User** | The identity and personalization record for one platform user. Owned by UIPR. | **[R §17, §29]** |
| **Normalization Policy** | The versioned, immutable-once-released policy by which raw resource references are canonicalized into a single deduplicated Security Resource identity. | **[R §16]** |
| **Identity Normalization** | Canonicalization of raw incoming resource references into one Security Resource identity. Distinct from relational normalization. | **[R §16]** |
| **Supersession** | The sole mechanism by which the canonical identity representing a resource changes. The superseded aggregate retains its identity, history, metadata and references and is not deleted. | **[R §30, §44]**, **[I §14.8]** |
| **Promotion** | The one-directional, governed elevation of SKR analytical output into a TIR-owned Intelligence Object. | **[R §37]** |
| **Security Knowledge Repository (SKR)** | The repository with authority over analytical knowledge: resources, domains, analysis, and derived report metadata. | **[R §7]** |
| **Threat Intelligence Repository (TIR)** | The repository with authority over threat intelligence, independent of whether any analysis has occurred. | **[R §7]** |
| **User Identity & Personalization Repository (UIPR)** | The repository with authority over user identity, authentication, and personalization. | **[R §7]** |
| **Current Knowledge** | The platform's present belief about an entity. Replaced as new evidence arrives; never edited retroactively. | **[R §5]** |
| **Historical Record** | An immutable account of what was observed and concluded at a point in time. Never edited or deleted once written. | **[R §5]** |

---

# §42 Architecture Decision Record — Opening

## ADR-001 — Repository Partitioning

**Context.** Persistence authority across a system holding analytical knowledge, threat intelligence and user identity required a partitioning that prevented duplicate ownership and allowed each concern to evolve on its own schedule. **[I]** — *reconstructed from the recorded Consequences and from §7, which partitions authority across three repositories each described as the exclusive steward of a cluster of aggregates.*

**Decision.** Persistence authority SHALL be partitioned across three repositories — the Security Knowledge Repository, the Threat Intelligence Repository, and the User Identity & Personalization Repository — each the exclusive steward of a cluster of aggregates. No aggregate SHALL be owned by more than one repository, and no repository SHALL be bypassed for the aggregates it owns. **[R §7]**

**Alternatives Considered.** A single unified repository holding all aggregates; per-aggregate repositories without clustering. **[I]** — *reconstructed as the alternatives the recorded Consequences discriminate against: a single repository forfeits independent evolution, and per-aggregate repositories forfeit stable aggregate boundaries.* **Marked as inferred: the surviving text does not record ADR-001's alternatives.**

**Status.** Ratified. **[I]** — *every surviving ADR carries this status, and §1 declares the architecture ratified.*

**Consequences.** **Independent repository evolution; no duplicate ownership; stable aggregate boundaries.** **[R — verbatim, surviving fragment, p.17]**

## ADR-002 through ADR-007

Survive intact in the specification and are unaffected by this reconstruction. **[R]**

## Proposed ADR — Supersession Timing

**Requires ratification. Not presented as recovered architecture.**

**Context.** §14.8 establishes that a Normalization Policy version change may cause a raw reference to canonicalize to a different Resource Identity, and that the existing Security Resource is then superseded. The surviving text does not record when that evaluation occurs.

**Proposed Decision.** Supersession SHALL be evaluated lazily, on canonicalization of a raw reference under the current policy version. **[N-1]**

**Alternatives.** Eager re-canonicalization of all existing Security Resources on policy release.

**Status.** **Proposed. Not ratified.**

**Consequences if adopted.** No bulk migration on policy release; Superseded remains an optional state some resources never reach; a Security Resource may remain Active under a superseded policy version until next observed.

---

# Appendix A — Validation Audit

## A.1 Audit Results

| # | Check | Result |
|---|---|---|
| 1 | No contradictions with surviving text | **Pass.** Every reconstructed statement is tagged and traced. No statement contradicts a surviving section. |
| 2 | Terminology consistent | **Pass.** §41 completion introduces no term not already used in surviving text. |
| 3 | Repository ownership unambiguous | **Pass.** §12 and §13 restate §9 and §18 without alteration. |
| 4 | Aggregate ownership unchanged | **Pass.** No aggregate added, removed, merged, split or reassigned. |
| 5 | Replay remains deterministic | **Pass.** §32.7 and §33.6 establish that replay reads the immutable historical record and never Current Security State, so the one replaceable construct cannot affect a replay result. |
| 6 | Current Security State fully specified | **Pass**, within scope. §33 specifies definition, ownership, mutability, lifecycle, and its relationships with Analysis History, replay and Security Resources, and states three governance requirements. The concurrency mechanism is delegated per §3. |
| 7 | Canonical Identity completely specified | **Pass**, with one proposed decision. §14 specifies derivation, assignment, stability, aliases, supersession, merge and split, both tiers, versioning and ownership. Supersession *timing* is **N-1**, proposed. |
| 8 | Persistence boundaries internally consistent | **Pass.** §13.5 places the mutable/immutable boundary inside the Security Resource aggregate, consistent with §22 and §44. |
| 9 | Backend Architecture unchanged | **Pass.** No statement requires any change to Backend Architecture v1.1. §33.8's delegation is consistent with the backend's advisory lock and CAS model without prescribing it. |
| 10 | Rule Engine Architecture unchanged | **Pass.** No contact surface altered. |
| 11 | Security Contracts unchanged | **Pass.** No contract referenced or modified. |

## A.2 Remaining Ambiguities

Recorded, not resolved.

### AM-1 — Supersession timing *(material)*

Eager versus lazy evaluation is not determined by surviving evidence. Reconstructed as **N-1**, lazy, on fewest-decisions grounds. **Requires ratification.** Affects whether the Logical Database Design must accommodate a bulk re-canonicalization process.

### AM-2 — The orphaned field list on page 13 *(material)*

Page 13 of the source carries an unlabelled field list with no heading:

```
max_observed_risk · status_transition_count · total_analysis_count
demotion_threshold · last_manual_review_timestamp · last_manual_review_outcome
```

It sits between page 12 (unreadable, spanning §30 tail through §35 opening) and page 14, which begins mid-sentence with the §35 statement that analytical model selection is out of scope. **The field list therefore falls inside §35 Domain Assessment Governance.**

Its content is consistent with ADR-004's record that the hybrid knowledge model "supports automated escalation/demotion and manual governance override without data loss" — `demotion_threshold` and `last_manual_review_*` correspond directly to that language.

**This reconstruction does not place it**, because doing so would require deciding whether these are attributes of Knowledge Metadata, of Domain Knowledge Metadata, or of a §35 construct not otherwise named — a decision the evidence does not support.

### AM-3 — §35 Domain Assessment Governance is also partially missing *(material — not in the reconstruction brief)*

The brief lists §31–§34 as missing from page 12. **The opening of §35 is also lost.** Its tail survives on page 14, together with ADR-007, which records that Domain Security State SHALL be deterministically derived, reproducible, and resolve to exactly one authoritative state, relying on Security-Resource-level Analysis History for supporting evidence, with the algorithm explicitly out of scope.

What is lost is §35's opening — the persistence-level contract for Domain Security State, and the field list of AM-2. **This was not requested and has not been reconstructed.** It should be added to the reconstruction scope.

### AM-4 — Deletion under external obligation *(latent)*

§6, §21 and §44 prohibit deletion of Analysis History without exception, so §34.8 records that no deletion policy exists. Should a regulatory or user-initiated deletion requirement arise, it cannot be satisfied within the current architecture and would require the §43 process. Not a reconstruction defect; a property of the frozen architecture, recorded so that Database Design does not encounter it unannounced.

### AM-5 — Alias persistence *(minor)*

§14.5 concludes that alias sets need not be persisted, because canonicalization is deterministic and on-demand. This is the fewest-decisions reading and is consistent with §22's composition. Should Database Design find that on-demand canonicalization is impractical for lookup, persisting an alias index would be a **physical** optimization requiring no architectural change, provided the aggregate composition is unaltered.

## A.3 Reconstruction Summary

| Category | Count | Notes |
|---|---|---|
| **Recovered** | 78 statements | Directly supported by surviving text, source cited |
| **Inferred** | 41 statements | Logical consequence, supporting evidence cited |
| **New Decisions** | **2** | N-1 supersession timing; N-2 merge and split expressed as supersession |

Both new decisions are isolated to §14, are minimal, and are marked. N-2 is the weaker of the two in consequence: it adds no state and no guarantee, merely declining to introduce operations the surviving text never names. N-1 is material and is raised as a proposed ADR.

## A.4 Readiness Assessment

| Downstream activity | Status | Blocker |
|---|---|---|
| **Entity-Relationship Modeling** | **Ready** | None |
| **Logical Data Modeling** | **Ready** | None |
| **Relational Normalization** | **Ready** | None |
| **Repository Design** | **Ready** | None |
| **PostgreSQL Logical Schema Design — TIR, UIPR** | **Ready** | None |
| **PostgreSQL Logical Schema Design — SKR analysis records** | **Ready** | None |
| **PostgreSQL Logical Schema Design — SKR identity and Current Security State** | **Ready on ratification of N-1** | AM-1 |
| **API Contract Design** | **Ready** | None |
| **Implementation Planning** | **Ready** | None |

**On AM-1's effect.** The identity *model* is complete: derivation, stability, supersession semantics, retention guarantees and the two-tier structure are all specified and evidenced. Only the *timing* of supersession evaluation is undetermined, and it affects process design rather than structure. Schema design may proceed; a decision is required before supersession is implemented.

**On AM-3's effect.** §35's missing opening does not block Database Design. Domain Security State is a component of Domain Entity, whose composition survives in §22, and ADR-007 fixes its persistence-level contract. What is lost is elaboration, not structure.

---

# Conclusion

## GAP-3 CLOSED — PERSISTENCE ARCHITECTURE COMPLETE, WITH TWO RATIFICATIONS PENDING

The reconstruction is internally consistent, contradicts no surviving section, and alters no aggregate, ownership, boundary, invariant or contract. Downstream Database Design may proceed for every repository and for the whole of SKR, including identity structure.

Two items require ratification, neither of which blocks schema design:

- **N-1 — supersession timing.** Raised as a proposed ADR. Affects process, not structure. Required before supersession is implemented.
- **N-2 — merge and split expressed as supersession.** Adds no state and no guarantee; ratification is a formality.

Two items are recorded for attention rather than resolution:

- **AM-3 — §35 Domain Assessment Governance is also partially missing** and was not in the reconstruction brief. It should be added to scope. It does not block Database Design.
- **AM-4 — no deletion policy exists**, by construction. Database Design should proceed on that basis and not assume one can be added later without architecture-level review.
