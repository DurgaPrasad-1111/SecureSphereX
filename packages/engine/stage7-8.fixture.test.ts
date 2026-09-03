/**
 * Fixture test for Stage 7 (Threshold Evaluation) and Stage 8's
 * computational half (§11.3 monotonic floor, §11.4 intervention lock).
 *
 * TWO functions are proven, separately AND together:
 *   `computeEffectiveTier` — applies the floor for one pass.
 *   `recordIntervention`   — maintains the running maximum across a Session.
 *
 * The second is the one that would otherwise look covered while being
 * unproven: under well-behaved input (§11.4 permits escalation only) a
 * "last write wins" implementation coincides with a maximum on every
 * legitimate sequence. It is therefore tested against a MALFORMED sequence
 * where the two answers differ.
 *
 * Run directly:
 *   node --experimental-strip-types packages/engine/stage7-8.fixture.test.ts
 */

import assert from 'node:assert/strict';

import {
  computeRawTier, thresholdsFrom, computeEffectiveTier, recordIntervention, recordCommittedPass, tierRank,
} from './stage7-8.ts';
import type { PriorPassState } from './stage7-8.ts';
import type { RiskTier, ScoringEntry } from '../contracts/passresult.contract.v1.ts';

// --- Stage 7: score -> tier (§9.4) ----------------------------------------

const T = { medium: 30, high: 60 } as const;

assert.equal(computeRawTier(0, T), 'Low', '§9.4: 0 < medium -> Low');
assert.equal(computeRawTier(29, T), 'Low', 'just below medium');
assert.equal(computeRawTier(30, T), 'Medium', 'medium is INCLUSIVE');
assert.equal(computeRawTier(59, T), 'Medium', 'just below high');
assert.equal(computeRawTier(60, T), 'High', 'high is INCLUSIVE');
assert.equal(computeRawTier(1000, T), 'High', 'no upper bound');

assert.equal(tierRank('Low') < tierRank('Medium'), true, 'RiskTier ordering');
assert.equal(tierRank('Medium') < tierRank('High'), true, 'RiskTier ordering');

// --- Stage 8: no intervention ever -> no floor ----------------------------
//
// The ordinary case. A Session of Tier 0/1 passes CANNOT intervene (§3.2),
// so §11.3 imposes nothing and a tier may fall freely.

{
  const first = computeEffectiveTier('High', null);
  assert.equal(first.rawTier, 'High');
  assert.equal(first.effectiveTier, 'High', 'first pass: effectiveTier === rawTier');
  assert.equal(first.monotonicFloorApplied, false);
  assert.equal(first.interventionLocked, false);

  // No intervention was presented, so nothing floors a later drop.
  const noFloor: PriorPassState = { highestInterventionTier: null, interventionPresented: false, anyPriorPrimaryFindingActive: false };
  const later = computeEffectiveTier('Low', noFloor);
  assert.equal(later.effectiveTier, 'Low',
    '§11.3 floors only on an INTERVENED tier — a High pass that never interrupted anyone imposes none');
  assert.equal(later.monotonicFloorApplied, false);
  assert.equal(later.interventionLocked, false);
}

// --- recordIntervention: running maximum across a Session -----------------

{
  // Pass 2: first intervention, at Medium.
  const prior2 = recordIntervention(null, 'Medium');
  assert.equal(prior2.highestInterventionTier, 'Medium');
  assert.equal(prior2.interventionPresented, true, '§11.4: recorded as final for the Session');

  // Pass 4: escalates to High — §11.4, "Subsequent passes MAY escalate it."
  const prior4 = recordIntervention(prior2, 'High');
  assert.equal(prior4.highestInterventionTier, 'High', 'escalation raises the running maximum');
  assert.equal(prior4.interventionPresented, true);

  // Pass 5: rawTier collapses to Low. The floor is the HIGHEST ever
  // intervened tier (High), not the first one (Medium).
  const pass5 = computeEffectiveTier('Low', prior4);
  assert.equal(pass5.rawTier, 'Low', 'rawTier genuinely fell — recorded distinctly');
  assert.equal(pass5.effectiveTier, 'High', '§11.3: floored at the highest intervened tier');
  assert.equal(pass5.monotonicFloorApplied, true);
  assert.equal(pass5.interventionLocked, true);
  assert.notEqual(pass5.rawTier, pass5.effectiveTier,
    'P-9: both tiers recorded, never collapsed into one value');
}

// --- THE FAILURE-REVEALING CASE: maximum, not last-write-wins -------------
//
// Under §11.4-conformant input (escalation only) a "last write wins"
// implementation gives the same answer as a maximum on EVERY sequence — so
// the escalating test above cannot distinguish them. This sequence can:
// [Medium, High, Medium] is malformed input (a caller violating §11.4's
// escalation-only rule), and it is exactly where the two diverge.
//
//   maximum        -> High   (correct: High "has already produced an
//                             intervention", §11.3's wording is ANY tier)
//   last-write-wins -> Medium (silently LOWERS the floor — the de-escalation
//                             §11.3 exists to prohibit)

{
  const a = recordIntervention(null, 'Medium');
  const b = recordIntervention(a, 'High');
  const c = recordIntervention(b, 'Medium');   // <-- the malformed step

  assert.equal(c.highestInterventionTier, 'High',
    'recordIntervention is a MAXIMUM: a later lower intervention must not lower the floor');
  assert.equal(c.interventionPresented, true, '§11.4: never resets within a Session');

  // And the floor it produces must still hold.
  const afterMalformed = computeEffectiveTier('Low', c);
  assert.equal(afterMalformed.effectiveTier, 'High',
    'the floor survives a malformed lower intervention');
  assert.equal(afterMalformed.monotonicFloorApplied, true);
}

// Equal-tier re-intervention is idempotent, not a downgrade.
{
  const once = recordIntervention(null, 'High');
  const twice = recordIntervention(once, 'High');
  assert.deepEqual(twice, once, 're-intervening at the same tier changes nothing');
}

// Every ordered pair, exhaustively — the maximum property over the whole
// domain, not just the three sequences above.
const ALL_TIERS: readonly RiskTier[] = ['Low', 'Medium', 'High'];
for (const first of ALL_TIERS) {
  for (const second of ALL_TIERS) {
    const result = recordIntervention(recordIntervention(null, first), second);
    const expected = tierRank(first) >= tierRank(second) ? first : second;
    assert.equal(result.highestInterventionTier, expected,
      `recordIntervention(${first} then ${second}) must be max, got ${result.highestInterventionTier}`);
    assert.equal(result.interventionPresented, true);
  }
}

// --- The single-divergent-pass proof, built via recordIntervention --------
//
// The scenario that establishes floor !== prior.effectiveTier, now composed
// from BOTH functions rather than a hand-built PriorPassState — so they are
// proven to work together, not merely in isolation.
//
//   Pass 1  Tier 0 (navigation)   rawTier High    -> CANNOT intervene (§3.2)
//   Pass 2  Tier 2 (credential)   rawTier Medium  -> WARNS at Medium
//   Pass 3  Tier 2 (re-run)       rawTier Low
//
// At pass 3 the highest tier ever REACHED is High (pass 1), but the highest
// tier ever INTERVENED at is Medium (pass 2). §11.3 floors at Medium. An
// implementation flooring on the prior pass's tier would answer High —
// over-flooring, and suppressing a de-escalation §11.3 permits.

{
  // Pass 1 — Tier 0. High, but no intervention is possible at Tier 0/1.
  const pass1 = computeEffectiveTier('High', null);
  assert.equal(pass1.effectiveTier, 'High');
  assert.equal(pass1.interventionLocked, false, 'Tier 0 cannot intervene (§3.2)');

  // Deliberately NOT calling recordIntervention here — that is the point.
  const afterPass1: PriorPassState | null = null;

  // Pass 2 — Tier 2 gate. Medium, and it warns.
  const pass2 = computeEffectiveTier('Medium', afterPass1);
  assert.equal(pass2.effectiveTier, 'Medium');
  assert.equal(pass2.monotonicFloorApplied, false, 'no prior intervention to floor against');
  const afterPass2 = recordIntervention(afterPass1, pass2.effectiveTier);
  assert.equal(afterPass2.highestInterventionTier, 'Medium');

  // Pass 3 — drops to Low.
  const pass3 = computeEffectiveTier('Low', afterPass2);
  assert.equal(pass3.rawTier, 'Low');
  assert.equal(pass3.effectiveTier, 'Medium',
    '§11.3: floored at the INTERVENED tier (Medium), not the highest tier reached (High)');
  assert.notEqual(pass3.effectiveTier, 'High',
    'flooring on the prior passs tier would over-floor and suppress a permitted de-escalation');
  assert.equal(pass3.monotonicFloorApplied, true);
  assert.equal(pass3.interventionLocked, true);
}

// --- Escalation above the floor is unconstrained (§11.3) ------------------

{
  const prior = recordIntervention(null, 'Medium');
  const escalated = computeEffectiveTier('High', prior);
  assert.equal(escalated.effectiveTier, 'High', '§11.3: "A later pass MAY raise the tier freely"');
  assert.equal(escalated.monotonicFloorApplied, false, 'rawTier already at or above the floor');
  assert.equal(escalated.interventionLocked, true, 'the lock is still reported');

  // At exactly the floor: no escalation applied, but still locked.
  const atFloor = computeEffectiveTier('Medium', prior);
  assert.equal(atFloor.effectiveTier, 'Medium');
  assert.equal(atFloor.monotonicFloorApplied, false, 'equal to the floor is not "lowered below" it');
}

// --- thresholdsFrom reads the live rule set -------------------------------

{
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const ruleSet = JSON.parse(readFileSync(join(repoRoot, 'rulesets', 'rules-v0.1.0.json'), 'utf8'));
  assert.deepEqual(thresholdsFrom(ruleSet), { medium: 30, high: 60 },
    'thresholds come from the rule set (§13.2), never hard-coded');
}

// --- Option C: recordCommittedPass at the pass-commit boundary ------------
//
// The BINDING REQUIREMENT test. `anyPriorPrimaryFindingActive` must be set by
// the pass-commit reducer UNCONDITIONALLY — never gated on an intervention.
// The decisive case: a pass produces a primary finding with non-zero effective
// weight but stays LOW (no intervention presented, so `recordIntervention` is
// never called). If the update were folded into `recordIntervention`, this
// finding would be silently missed. `recordCommittedPass` must capture it.

const scoringEntry = (over: Partial<ScoringEntry>): ScoringEntry => ({
  findingId: 'f1' as ScoringEntry['findingId'],
  ruleId: 'CRED-06' as ScoringEntry['ruleId'],
  ruleType: 'primary',
  parentRuleId: null,
  baseWeight: 40,
  suppressionsApplied: [],
  maxReduction: 0,
  effectiveWeight: 40,
  subsumed: false,
  parentQualified: null,
  countedInScore: true,
  ...over,
});

{
  // A primary finding with non-zero weight, on a pass that NEVER intervened
  // (no recordIntervention call anywhere in this sequence).
  const primaryLowPass: readonly ScoringEntry[] = [scoringEntry({ effectiveWeight: 40 })];
  const afterCommit = recordCommittedPass(null, primaryLowPass);
  assert.equal(afterCommit.anyPriorPrimaryFindingActive, true,
    'BINDING: a prior primary finding with non-zero weight sets the flag even with NO intervention presented');
  assert.equal(afterCommit.interventionPresented, false,
    'proof the flag was set WITHOUT any intervention — recordIntervention was never called');
  assert.equal(afterCommit.highestInterventionTier, null);

  // recordIntervention ALONE must NOT set the flag — it owns only the tier/lock.
  const afterInterventionOnly = recordIntervention(null, 'High');
  assert.equal(afterInterventionOnly.anyPriorPrimaryFindingActive, false,
    'recordIntervention must NOT set anyPriorPrimaryFindingActive — that is recordCommittedPass\'s job');

  // A pass with NO primary finding does not set it.
  const noPrimary = recordCommittedPass(null, []);
  assert.equal(noPrimary.anyPriorPrimaryFindingActive, false);

  // An AGGRAVATOR-only pass does not set it (filter is ruleType === 'primary').
  const aggravatorOnly = recordCommittedPass(null, [scoringEntry({ ruleType: 'aggravator', effectiveWeight: 40 })]);
  assert.equal(aggravatorOnly.anyPriorPrimaryFindingActive, false,
    'an aggravator finding must not set the primary-finding flag');

  // A primary finding fully suppressed to effectiveWeight 0 does not set it.
  const zeroWeight = recordCommittedPass(null, [scoringEntry({ effectiveWeight: 0, maxReduction: 1 })]);
  assert.equal(zeroWeight.anyPriorPrimaryFindingActive, false,
    'a primary finding with zero effective weight must not set the flag (filter is effectiveWeight > 0)');

  // Monotonic OR: once true, a later pass with no primary finding keeps it true.
  const stillTrue = recordCommittedPass(afterCommit, []);
  assert.equal(stillTrue.anyPriorPrimaryFindingActive, true,
    'monotonic: the flag never clears within a Session once a prior primary finding was committed');

  // Composition: recordCommittedPass then recordIntervention preserves BOTH.
  const composed = recordIntervention(afterCommit, 'Medium');
  assert.equal(composed.anyPriorPrimaryFindingActive, true, 'recordIntervention carries the flag through');
  assert.equal(composed.interventionPresented, true);
  assert.equal(composed.highestInterventionTier, 'Medium');
  // ...and the reverse order preserves the tier/lock the intervention set.
  const composedReverse = recordCommittedPass(composed, [scoringEntry({ effectiveWeight: 40 })]);
  assert.equal(composedReverse.highestInterventionTier, 'Medium', 'recordCommittedPass carries the tier through');
  assert.equal(composedReverse.interventionPresented, true);
  assert.equal(composedReverse.anyPriorPrimaryFindingActive, true);
}

console.log('all stage7-8 fixture assertions passed');
