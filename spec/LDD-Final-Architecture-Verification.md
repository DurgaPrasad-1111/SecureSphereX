# SecureSphere X — Final Architecture Verification: Logical Database Design

**Reviewing:** Logical Database Design Specification v1.0
**Posture:** Independent architecture review board. Falsification, not redesign.
**Judged against:** Overall Architecture · Rule Engine v0.8 · Backend v1.1 · Persistence Architecture Rev 2 including GAP-3 Reconstruction

---

## Executive Summary

The design is **architecturally faithful**. Aggregate boundaries, repository ownership, identity determinism, the mutable/immutable seam and the replay contract are all correctly modelled and traceable to cited sources. No aggregate was split, merged or reassigned. No architectural concept was invented.

**It is not yet freezable.** Five defects were found by attempting to falsify the enforcement mechanisms rather than by reading the prose. Two are blockers.

The single most serious finding is that **the design's central claim — that nothing in the analytical record can be deleted — is not enforced by the mechanism the design specifies.** The privilege model is written such that the revocation is a no-op, and five tables carry no compensating guard. A Security Resource can be deleted in two statements.

The second blocker is that **the schema as specified cannot be partitioned.** PD-1 defers the partition key as a later decision; PostgreSQL's constraint rules make that deferral impossible without changing every primary key and seven foreign keys.

| Severity | Count | Blocking |
|---|---|---|
| **Critical** | 1 | Yes |
| **High** | 2 | One |
| **Medium** | 4 | No |
| **Low / Observation** | 4 | No |

---

## Findings

### CRITICAL

#### C-1 · Deletion prevention is a no-op · §15.1, §15.5, PI-6, II-4

**Contradiction.** Persistence §6, §21, §34.7 and §44 prohibit deletion across the analytical record. PI-6 claims enforcement by revoked privilege. It is not enforced.

**Falsification.** §15.1 grants `CREATE ON SCHEMA skr TO skr_writer`. The role that creates a table **owns** it, and an owner's privileges cannot be meaningfully revoked — `REVOKE DELETE ... FROM skr_writer` is a no-op against the owner.

Compounding it, five SKR tables carry no delete-guard trigger: `security_resource`, `current_security_state`, `domain_entity`, `domain_security_state`, and `analysis_session` in any state other than `finalized` — the trigger raises only where `OLD.session_state = 'finalized'`.

**Exploit path, two statements:**

```sql
DELETE FROM skr.current_security_state WHERE resource_identity = $1;  -- no guard
DELETE FROM skr.security_resource      WHERE resource_identity = $1;  -- FKs now satisfied
```

The RESTRICT foreign keys do not save this: they block deletion of a parent while children exist, and the children are deleted first.

**Consequence.** II-4 ("a superseded Security Resource retains its identity, history, metadata and references and is not deleted") and PI-6 are architectural invariants that the database claims to enforce and does not. A design asserting an unenforced guarantee is worse than one that discloses the gap, because downstream work will rely on it.

**Required correction.** Separate ownership from write access, and extend the delete guard to every SKR table:

```sql
-- Tables are owned by a role the application never uses
CREATE ROLE skr_owner  NOLOGIN;
CREATE ROLE skr_writer NOLOGIN;

GRANT USAGE, CREATE ON SCHEMA skr TO skr_owner;   -- owner creates; writer does not
GRANT USAGE            ON SCHEMA skr TO skr_writer;

-- Writer receives exactly the verbs the architecture permits. DELETE is never granted.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA skr TO skr_writer;
ALTER DEFAULT PRIVILEGES FOR ROLE skr_owner IN SCHEMA skr
  GRANT SELECT, INSERT, UPDATE ON TABLES TO skr_writer;

-- Defence in depth: a guard on every SKR table, not only the append-only ones
CREATE TRIGGER security_resource_no_delete
  BEFORE DELETE ON skr.security_resource
  FOR EACH ROW EXECUTE FUNCTION skr.reject_mutation();
-- likewise: current_security_state, domain_entity, domain_security_state, analysis_session
```

The `analysis_session` guard must reject DELETE unconditionally, not only where finalized. An abandoned session is still part of the record (Backend §15.3).

---

### HIGH

#### H-1 · The schema cannot be partitioned · §14.5, PD-1 — **BLOCKING**

**Hazard.** §14.5 recommends range partitioning of `analysis_session`, `security_evidence`, `security_evaluation` and `analysis_pass_result`, and PD-1 defers the partition key to physical design while warning that post-hoc partitioning is "a migration project."

**Falsification.** It is worse than a migration project — it is currently **impossible without changing the logical model**. PostgreSQL requires every UNIQUE and PRIMARY KEY constraint on a partitioned table to include all partition key columns. Every candidate table has a single-column UUID primary key that excludes any date.

Partitioning `analysis_pass_result` by `evaluated_on` would require its PK to become `(pass_result_id, evaluated_on)`, and therefore require the same column on **seven** referencing tables: `rule_outcome`, `correlation_finding`, `scoring_entry`, `suppression_application`, `capability_marker`, plus the two associative tables reached through them.

**Consequence.** PD-1 is not a deferrable decision. It is a logical-model decision presented as a physical one, and deferring it converts a design choice into a future rewrite of every key and foreign key in the session subtree.

**Required correction — decide now.** Two admissible resolutions:

1. **Partition-ready keys.** Promote the date column into the primary key of each candidate table and propagate it through referencing foreign keys. Cost: wider keys and indexes from day one, whether or not partitioning is ever adopted.
2. **Declare partitioning out of scope for v1.** Remove §14.5's recommendation and PD-1, and record that these tables will not be partitioned under this schema version. Partitioning then becomes a MAJOR migration under §16.2's "Prohibited" tier, explicitly and knowingly.

**The board's position is that either is acceptable; leaving it undecided is not.** Given A-3 (nothing is deleted) the tables grow without bound, so the decision cannot be avoided indefinitely — but it must be made deliberately rather than discovered.

#### H-2 · Replay can depend on a mutable row · §5.10, §5.11, §5.15, §12.7

**Contradiction.** §12.7 states "Replay reads no mutable row." §21 check 4 asserts the same.

**Falsification.** `analysis_pass_result.rule_set_version` and `security_resource.policy_version` are foreign keys to tables whose rows are mutable **while `released = false`**. Nothing constrains the reference to a released version. A pass evaluated against an unreleased rule set — a plausible condition in development, staging, or a mis-sequenced deploy — would have a replay input that can subsequently change.

**Consequence.** The replay determinism claim holds only by convention. §17.2's release gate would then verify a session against a rule set different from the one it ran under, without detecting it.

**Required correction.** Constrain the reference to released rows. Since PostgreSQL foreign keys cannot carry a predicate, use a composite key that encodes the state:

```sql
ALTER TABLE skr.rule_set_version
  ADD CONSTRAINT rsv_released_key UNIQUE (rule_set_version, released);

ALTER TABLE skr.analysis_pass_result
  ADD COLUMN rule_set_released BOOLEAN NOT NULL DEFAULT true
    CHECK (rule_set_released),
  ADD CONSTRAINT apr_released_ruleset
    FOREIGN KEY (rule_set_version, rule_set_released)
    REFERENCES skr.rule_set_version (rule_set_version, released)
    ON DELETE RESTRICT;
```

The CHECK pins the local column to `true`, so the foreign key can only resolve against a released row. Apply the identical pattern to `security_resource.policy_version` and `current_security_state.rule_set_version`.

---

### MEDIUM

#### M-1 · Cross-pass referential integrity is unconstrained · §5.16, §5.19, §5.14

`scoring_entry` and `rule_outcome` each carry independent foreign keys to `analysis_pass_result` and `correlation_finding`. Because `correlation_finding`'s primary key is `finding_id` alone, nothing prevents a scoring entry in pass 3 referencing a finding produced in pass 1.

The same gap exists in `evaluation_evidence`: an evaluation from one session can reference evidence from another.

**Consequence.** A malformed write produces a pass whose scoring does not correspond to its findings. Replay would reproduce the corruption faithfully, since it reads what was stored.

**Required correction.** Add composite unique keys and use composite foreign keys:

```sql
ALTER TABLE skr.correlation_finding
  ADD CONSTRAINT cf_pass_finding_unique UNIQUE (pass_result_id, finding_id);

ALTER TABLE skr.scoring_entry
  DROP CONSTRAINT scoring_entry_finding_id_fkey,
  ADD CONSTRAINT se_finding_same_pass
    FOREIGN KEY (pass_result_id, finding_id)
    REFERENCES skr.correlation_finding (pass_result_id, finding_id)
    ON DELETE RESTRICT;

ALTER TABLE skr.rule_outcome
  ADD CONSTRAINT ro_finding_same_pass
    FOREIGN KEY (pass_result_id, finding_id)
    REFERENCES skr.correlation_finding (pass_result_id, finding_id)
    ON DELETE RESTRICT;

ALTER TABLE skr.security_evaluation
  ADD CONSTRAINT sev_session_eval_unique UNIQUE (analysis_session_id, evaluation_id);
ALTER TABLE skr.security_evidence
  ADD CONSTRAINT sev_session_evid_unique UNIQUE (analysis_session_id, evidence_id);
-- evaluation_evidence then carries analysis_session_id and two composite FKs
```

#### M-2 · `state_version` monotonicity is unenforced · §5.3, CSG-1

The column exists and is documented as monotonic, but nothing prevents an UPDATE from leaving it unchanged or decrementing it. CSG-1's atomicity requirement rests on it.

**Required correction.**

```sql
CREATE OR REPLACE FUNCTION skr.enforce_state_version() RETURNS trigger AS $$
BEGIN
  IF NEW.state_version <> OLD.state_version + 1 THEN
    RAISE EXCEPTION 'Current Security State replacement must increment state_version by exactly 1 (CSG-1)';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER css_version_monotonic
  BEFORE UPDATE ON skr.current_security_state
  FOR EACH ROW EXECUTE FUNCTION skr.enforce_state_version();
```

This also gives partial enforcement of wholesale replacement: a partial UPDATE that forgets the version increment now fails.

#### M-3 · An illegal lifecycle transition is representable · §5.2, §15.3

`Created → Superseded` is not among the transitions of §15.3, which requires `Created → Active` first. The existing CHECK constrains only coherence between `lifecycle_state` and `superseded_by_identity`, not the transition path.

**Required correction.** Extend `protect_identity`:

```sql
IF OLD.lifecycle_state = 'created' AND NEW.lifecycle_state = 'superseded' THEN
  RAISE EXCEPTION 'Created cannot transition directly to Superseded (§15.3)';
END IF;
```

#### M-4 · Cross-repository read access is not actually granted · §15.1

§7.2 permits SKR to read `tir` and `uipr`, and so on. §15.1 grants `USAGE ON SCHEMA` only, which permits name resolution but confers no table privileges. The stated read access does not exist.

**Required correction.**

```sql
GRANT SELECT ON ALL TABLES IN SCHEMA tir  TO skr_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA uipr TO skr_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA skr  TO tir_writer, uipr_writer;
ALTER DEFAULT PRIVILEGES FOR ROLE tir_owner  IN SCHEMA tir  GRANT SELECT ON TABLES TO skr_writer;
-- and equivalently for the remaining permitted pairs in §7.2
```

---

## Verification Task Results

| # | Task | Result |
|---|---|---|
| 1 | **Aggregate verification** | **Pass.** Six aggregates, one owner each, boundaries preserved. See O-1 on two non-aggregate tables. |
| 2 | **Repository verification** | **Pass with M-4.** Ownership, isolation and direction correct; no cross-schema FK. Read grants incomplete. |
| 3 | **Identity verification** | **Pass with H-2.** Determinism, uniqueness, aliases, supersession, merge/split, preservation all correct. Version attribution admits an unreleased policy. |
| 4 | **Lifecycle verification** | **Pass with M-3.** One illegal transition representable. Domain supersession structurally impossible — correct. |
| 5 | **Mutable vs immutable** | **Pass with C-1, M-2.** Append-only correct where guarded; five tables unguarded; version monotonicity unenforced. |
| 6 | **Replay verification** | **Conditional on H-2.** Otherwise replay reads only immutable rows. Current Security State correctly excluded. |
| 7 | **Referential integrity** | **Pass with M-1.** RESTRICT throughout, no CASCADE, no orphan path. Cross-pass association unconstrained. |
| 8 | **Constraint verification** | **Pass with disclosure.** See enforcement table below. |
| 9 | **Normalization** | **Appropriate.** Two JSONB uses justified by tri-state and read-whole access. One deliberate denormalization (thresholds), justified. No architectural problem. |
| 10 | **PostgreSQL review** | **Pass with H-1.** UUID strategy, ENUM, partial indexes and generated columns all appropriate. Partition readiness absent. |
| 11 | **Performance risk** | See table below. |
| 12 | **API readiness** | **Pass.** Aggregates map to resources; identifiers stable; transactions defined; internal columns are not projected. |
| 13 | **Future evolution** | **Pass with H-1.** Additive evolution supported; partitioning blocked. |
| 14 | **Consistency audit** | Two inconsistencies, both Low. See O-2, O-3. |

### Invariant Enforcement Locus

| Enforced by | Invariants |
|---|---|
| **Database** | Identity uniqueness and immutability · supersession coherence · Domain non-supersession · one state per resource · one evaluation per module per pass · one outcome per rule per pass · weight arithmetic · subsumed-not-counted · score composition · advisory pass ordinal · tri-state shape · idempotent ingestion · append-only on 16 tables · released-version immutability |
| **Application** | Presence of a row per module and per rule (V-1) · dense ordinals without gaps · Analysis History references a finalised session (AHC-1) · monotonic tier floor across passes (§11.3) · wholesale replacement of Current Security State |
| **Architecture only** | Cross-repository write prohibition beyond role grants · aggregate reachability discipline |

**Newly disclosed:** the monotonic tier floor of Rule Engine §11.3 appears nowhere in §11's integrity rules. It is application-enforced and was not listed as such. This is an omission in the design's own disclosure, not a defect in the model.

### Performance Risk

| Risk | Class | Note |
|---|---|---|
| `rule_outcome` and `security_evaluation` row growth (~11 and ~10 per pass) | **Medium** | Largest by count; append-only |
| `security_evidence` volume from JSONB payloads | **Medium** | Largest by bytes |
| Replay whole-session reads | **Low** | Batch; replica-eligible |
| Write hotspot on `current_security_state` per resource | **Low** | Serialised per session by advisory lock |
| Unbounded growth with no deletion path | **Medium** | Consequence of A-3, not of this design |
| **Partition migration** | **High** | H-1 |
| Expensive joins | **Low** | Reconstruction is keyed on `pass_result_id`; no wide joins on the write path |

---

## Critical Questions — Direct Answers

| Question | Answer |
|---|---|
| Does every table exist because the architecture requires it? | **Yes.** §20.3 traces all 37; the board verified the two non-aggregate tables are architecturally mandated (§16, §12). |
| Has the database introduced architectural concepts not present in the architecture? | **No.** |
| Are any tables merely implementation convenience? | **No.** `analysis_reference` was scrutinised for redundancy against `analysis_session.resource_identity` and is correctly retained — they belong to different aggregates, and AHC-3 has no other home. |
| Is any aggregate improperly split? | **No.** |
| Is any repository improperly coupled? | **No.** No FK crosses a schema. M-4 is missing permission, not coupling. |
| Can replay ever become nondeterministic? | **Yes, via H-2** — an unreleased rule set is mutable. Otherwise no. |
| Can identity ever become inconsistent? | **Yes, via C-1** — a Security Resource can be deleted, destroying II-4. Otherwise no. |
| Can illegal lifecycle states exist? | **One transition, M-3.** No illegal *state* is representable. |
| Can future APIs be designed without redesigning the schema? | **Yes.** |
| Would you approve this schema for implementation? | **Not as written.** With C-1, H-1 and H-2 corrected, yes. |

---

## Architectural Contradictions

| # | Claim in the design | Reality |
|---|---|---|
| 1 | PI-6: "Nothing in the analytical record is deleted — DELETE revoked across SKR" | Revocation is a no-op against the owner; five tables unguarded (C-1) |
| 2 | §12.7 / §21.4: "Replay reads no mutable row" | Unreleased policy and rule-set rows are mutable and referencable (H-2) |
| 3 | PD-1: partition key is a deferrable physical decision | It is a logical-model decision; deferral is not available (H-1) |

---

## Required Corrections

**Before freeze — blocking:**

1. **C-1** — separate `skr_owner` from `skr_writer`; never grant DELETE; add an unconditional delete guard to `security_resource`, `current_security_state`, `domain_entity`, `domain_security_state` and `analysis_session`.
2. **H-1** — resolve PD-1 now: adopt partition-ready composite keys, or formally declare partitioning out of scope for this schema version.
3. **H-2** — constrain policy and rule-set references to released rows via the composite-key pattern.

**Before freeze — non-blocking but determinate:**

4. **M-1** — composite foreign keys tying findings, scoring entries and rule outcomes to the same pass; evaluations and evidence to the same session.
5. **M-2** — trigger enforcing `state_version` increment by exactly one.
6. **M-3** — reject `Created → Superseded`.
7. **M-4** — grant the SELECT privileges §7.2 describes.
8. Add the §11.3 monotonic tier floor to §11's integrity rules as an explicitly application-enforced invariant.

---

## Non-Blocking Observations

**O-1 · Two tables belong to no aggregate.** `normalization_policy_version` and `rule_set_version` are versioned reference artifacts, not aggregates — Persistence §17 enumerates six aggregates and neither is among them. Both are architecturally mandated (§16, §12.1). The verification criterion "every table belongs to exactly one aggregate" is not satisfiable for reference data and should be read as applying to aggregate tables. **No action required; recorded for clarity.**

**O-2 · `domain_lifecycle` enum and §10.2 prose disagree.** §10.2 states `Created → Updated → Retained`; the enum is `('created','active')`. Neither `updated` nor `retained` is representable. The design justifies omitting `Updated` (an activity, not a resting state) but does not address `Retained`. Cosmetic inconsistency between text and type.

**O-3 · `Retained Permanently` appears in the §18.4 state diagram but in no enum.** Consistent with §10.1's reasoning that retention is the absence of a deletion path, but the diagram implies a stored state. Diagram and type should agree.

**O-4 · V-1 remains correctly disclosed.** Presence constraints cannot be expressed relationally. The design says so, and the replay gate is the compensating control. The board endorses this treatment.

---

# Final Verdict

## CONDITIONAL APPROVAL

The Logical Database Design is **architecturally sound and structurally faithful**. Every aggregate, boundary, ownership rule, identity invariant and lifecycle constraint traces correctly to the frozen architecture. No redesign is required, and no architectural concept was invented.

**Three blockers prevent freeze**, and all three are defects in *enforcement mechanism* rather than in *model*:

- **C-1** — the deletion prohibition, which is the design's most load-bearing guarantee, is not enforced by the mechanism specified. Two statements delete a Security Resource.
- **H-1** — the schema cannot be partitioned as written, and PD-1 defers a decision that is not deferrable.
- **H-2** — replay may depend on a mutable rule-set or policy row.

None requires architectural change. C-1 and H-2 are privilege and constraint corrections. H-1 requires a decision, and either available answer is acceptable.

**On correction of C-1, H-1 and H-2, the board's verdict converts to APPROVED and Database Design may be frozen.** The Medium findings should be applied in the same pass but do not independently block.

**API Contract Design should not begin until H-1 is resolved**, because a partition-ready key change would alter the identifiers appearing in API paths. C-1, H-2 and the Medium findings have no API surface and may be corrected in parallel.
