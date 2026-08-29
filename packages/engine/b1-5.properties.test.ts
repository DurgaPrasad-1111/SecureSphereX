/**
 * B1.5 / gate G-9 — PROPERTY tests (randomised), as distinct from the
 * example-based `*.fixture.test.ts` files.
 *
 * Exit criteria, from the Implementation-Ownership-Plan: B1.5 is
 * "Randomised; order-independence proven", and its owner-level criterion is
 * "suppression monotonic and order-independent under property test ·
 * aggregation pure and recomputable". Those are the two targets here.
 *
 * SCOPE IS DELIBERATELY B1.2/B1.3 ONLY — `stage4.ts` and `stage5-6.ts`.
 * Extending property coverage to `stage7-8.ts`'s `recordIntervention` and
 * `consistency.ts`'s ten relations is B1.6, tracked as DEC-24, which is
 * UNSIGNED at the time of writing. Those files are deliberately not
 * generated for here. When DEC-24 is signed, a sibling file adds them.
 *
 * Library: `fast-check`, approved in DEC-22. Chosen for shrinking and
 * seeding specifically — a property failure that cannot be replayed
 * deterministically is a defect report nobody can act on, and determinism is
 * §4.3's central claim. Every failure below therefore reports a seed and a
 * shrunk minimal counterexample.
 *
 * No test-runner framework, matching this package's established convention
 * (`url.fixture.test.ts` and its nine siblings): plain assertions, run
 * directly, exit 0 and print on success.
 *
 * Run directly:
 *   node --experimental-strip-types packages/engine/b1-5.properties.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';

import { maxAppliedReduction } from './stage4.ts';
import { computeScoringAndAggregation } from './stage5-6.ts';
import type { CorrelationFinding, SuppressionApplication } from '../contracts/passresult.contract.v1.ts';
import type { RuleSet, RuleDefinition } from '../contracts/ruleset.format.v1.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const realRuleSet = JSON.parse(
  readFileSync(join(REPO_ROOT, 'rulesets', 'rules-v0.1.0.json'), 'utf8'),
) as RuleSet;

/** Report a seed on failure so any counterexample is replayable (§17.2). */
const RUNS = { numRuns: 500, verbose: 0 } as const;

const TARGET_FINDING = 'finding-under-test';

/* ───────────────────────────────────────────────────────────────────────────
 * Generators — structurally valid per the real contract types.
 * ─────────────────────────────────────────────────────────────────────────── */

/** V-7 constrains declared reductions to (0, 1]. Generated within that range. */
const validReduction = fc.double({ min: 0.0001, max: 1, noNaN: true, noDefaultInfinity: true });

/** Deliberately OUTSIDE V-7's range, both directions — for the guard property. */
const invalidReduction = fc.oneof(
  fc.double({ min: -1000, max: -0.0001, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: 1.0001, max: 1000, noNaN: true, noDefaultInfinity: true }),
);

function applicationArb(reduction: fc.Arbitrary<number>, findingId: string): fc.Arbitrary<SuppressionApplication> {
  return fc.record({
    suppressionId: fc.constantFrom('S-01', 'S-02', 'S-A', 'S-B', 'S-C'),
    targetFindingId: fc.constant(findingId),
    targetRuleId: fc.constantFrom('CRED-01', 'CRED-02', 'CRED-06'),
    guardEvaluations: fc.array(fc.record({ guardIndex: fc.nat(3), held: fc.boolean() }), { maxLength: 3 }),
    blockedByRuleId: fc.option(fc.constantFrom('CRED-03'), { nil: null }),
    applied: fc.boolean(),
    declaredReduction: reduction,
  }) as fc.Arbitrary<SuppressionApplication>;
}

/** A list of applications all targeting the SAME finding — the shape
 *  `maxAppliedReduction` reduces over. */
const applicationListArb = fc.array(applicationArb(validReduction, TARGET_FINDING), { maxLength: 12 });

/* ───────────────────────────────────────────────────────────────────────────
 * STEP 3 — Suppression order-independence (B1.2, stage4.ts)
 * ─────────────────────────────────────────────────────────────────────────── */

// (a) maxAppliedReduction is invariant under ANY permutation of the list.
//     §6.1: "commutative and associative, [so] the order... cannot affect the
//     outcome". This is the property B1.5 names by name.
fc.assert(
  fc.property(applicationListArb, (applications) =>
    fc.pre(applications.length > 0) === undefined &&
    true,
  ),
  RUNS,
);

fc.assert(
  fc.property(
    applicationListArb,
    fc.array(fc.nat(), { maxLength: 12 }),
    (applications, shuffleKeys) => {
      // Deterministic permutation driven by generated keys, so a failure
      // shrinks to a concrete ordering rather than a hidden RNG state.
      const permuted = applications
        .map((a, i) => ({ a, k: shuffleKeys[i] ?? i }))
        .sort((x, y) => x.k - y.k)
        .map(({ a }) => a);

      assert.equal(
        maxAppliedReduction(TARGET_FINDING, permuted),
        maxAppliedReduction(TARGET_FINDING, applications),
        'maxAppliedReduction must be invariant under permutation (§6.1 commutative/associative)',
      );
      return true;
    },
  ),
  RUNS,
);

// Reversal is a permutation too — asserted separately because it is the
// permutation a first-element-wins bug is most likely to survive.
fc.assert(
  fc.property(applicationListArb, (applications) => {
    assert.equal(
      maxAppliedReduction(TARGET_FINDING, [...applications].reverse()),
      maxAppliedReduction(TARGET_FINDING, applications),
      'maxAppliedReduction must be invariant under reversal',
    );
    return true;
  }),
  RUNS,
);

// (b) Only `applied: true` entries contribute. Changing which NON-applied
//     entries are present, or their reductions, must not move the result so
//     long as the SET of applied reductions is unchanged.
fc.assert(
  fc.property(
    applicationListArb,
    fc.array(applicationArb(validReduction, TARGET_FINDING), { maxLength: 6 }),
    (applications, noise) => {
      const appliedOnly = applications.filter((a) => a.applied);
      const nonApplied = noise.map((a) => ({ ...a, applied: false as const }));

      assert.equal(
        maxAppliedReduction(TARGET_FINDING, [...applications, ...nonApplied]),
        maxAppliedReduction(TARGET_FINDING, applications),
        'adding arbitrary NON-applied entries must not change the result',
      );
      assert.equal(
        maxAppliedReduction(TARGET_FINDING, appliedOnly),
        maxAppliedReduction(TARGET_FINDING, applications),
        'dropping every non-applied entry must not change the result',
      );
      return true;
    },
  ),
  RUNS,
);

// Applications targeting a DIFFERENT finding must never contribute.
fc.assert(
  fc.property(
    applicationListArb,
    fc.array(applicationArb(validReduction, 'some-other-finding'), { maxLength: 6 }),
    (applications, otherFinding) => {
      assert.equal(
        maxAppliedReduction(TARGET_FINDING, [...applications, ...otherFinding]),
        maxAppliedReduction(TARGET_FINDING, applications),
        'another finding’s applications must never contribute to this one',
      );
      return true;
    },
  ),
  RUNS,
);

// (c) Bounds: never negative, never above the largest applied reduction, and
//     always EQUAL to that maximum when one exists.
fc.assert(
  fc.property(applicationListArb, (applications) => {
    const result = maxAppliedReduction(TARGET_FINDING, applications);
    const appliedReductions = applications.filter((a) => a.applied).map((a) => a.declaredReduction);

    assert.ok(result >= 0, 'maxAppliedReduction is never negative');
    if (appliedReductions.length === 0) {
      assert.equal(result, 0, 'no applied suppression -> reduction 0 (§6.1)');
    } else {
      const expected = Math.max(...appliedReductions);
      assert.equal(result, expected, 'result IS the maximum applied reduction, not a sum or product');
      assert.ok(result <= expected, 'never exceeds the largest individual applied reduction');
      assert.ok(result <= 1, 'V-7 bounds every declared reduction at 1');
    }
    return true;
  }),
  RUNS,
);

/* ───────────────────────────────────────────────────────────────────────────
 * STEP 4 — Aggregation purity (B1.3, stage5-6.ts)
 * ─────────────────────────────────────────────────────────────────────────── */

const RULE_BASE = {
  family: 'CRED', name: 'p', type: 'primary', parent: null,
  predicate: { op: 'is', path: 'url.isSecureScheme' }, requiredModules: [],
  baseWeight: 1, tier: 0, interveningTier: 0, owner: 'p', introducedIn: '0.1.0',
  lastModifiedIn: '0.1.0', lifecycleState: 'Active', rationale: 'p',
  empiricalConfidence: 'Unvalidated', knownFalsePositiveRisks: [], knownLimitations: [],
  cweMappings: [], capecMappings: [],
} as const;

const PROP_RULES: readonly RuleDefinition[] = [
  { ...RULE_BASE, id: 'P-ALPHA', baseWeight: 40 },
  { ...RULE_BASE, id: 'P-BETA', baseWeight: 20 },
  { ...RULE_BASE, id: 'P-COMPOSITE', baseWeight: 50 },
  { ...RULE_BASE, id: 'P-DELTA', baseWeight: 35 },
  { ...RULE_BASE, id: 'P-EPSILON', baseWeight: 10 },
  { ...RULE_BASE, id: 'A-GAMMA', type: 'aggravator', baseWeight: 15, parent: 'P-ALPHA' },
  { ...RULE_BASE, id: 'A-DELTA', type: 'aggravator', baseWeight: 5, parent: 'P-DELTA' },
] as unknown as readonly RuleDefinition[];

const propRuleSet: RuleSet = {
  ...realRuleSet,
  rules: [...PROP_RULES],
  suppressions: [],
  subsumption: [{ composite: 'P-COMPOSITE', subsumes: ['P-BETA'] }],
};

const RULE_IDS = [
  'P-ALPHA', 'P-BETA', 'P-COMPOSITE', 'P-DELTA', 'P-EPSILON', 'A-GAMMA', 'A-DELTA',
] as const;

function findingArb(): fc.Arbitrary<CorrelationFinding> {
  return fc.record({
    findingId: fc.uuid(),
    ruleId: fc.constantFrom(...RULE_IDS),
  }).map(({ findingId, ruleId }) => ({
    findingId,
    contractVersion: '1.0.0',
    targetResourceId: 'res_prop',
    analysisSessionId: 'sess_prop',
    passOrdinal: 1,
    ruleId,
    evaluationRefs: [],
    correlationContext: { emergedInPass: 1, constituentConjunction: null },
  }) as unknown as CorrelationFinding);
}

/**
 * Findings with DISTINCT `ruleId`s — this is Stage 3's actual contract, not a
 * convenience.
 *
 * `matchAllRules` returns `ruleSet.rules.map(...)`: exactly one RuleMatchResult
 * per rule, never two. `generateCorrelationFindings` then emits at most one
 * finding per MATCHED result. So a finding set with two findings of the same
 * rule is structurally unproducible by the pipeline. Confirmed empirically as
 * well as by reading: `clean-login` yields `[]`, `off-origin-post` yields
 * `[CRED-01]`.
 *
 * Generating duplicate-ruleId sets found a real order-dependence in
 * `computeScoringAndAggregation`'s aggravator parent lookup (`findings.find`
 * returns the FIRST parent-rule finding), but on input the pipeline cannot
 * produce. That is logged as DEFECT-28 and deliberately left OPEN — resolving
 * it requires a ruling on §9.3's meaning under multiple parents, not a
 * canonicalisation. Constraining the generator here keeps B1.5 proving
 * properties about what the pipeline can actually emit; it does not paper over
 * DEFECT-28, which is recorded with its own reachability analysis.
 *
 * `findingId` remains unique too — a UUIDv4 per finding, and one per ruleId
 * here — so Fix B's canonical sort key is still total under this generator.
 */
const findingSetArb = fc.uniqueArray(findingArb(), {
  maxLength: 7,
  selector: (f) => f.ruleId,
});

/** Suppression applications keyed to findings actually in the set. */
function applicationsForArb(findings: readonly CorrelationFinding[]): fc.Arbitrary<readonly SuppressionApplication[]> {
  if (findings.length === 0) return fc.constant([]);
  return fc.array(
    fc.record({
      suppressionId: fc.constantFrom('S-01', 'S-02'),
      targetFindingId: fc.constantFrom(...findings.map((f) => f.findingId)),
      targetRuleId: fc.constantFrom(...RULE_IDS),
      guardEvaluations: fc.constant([{ guardIndex: 0, held: true }]),
      blockedByRuleId: fc.constant(null),
      applied: fc.boolean(),
      declaredReduction: validReduction,
    }) as fc.Arbitrary<SuppressionApplication>,
    { maxLength: 6 },
  );
}

/** Deep structural clone — fresh object references, identical content. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// (a) Purity: two calls on structurally-identical but REFERENTIALLY DISTINCT
//     inputs must produce byte-identical output. P-13 (replay) and §9.1
//     ("a pure function over the complete finding set... SHALL NOT be
//     implemented as an incremental accumulator") both require this.
fc.assert(
  fc.property(
    findingSetArb.chain((findings) => fc.tuple(fc.constant(findings), applicationsForArb(findings))),
    ([findings, applications]) => {
      const first = computeScoringAndAggregation(findings, applications, propRuleSet);
      const second = computeScoringAndAggregation(clone(findings), clone(applications), propRuleSet);
      assert.equal(
        JSON.stringify(first), JSON.stringify(second),
        'P-13: identical inputs must recompute byte-identically, across fresh references',
      );
      return true;
    },
  ),
  RUNS,
);

// (b) Order-independence: permuting findings and/or applications must not
//     change score, rawTier, or any aggregated field.
fc.assert(
  fc.property(
    findingSetArb.chain((findings) => fc.tuple(fc.constant(findings), applicationsForArb(findings))),
    fc.array(fc.nat(), { maxLength: 8 }),
    fc.array(fc.nat(), { maxLength: 6 }),
    ([findings, applications], fKeys, aKeys) => {
      const permute = <T>(xs: readonly T[], keys: readonly number[]): T[] =>
        xs.map((x, i) => ({ x, k: keys[i] ?? i })).sort((p, q) => p.k - q.k).map(({ x }) => x);

      const base = computeScoringAndAggregation(findings, applications, propRuleSet);
      const permuted = computeScoringAndAggregation(
        permute(findings, fKeys), permute(applications, aKeys), propRuleSet,
      );

      assert.deepEqual(
        permuted.aggregation, base.aggregation,
        '§9.1: aggregation is a pure function over the SET — order must not matter',
      );
      // Per-finding entries must match too, compared as a set (the scoring
      // array follows input order by construction, which is not a defect).
      const key = (e: { findingId: string }) => e.findingId;
      assert.deepEqual(
        [...permuted.scoring].sort((a, b) => key(a).localeCompare(key(b))),
        [...base.scoring].sort((a, b) => key(a).localeCompare(key(b))),
        'per-finding scoring entries must be permutation-invariant',
      );
      return true;
    },
  ),
  RUNS,
);

// (c) The range guard from 5e1675c, under GENERATED reductions rather than
//     the three hand-picked values already covered by the fixture test.
fc.assert(
  fc.property(
    findingSetArb.filter((fs) => fs.length > 0).chain((findings) =>
      fc.tuple(fc.constant(findings), applicationsForArb(findings))),
    ([findings, applications]) => {
      const { scoring } = computeScoringAndAggregation(findings, applications, propRuleSet);
      for (const entry of scoring) {
        assert.ok(
          entry.effectiveWeight >= 0 && entry.effectiveWeight <= entry.baseWeight,
          `effectiveWeight ${entry.effectiveWeight} outside [0, ${entry.baseWeight}] for ${entry.ruleId}`,
        );
        assert.ok(entry.maxReduction >= 0 && entry.maxReduction <= 1, 'maxReduction within V-7 bounds');
      }
      return true;
    },
  ),
  RUNS,
);

// (c, second half) Out-of-range reductions must throw CONSISTENTLY, for any
// generated bad value — not only the two hand-picked ones already tested.
fc.assert(
  fc.property(
    fc.uuid(),
    invalidReduction,
    (findingId, badReduction) => {
      const finding = {
        findingId, contractVersion: '1.0.0', targetResourceId: 'res_prop',
        analysisSessionId: 'sess_prop', passOrdinal: 1, ruleId: 'P-ALPHA',
        evaluationRefs: [], correlationContext: { emergedInPass: 1, constituentConjunction: null },
      } as unknown as CorrelationFinding;
      const bad = [{
        suppressionId: 'S-01', targetFindingId: findingId, targetRuleId: 'P-ALPHA',
        guardEvaluations: [{ guardIndex: 0, held: true }], blockedByRuleId: null,
        applied: true, declaredReduction: badReduction,
      }] as unknown as readonly SuppressionApplication[];

      assert.throws(
        () => computeScoringAndAggregation([finding], bad, propRuleSet),
        /Suppression may only reduce weight/,
        `engine must reject out-of-range reduction ${badReduction}`,
      );
      return true;
    },
  ),
  RUNS,
);

// Empty finding set stays stable under the same purity property.
fc.assert(
  fc.property(fc.constant(null), () => {
    const a = computeScoringAndAggregation([], [], propRuleSet);
    const b = computeScoringAndAggregation([], [], propRuleSet);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(a.aggregation.score, 0);
    assert.equal(a.aggregation.rawTier, 'Low');
    return true;
  }),
  { numRuns: 1 },
);

console.log('all B1.5 property assertions passed (suppression order-independence; aggregation purity)');
