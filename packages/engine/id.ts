/**
 * Standalone identity-minting utilities. Deliberately its own file — kept
 * separate from `orchestrator.ts` (which mints `evaluationId` inline,
 * already resolved) and from `stage3.ts` (Correlation Finding Generation,
 * which consumes `mintFindingId()` below) — for the same traceability
 * discipline as every prior mechanical DECISIONS.md resolution: the
 * decision and its implementation are each their own commit, not batched
 * into whatever code happens to use them first.
 *
 * `mintFindingId()` — DECISIONS.md, the `findingId` resolution appended to
 * the Stage 3 dependency-check addendum (2026-08-26). Re-verified directly
 * against `spec/Logical-Database-Design-Specification-v1_1.md` §5.17
 * (`skr.correlation_finding`: `finding_id | UUID | No | generated | PK`) —
 * the identical evidentiary shape already used to resolve `evaluationId`
 * (same document, same "Assigned identifiers (UUIDv4)... no deterministic
 * derivation" rule, `finding_id` never listed as a client-generated
 * exception). Random UUIDv4, generated fresh per finding — never derived
 * from the finding's own content, since nothing requires it to be
 * reproducible (confirmed: `FindingId` never appears in
 * `rulesets/rules-v0.1.0.json` or the `Predicate` AST's operand types).
 *
 * The `as FindingId` cast here is the same convention already in use for
 * all five DEC-3-branded types everywhere else in this codebase (DEC-12,
 * still open, documents this as the existing practice) — this file does
 * not resolve or touch DEC-12, it applies the pattern DEC-12 already
 * describes as unchanged.
 */

import { randomUUID } from 'node:crypto';
import type { FindingId } from '../contracts/evidence.contract.v1';

export function mintFindingId(): FindingId {
  return randomUUID() as FindingId;
}
