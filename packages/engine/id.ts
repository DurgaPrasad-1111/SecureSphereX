/**
 * Standalone identity-minting utilities. Deliberately its own file, used
 * by both `orchestrator.ts` (`evaluationId`) and `stage3.ts`
 * (`findingId`) — for the same traceability discipline as every prior
 * mechanical DECISIONS.md resolution: the decision and its implementation
 * are each their own commit, not batched into whatever code happens to
 * use them first.
 *
 * `mintEvaluationId()` — DECISIONS.md DEC-15's amendment (2026-08-26):
 * random UUIDv4, matching `spec/Logical-Database-Design-Specification-v1_1.md`
 * §5.13's `evaluation_id: generated` column. Originally minted inline in
 * `orchestrator.ts`'s `assembleSecurityEvaluation`; moved here and up into
 * `evaluateModule` in the same change that added `stage3.ts` — Stage 3
 * needs a real `evaluationId` per module to build `CorrelationFinding.
 * evaluationRefs`, and `assembleSecurityEvaluation` (which previously was
 * the only place one was minted) always throws before returning one,
 * since 4 of `SecurityEvaluation`'s 12 fields remain blocked on DEC-15.
 * `evaluationId` never depended on those four — moving where it's minted
 * doesn't touch the decision itself, only its wiring.
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
 * describes as unchanged. `evaluationId` is NOT one of the five branded
 * types (it's a bare `string` on `SecurityEvaluation`), so
 * `mintEvaluationId()` needs no cast at all.
 */

import { randomUUID } from 'node:crypto';
import type { FindingId } from '../contracts/evidence.contract.v1';

export function mintEvaluationId(): string {
  return randomUUID();
}

export function mintFindingId(): FindingId {
  return randomUUID() as FindingId;
}
