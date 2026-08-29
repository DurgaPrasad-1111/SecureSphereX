# SecureSphere X

A browser extension that observes live login pages and produces structured evidence (D0.1);
a deterministic rule engine (D0.2) evaluates that evidence against a versioned rule set (D0.3)
to produce a Pass Result (D0.4), consulting an Authentication History Store for cross-visit signal.

## Repository layout (Stage0-Completion-Pack.md §1)

```
packages/contracts/   D0.1–D0.5, D0.8–D0.10. Frozen.
packages/engine/       Rule engine + 10 evaluation modules.
apps/extension/        MV3 browser extension.
apps/harness/          Offline evaluation + replay gate.
tools/capture/         Corpus capture pipeline (may be Python).
rulesets/              Versioned rule-set artifact (rules-v0.1.0.json).
corpus/                Snapshots. Git-LFS or external store.
fixtures/              Hand-written evidence fixtures.
```

## Package dependency matrix — §2, the architectural gate

| Package | May import | MUST NOT import |
|---|---|---|
| `contracts` | *nothing* | everything |
| `engine` | `contracts` | `extension`, `harness`, `capture`, any browser API |
| `extension` | `contracts`, `engine` | `harness`, `capture` |
| `harness` | `contracts`, `engine` | `extension` |
| `capture` | `contracts` (D0.5 only) | `engine`, `extension`, `harness` |

**The single most important rule (§2.1): `packages/engine` SHALL NOT reference `chrome.*`,
`window`, `document`, `localStorage`, or any DOM/browser API.** One browser-tainted engine
breaks deterministic replay (§17.2) and makes the determinism claim (§4.3) unfalsifiable.
Enforced by CI gate G-3.

**Store access is interface-only (§2.2):** nothing imports the Authentication History Store
implementation. Access is exclusively through `AuthStoreReader`, `AuthStoreWriter`,
`AuthStoreUserControl`. Enforced by CI gates G-4, G-5.

## Contracts are frozen

`packages/contracts` is FROZEN. `DECISIONS.md` records the amendments (Annex A) applied to it
before the `v1.0.0` tag. Amendments are made by hand, never by Claude Code — a pre-tool-use
hook blocks writes under `packages/contracts/`, `spec/`, and `d0_*_schema.json`.

## Toolchain

Node 22 required — `ci.yml` pins `node-version: '22'`.

### Typecheck: use `tsc -b`, never bare `tsc --noEmit`

Root tsconfig.json is a project-references aggregator (`files: []`).
Bare `tsc --noEmit` at root checks ZERO files and passes vacuously.
Only `tsc -b` (npm run typecheck) walks the references and actually
type-checks. Two consequences:
- CI gate G-1 MUST invoke `tsc -b`. A G-1 wired to `tsc --noEmit`
  is a gate that verifies nothing.
- Every new package under packages/ or apps/ needs its own
  tsconfig.json AND an entry in root's `references` array. A package
  missing from that array is silently never type-checked.
- Every package tsconfig must use `"include": ["**/*.ts"]`, never
  `["*.ts"]` — the single-star form silently skips subdirectories.

## CI gates (Stage0-Completion-Pack.md §3)

G-1 tsc --strict · G-2 no unchecked `as Origin` casts · G-3 no browser globals in `engine` ·
G-4 dependency-cruiser enforces the matrix above · G-5 store reachable only via D0.8 ·
G-6 transmission audit (§20.2 never-transmit) · G-7 fixture round-trip · G-8 rule-set static
validator · G-9 property tests (Stage 1b) · G-10 deterministic replay (Stage 6).

**Two corrections to §3:** G-8 runs **fifteen** static checks V-1..V-15, not twelve.
V-1..V-13 come from `ruleset_format_v1.ts`; V-14 verifies `integrityDigest` (DEFECT-17)
and V-15 gates `pslVersion` reconciliation (DEC-27) — neither is in the contract, both
are in `validate-ruleset.py`. The contract-conformance check is a separate gate,
**G-11**, not G-8 (`DECISIONS.md` DEC-4) — G-8 is the rule-set validator only.

**Three different things share `G-` names — always say which:**
- CI gates `G-1`..`G-10`, `G-11` (this section, `ci.yml`)
- Store poisoning guards `G-01`..`G-05`, two digits (Specification §20.6)
- Governance rules `G-3`, `G-4`, `G-5` (`MANIFEST.md` §6) — NOT the CI gates

## spec/

46 files, read-only, committed. Two are audit OUTPUT, not specification — do not treat as
normative: `SecureSphereX-Audit-Report.md`, `SecureSphereX-Security-Architecture.md`.
`spec/MANIFEST.md` says which file is authoritative for each role. Read the relevant spec
section on demand rather than assuming; do not paste spec content here.
