# Contract Baseline

**These are the frozen versions this build was made against. Any further change to a
contract is a contract change requiring Architecture Owner review.**

Recorded at Step 7, immediately after the six Step 6 amendments (A-1 … A-6) were
applied and committed. Working tree at time of record: `d806f1441eb0d173928a67a2ce542b58d860fc21`.

Each contract exists in two places, and this file records both states:

- **`spec/`** — the ORIGINAL frozen version, underscore-named. Read-only, committed,
  never amended. This is the text that was signed.
- **`packages/contracts/`** — the AMENDED working copy, dotted-named. This is what the
  build compiles against.

The digests below are the evidence that the difference between those two states is
exactly the enumerated amendments and nothing else.

---

## Per-contract digests

All values are MD5, computed with `md5sum` on this checkout (LF line endings).

| Contract | `spec/` original digest | `packages/contracts/` amended digest | Amendments applied |
|---|---|---|---|
| `boundary.interfaces.v1.ts` ← `boundary_interfaces_v1.ts` | `56ccf6d9cfe40a58f53ad9f8eb239787` | `6fe745aa4b979e11f12977bf457c3fac` | A-1, A-2, A-3 |
| `evidence.contract.v1.ts` ← `evidence_contract_v1.ts` | `441c5adf08e9f719a790dac645002225` | `227b949649133efda38983fceaf7b382` | A-3, A-4 *(brand declarations live here)* |
| `evaluation.contract.v1.ts` ← `evaluation_contract_v1.ts` | `a06dfdb533b4b2e65c848b16dd2e97c7` | `1431cb55441a8eb2de2815f8126b4d76` | A-3 |
| `passresult.contract.v1.ts` ← `passresult_contract_v1.ts` | `122de9568e2cc4ee5be1691fbcb3261f` | `1ba84f70c207bb1c80da898a47ad21eb` | A-3, A-4 |
| `snapshot.format.v1.ts` ← `snapshot_format_v1.ts` | `e8d1796d5a652c5cd31bbb3a0d7b37e6` | `cd2c9023f11886ebb72702cdc3476307` | A-4, A-5 |
| `ruleset.format.v1.ts` ← `ruleset_format_v1.ts` | `402481bb9034128a1e101a1fa1a3d495` | `f941ef643a62b741ac807082803d8b55` | A-6 |

### Method

```
md5sum spec/boundary_interfaces_v1.ts spec/evidence_contract_v1.ts \
       spec/evaluation_contract_v1.ts spec/passresult_contract_v1.ts \
       spec/snapshot_format_v1.ts spec/ruleset_format_v1.ts

md5sum packages/contracts/boundary.interfaces.v1.ts packages/contracts/evidence.contract.v1.ts \
       packages/contracts/evaluation.contract.v1.ts packages/contracts/passresult.contract.v1.ts \
       packages/contracts/snapshot.format.v1.ts packages/contracts/ruleset.format.v1.ts
```

Every pair was additionally confirmed non-identical with `cmp`, so no row records an
amendment that was never actually applied.

---

## Rollups

Two rollups, recording the two states of the corpus.

### `spec/` corpus rollup — 46 files, recomputed at Step 7

```
3b105afb9abd8c22efca0fa150ec7cba
```

**Method (exact command):**

```
cd spec && for f in $(ls -1 | sort); do echo "$f"; md5sum "$f" | cut -d' ' -f1; done | md5sum ; cd ..
```

**Line endings:** this checkout is **LF** (darwin). The rollup is machine-specific
because line endings differ between checkouts; per `DECISIONS.md` the same byte-content
yields `3b105afb9abd8c22efca0fa150ec7cba` on an LF checkout and
`c42963a0fd1be3cbb5e73575ff3519ea` on the CRLF signing machine.

**Gate result: MATCH.** The value recomputed here is identical to the LF value of
record in `DECISIONS.md` ("Corpus rollup of record"). The `spec/` corpus is the same
46 files it was at signing.

### `packages/contracts/` rollup — the six amended contracts

Derived from the six amended digests in the table above, in the listed order:

```
6fe745aa4b979e11f12977bf457c3fac
227b949649133efda38983fceaf7b382
1431cb55441a8eb2de2815f8126b4d76
1ba84f70c207bb1c80da898a47ad21eb
cd2c9023f11886ebb72702cdc3476307
f941ef643a62b741ac807082803d8b55
```

A change to any one of these six values without a corresponding new amendment ID and
Architecture Owner review is an unreviewed contract change.

---

## Amendment index

| ID | Change |
|---|---|
| A-1 | Boundary invariant B-14 |
| A-2 | `get()` in-memory constraint |
| A-3 | Brand four ID types across 23 signed sites |
| A-4 | Brand `DayStamp` across 9 date fields; `reportedOn` nullable carve-out |
| A-5 | `FetchRecord` discriminated union on `outcome` (DEC-3 Q5) |
| A-6 | `RuleSet.pslVersion` (DEC-8, MINOR bump per §14.1) |

Amendments are recorded in full in `DECISIONS.md` (Annex A). They are applied by hand,
never by tooling.
