# SecureSphere X — Repository Manifest

**Purpose:** to identify, unambiguously, which artifact in this repository is authoritative for each role.

This manifest records existing state. **It introduces no architectural, behavioural or contract change**, and it is not itself an authority — where it and a specification disagree, the specification governs.

All paths below are the real, current on-disk paths. The repository is a flat root of underscore-named files; there is no `archive/` directory.

---

## 1. Authoritative Artifacts

| Role | Authoritative artifact | Version |
|---|---|---|
| Rule engine | `SecureSphereX-RuleEngine-Spec-v0_8.md` | 0.8 |
| Backend architecture | `Backend-Architecture-Specification-v1_3.md` | **1.3** |
| Logical database design | `Logical-Database-Design-Specification-v1_1.md` | **1.1** |
| API contract | `API-Contract-Specification-v1_2.md` | **1.2** |
| **OpenAPI implementation contract** | **`openapi.yaml`** | 3.1.0 / info 1.2.0 |

### Canonical Boundary Contracts — TypeScript sources

| Contract | File | Version constant |
|---|---|---|
| D0.1 Evidence | `evidence_contract_v1.ts` | `EVIDENCE_CONTRACT_VERSION = 1.1.0` |
| D0.2 Security Evaluation | `evaluation_contract_v1.ts` | `EVALUATION_CONTRACT_VERSION = 1.1.0` |
| D0.3 Rule-set Format | `ruleset_format_v1.ts` | `RULESET_FORMAT_VERSION = 1.1.0` |
| D0.4 Analysis Pass Result | `passresult_contract_v1.ts` | `PASS_RESULT_CONTRACT_VERSION = 1.0.0` |
| D0.5 Snapshot Format | `snapshot_format_v1.ts` | `SNAPSHOT_FORMAT_VERSION = 1.1.0` |
| D0.8 / D0.9 / D0.10 Boundary | `boundary_interfaces_v1.ts` | `BOUNDARY_CONTRACT_VERSION = 1.1.0` |

### D0.x Generated JSON Schemas

JSON Schema 2020-12. Held as flat files in the repository root; referenced by `openapi.yaml` via `./d0_*_schema.json`.

**Provenance unestablished — adopted by digest (Architecture Owner, Ruling R13 §1).** These five files are canonical artifacts of record, frozen at the SHA-256 digests listed below. No tool in this repository produces them; `generate-canonical-schemas.py` emits a different structure and cannot produce twelve of the `$defs` names these files carry. Reconstruction of the generating tool is a mandated Phase I implementation obligation — see Ruling R13 §2 for its acceptance test. Until that tool exists and passes, **these files must not be regenerated, edited, or replaced**; the digests are the authority anchor.

| Artifact | `$defs` | SHA-256 (first 16) |
|---|---|---|
| `d0_1_schema.json` ⚠ | 30 | `d3d435ac649f497e` |
| `d0_3_schema.json` | 23 | `9603668a9a00b430` |
| `d0_4_schema.json` | 2 | `c9d06ed60db08070` |
| `d0_9_schema.json` | 7 | `0ae07b4ddd6599ca` |
| `d0_10_schema.json` | 4 | `0eb18d1cb0554c50` |

⚠ **Two malformed `$defs` keys in `d0_1_schema.json` — corrected on regeneration, not by hand (Architecture Owner, Ruling R13 §2).** Two of the eight `Observation<…>` monomorphizations carry unresolved compiler symbol IDs where the type name should read `Observation<readonly RedirectHop[]>` and `Observation<readonly LoginFormObservation[]>`. All eight are unreferenced orphans with well-formed bodies; `openapi.yaml` resolves cleanly and none is reachable from `SecurityEvidence`. The keys are not URI-fragment-safe and must be corrected when the generator of Ruling R13 §1 is reconstructed. Section 6 Schema ↔ DTO parity is reported `Fail (partial)` on these two keys and on nothing else.

D0.2 and D0.5 have no generated schema by design: D0.2 is the internal evaluation contract and D0.5 the offline corpus format. Neither crosses the wire. D0.8 likewise has no generated schema: it is the Authentication Store Query interface, client-local only.

**Module specifiers.** Inside the contract files, cross-module imports follow the implementation repository's dotted `packages/contracts` convention (`./evidence.contract.v1`); this specification repository stores the same files underscore-named, per the note above. The two differ by design and neither is a defect.

**Normative source.** The contracts cite `Specification v0.7`. That is `SecureSphereX-RuleEngine-Spec-v0_8.md`, one addendum earlier; its version note records that no predicate, weight, threshold, suppression or pipeline stage was altered across any addendum.

---

## 2. Superseded Predecessors

Present in the repository root, retained for history. **Not authoritative. Do not implement from these.**

| File | Superseded by |
|---|---|
| `Backend-Architecture-Specification.md` | `Backend-Architecture-Specification-v1_3.md` |
| `Backend-Architecture-Specification-v1_1.md` | `Backend-Architecture-Specification-v1_3.md` |
| `Backend-Architecture-Specification-v1_2.md` | `Backend-Architecture-Specification-v1_3.md` |
| `API-Contract-Specification.md` | `API-Contract-Specification-v1_2.md` |
| `API-Contract-Specification-v1_1.md` | `API-Contract-Specification-v1_2.md` |
| `Logical-Database-Design-Specification.md` | `Logical-Database-Design-Specification-v1_1.md` |

---

## 3. Non-Authoritative Artifacts — repository root

Removed from the working set because they duplicated an authoritative role, or because they belong to a lineage that is not authoritative. Retained, not deleted. All four are at the repository root; there is no `archive/` directory. The four are not the same kind of thing, so each carries its own status.

| Artifact | Status |
|---|---|
| `securesphere-openapi-3_1.yaml` | **Not authoritative** — a second, complete OpenAPI 3.1 document covering the same 26 operations, produced by a parallel lineage. Not superseded by a later version of itself. See §4. |
| `assemble-openapi.py` | **Retained tooling of a non-authoritative lineage** — writes the file above. Not superseded by anything. |
| `generate-canonical-schemas.py` | **Retained tooling of a non-authoritative lineage** — feeds the file above via `/tmp/canonical-schemas.json`. It does **not** produce the flat `d0_*_schema.json` files. Not superseded by anything. |
| `LDD-v1_1.md` | **Superseded by** `Logical-Database-Design-Specification-v1_1.md`. It is **not** a strict subset: `### 11.5 Invariants Enforced by the Application` is unique to it. The authoritative copy uniquely carries Appendix A (Integrated Change Log), Appendix B (Regression Matrix), Appendix C (Final Validation Results) and the approval statement. |

---

## 4. Why `openapi.yaml` Is Authoritative

Determined from repository evidence alone. Three findings, none of which is a preference:

**Its canonical dependencies are present and resolve.** `openapi.yaml` resolves twelve external `$ref` references into eight distinct `$defs` targets across the flat `./d0_*_schema.json` files, all five of which exist in the repository root (`d0_1_schema.json`, `d0_3_schema.json`, `d0_4_schema.json`, `d0_9_schema.json`, `d0_10_schema.json`). The SHA-256 prefixes recorded in §1 match the files on disk. Their provenance is unestablished — see §1.

**Authority rests on cross-reference, not on regenerability.** `SecureSphereX-Interface-Control-Document-v2.md` cites 26 `operationId`s; they resolve 26 of 26 against `openapi.yaml` and 14 of 26 against the alternative. Reproducibility is **not** the discriminator: the flat `./d0_*_schema.json` files this document references have no generator in this repository, whereas the alternative lineage regenerates from the TypeScript sources once its tooling paths are corrected.

**Both documents are named by repository documents.** `OpenAPI-Generation-Report.md` names `openapi.yaml` as its subject artifact. `securesphere-openapi-3_1.yaml` is named by `FIX_LOG.md` and by §3 of this manifest.

API Contract §18.1 names no filename; it mandates the mechanism `D0.x TypeScript → JSON Schema (generated) → OpenAPI components ($ref only)`. Both documents satisfied that mechanism — the non-authoritative one inlined generated components rather than referencing them externally — so §18.1 alone does not discriminate. **The Interface Control Document does.**

---

## 5. Verification Tooling

| Tool | Role | On disk |
|---|---|---|
| `contract-conformance-check.py` | Governance rule G-8. Compares canonical enums in D0.x against PostgreSQL enums in the LDD under the NM-1 naming mapping. Fails on divergence. | Present (repo root) |
| `architectural-gates.mjs` | CI gates G-2, G-3, G-6 — origin-cast guard, engine purity, transmission audit. | Not present in repository (referenced by governance rules; expected in the implementation repo, not this specification set) |
| `.dependency-cruiser.cjs` | CI gates G-4, G-5 — package boundaries and store access. | Not present in repository (as above) |

---

## 6. Change Control

Canonical contracts are modified only by their registered owner with Architecture Owner review (governance rules G-3, G-4). A contract change is incomplete until every consumer is updated in the same change (G-5).

Generated schemas are never hand-edited. They are regenerated from the TypeScript sources, and any divergence between the two is a defect in the artifact, never in the source.
