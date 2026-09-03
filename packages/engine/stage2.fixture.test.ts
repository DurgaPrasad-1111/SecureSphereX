/**
 * Fixture test for Stage 2 predicate matching (packages/engine/stage2.ts).
 *
 * Two parts: (1) unit-level coverage of every Predicate AST operator
 * against synthetic evaluation sets, including the §5.6/DEFECT-19
 * absent-evidence and null-domain non-matching rules; (2) an integration
 * run of the REAL rules-v0.1.0.json against the REAL 4 SecurityEvidence
 * fixtures, via the REAL Stage 1 dispatch (evaluateAllModules) — not
 * synthetic data end to end.
 *
 * Run directly:
 *   node --experimental-strip-types packages/engine/stage2.fixture.test.ts
 * Exits 0 and prints "all stage2 fixture assertions passed" on success;
 * throws (nonzero exit) at the first failed assertion otherwise.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModuleId } from '../contracts/evaluation.contract.v1.ts';
import type { AuthStoreReader } from '../contracts/boundary.interfaces.v1.ts';
import type { Predicate, RuleSet } from '../contracts/ruleset.format.v1.ts';
import type { ModuleDispatchResult } from './orchestrator.ts';
import { evaluateAllModules } from './orchestrator.ts';
import {
  matchPredicate, matchRule, matchAllRules,
} from './stage2.ts';
import { cleanLogin } from '../../fixtures/clean-login.ts';
import { noCredential } from '../../fixtures/no-credential.ts';
import { offOriginPost } from '../../fixtures/off-origin-post.ts';
import { ssoFlow } from '../../fixtures/sso-flow.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Cast at the file-loading boundary only — matches the established pattern
// in tools/ci/compute-ruleset-digest.mjs (readFileSync + JSON.parse), not a
// new convention.
const ruleSet = JSON.parse(
  readFileSync(join(REPO_ROOT, 'rulesets', 'rules-v0.1.0.json'), 'utf8'),
) as RuleSet;

// A minimal rule set (own parameters/refinementSets, empty rules array) for
// the unit-level operator tests below, so they don't depend on rules-v0.1.0's
// exact current parameter values.
const testRuleSet: RuleSet = {
  ...ruleSet,
  parameters: [
    { id: 'redirect_hop_min', value: 2, unit: 'hops', rationale: 'test', confidence: 'Unvalidated' },
  ],
  refinementSets: [
    { id: 'executableTypes', members: ['exe', 'zip'], matchMode: 'exact', rationale: 'test' },
  ],
  rules: [],
};

// --- Synthetic evaluation set helpers ---------------------------------

const ALL_MODULE_IDS: readonly ModuleId[] = [
  'url', 'ssl', 'dns', 'redirect', 'loginForm', 'javascript',
  'homograph', 'authContext', 'downloadContext', 'permissionContext',
];

function baseEvaluations(): Record<ModuleId, ModuleDispatchResult> {
  const entries = ALL_MODULE_IDS.map((moduleId) => [
    moduleId,
    {
      moduleId,
      // A real (if fixed) value, not omitted — the previous version of
      // this helper had a latent gap: the `as` cast below let a
      // structurally-incomplete object (missing evaluationId entirely)
      // through at compile time, undetectable until something actually
      // read .evaluationId at runtime and got undefined.
      evaluationId: `test-evaluation-id-${moduleId}`,
      result: { status: 'unevaluable', reason: 'required_evidence_not_collected' },
    },
  ]);
  return Object.fromEntries(entries) as Record<ModuleId, ModuleDispatchResult>;
}

// --- Unit: 'is' -------------------------------------------------------

{
  const evaluations = {
    ...baseEvaluations(),
    loginForm: {
      moduleId: 'loginForm' as const,
      evaluationId: 'test-evaluation-id',
      result: {
        status: 'evaluated' as const,
        findings: { credentialFormPresent: true, forms: [], pageRegistrableDomain: null },
      },
    },
  };
  const predicate: Predicate = { op: 'is', path: 'loginForm.credentialFormPresent' };
  assert.equal(matchPredicate(predicate, evaluations, testRuleSet, 'TEST'), true);
}

// 'is' on an unevaluable module -> false, not a crash (§5.6).
{
  const evaluations = baseEvaluations();
  const predicate: Predicate = { op: 'is', path: 'loginForm.credentialFormPresent' };
  assert.equal(matchPredicate(predicate, evaluations, testRuleSet, 'TEST'), false);
}

// --- Unit: 'not' / 'and' / 'or' ----------------------------------------

{
  const evaluations = {
    ...baseEvaluations(),
    url: {
      moduleId: 'url' as const,
      evaluationId: 'test-evaluation-id',
      result: {
        status: 'evaluated' as const,
        findings: {
          scheme: 'https', isSecureScheme: true, registrableDomain: 'example.com',
          subdomainDepth: 0, isIpLiteral: false, totalLength: 20,
          suspiciousKeywordCount: 0, percentEncodedSegmentCount: 0, specialCharacterDensity: 0,
        },
      },
    },
  };
  const isSecure: Predicate = { op: 'is', path: 'url.isSecureScheme' };
  assert.equal(matchPredicate({ op: 'not', operand: isSecure }, evaluations, testRuleSet, 'TEST'), false);
  assert.equal(
    matchPredicate({ op: 'and', operands: [isSecure, isSecure] }, evaluations, testRuleSet, 'TEST'),
    true,
  );
  assert.equal(
    matchPredicate({ op: 'and', operands: [isSecure, { op: 'not', operand: isSecure }] }, evaluations, testRuleSet, 'TEST'),
    false,
  );
  assert.equal(
    matchPredicate({ op: 'or', operands: [{ op: 'not', operand: isSecure }, isSecure] }, evaluations, testRuleSet, 'TEST'),
    true,
  );

  // matchRule: the RuleDefinition-level wrapper, not just the raw predicate.
  const fakeRule = {
    id: 'FAKE-SCHEME', family: 'CRED' as const, name: 'test', type: 'primary' as const, parent: null,
    predicate: isSecure, requiredModules: ['url' as const], baseWeight: 1, tier: 0 as const,
    interveningTier: 0 as const, owner: 'test', introducedIn: '0.1.0', lastModifiedIn: '0.1.0',
    lifecycleState: 'Active' as const, rationale: 'test', empiricalConfidence: 'Unvalidated' as const,
    knownFalsePositiveRisks: [], knownLimitations: [], cweMappings: [], capecMappings: [],
  };
  assert.equal(matchRule(fakeRule, evaluations, testRuleSet), true);
}

// --- Unit: 'gte' -------------------------------------------------------

{
  const evaluations = {
    ...baseEvaluations(),
    redirect: {
      moduleId: 'redirect' as const,
      evaluationId: 'test-evaluation-id',
      result: {
        status: 'evaluated' as const,
        findings: {
          hopCount: 3, initialRegistrableDomain: null, finalRegistrableDomain: null,
          mechanisms: [], chainLength: 3,
        },
      },
    },
  };
  const predicate: Predicate = { op: 'gte', path: 'redirect.hopCount', param: 'redirect_hop_min' };
  assert.equal(matchPredicate(predicate, evaluations, testRuleSet, 'TEST'), true, '3 >= 2');

  const evaluationsLow = {
    ...evaluations,
    redirect: {
      ...evaluations.redirect,
      result: { status: 'evaluated' as const, findings: { ...evaluations.redirect.result.findings, hopCount: 1 } },
    },
  };
  assert.equal(matchPredicate(predicate, evaluationsLow, testRuleSet, 'TEST'), false, '1 >= 2 is false');
}

// --- Unit: 'eq' / 'neq' -------------------------------------------------

{
  const evaluations = {
    ...baseEvaluations(),
    permissionContext: {
      moduleId: 'permissionContext' as const,
      evaluationId: 'test-evaluation-id',
      result: {
        status: 'evaluated' as const,
        findings: {
          requestedPermission: 'camera' as const, requestingRegistrableDomain: null,
          precededByUserGesture: false, pageAgeMs: 400,
        },
      },
    },
  };
  const notNull: Predicate = { op: 'neq', path: 'permissionContext.requestedPermission', value: null };
  assert.equal(matchPredicate(notNull, evaluations, testRuleSet, 'TEST'), true);

  const isNull: Predicate = { op: 'eq', path: 'permissionContext.requestedPermission', value: null };
  assert.equal(matchPredicate(isNull, evaluations, testRuleSet, 'TEST'), false);

  // neq against an UNEVALUABLE module must NOT match, even though
  // undefined !== null would naively be true — §5.6 overrides.
  assert.equal(matchPredicate(notNull, baseEvaluations(), testRuleSet, 'TEST'), false);
}

// --- Unit: 'sameSite' / 'notSameSite', including the DEFECT-19 case -----

{
  const withDomains = {
    ...baseEvaluations(),
    redirect: {
      moduleId: 'redirect' as const,
      evaluationId: 'test-evaluation-id',
      result: {
        status: 'evaluated' as const,
        findings: {
          hopCount: 1, initialRegistrableDomain: 'evil.tld', finalRegistrableDomain: 'good.example',
          mechanisms: [], chainLength: 1,
        },
      },
    },
  };
  const notSameSite: Predicate = {
    op: 'notSameSite', left: 'redirect.finalRegistrableDomain', right: 'redirect.initialRegistrableDomain',
  };
  assert.equal(matchPredicate(notSameSite, withDomains, testRuleSet, 'TEST'), true, 'genuinely different domains');

  const sameDomain = {
    ...withDomains,
    redirect: {
      ...withDomains.redirect,
      result: {
        status: 'evaluated' as const,
        findings: { ...withDomains.redirect.result.findings, finalRegistrableDomain: 'evil.tld' },
      },
    },
  };
  assert.equal(matchPredicate(notSameSite, sameDomain, testRuleSet, 'TEST'), false, 'identical domains');

  // DEFECT-19: redirect.ts always reports both domain fields null.
  // notSameSite(null, null) must NOT match — consistent with DEFECT-19's
  // conclusion that CRED-04 is structurally unable to fire.
  const bothNull = {
    ...baseEvaluations(),
    redirect: {
      moduleId: 'redirect' as const,
      evaluationId: 'test-evaluation-id',
      result: {
        status: 'evaluated' as const,
        findings: { hopCount: 1, initialRegistrableDomain: null, finalRegistrableDomain: null, mechanisms: [], chainLength: 1 },
      },
    },
  };
  assert.equal(
    matchPredicate(notSameSite, bothNull, testRuleSet, 'TEST'), false,
    'DEFECT-19: notSameSite(null, null) must not match',
  );
  const sameSite: Predicate = {
    op: 'sameSite', left: 'redirect.finalRegistrableDomain', right: 'redirect.initialRegistrableDomain',
  };
  assert.equal(matchPredicate(sameSite, bothNull, testRuleSet, 'TEST'), false, 'sameSite(null, null) also not a match');
}

// --- Unit: 'inSet' -------------------------------------------------------

{
  const evaluations = {
    ...baseEvaluations(),
    downloadContext: {
      moduleId: 'downloadContext' as const,
      evaluationId: 'test-evaluation-id',
      result: {
        status: 'evaluated' as const,
        findings: {
          declaredExtension: 'exe', declaredMimeType: null, extensionMimeConsistent: null,
          hasCompoundExtension: false, downloadRegistrableDomain: null, referrerRegistrableDomain: null,
          referrerPresent: true,
        },
      },
    },
  };
  const predicate: Predicate = { op: 'inSet', path: 'downloadContext.declaredExtension', set: 'executableTypes' };
  assert.equal(matchPredicate(predicate, evaluations, testRuleSet, 'TEST'), true);

  const notExecutable = {
    ...evaluations,
    downloadContext: {
      ...evaluations.downloadContext,
      result: {
        status: 'evaluated' as const,
        findings: { ...evaluations.downloadContext.result.findings, declaredExtension: 'pdf' },
      },
    },
  };
  assert.equal(matchPredicate(predicate, notExecutable, testRuleSet, 'TEST'), false);
}

// --- Unit: 'exists' ------------------------------------------------------

{
  const evaluations = {
    ...baseEvaluations(),
    loginForm: {
      moduleId: 'loginForm' as const,
      evaluationId: 'test-evaluation-id',
      result: {
        status: 'evaluated' as const,
        findings: {
          credentialFormPresent: true,
          forms: [
            { fieldKinds: ['username'] as const, method: 'GET' as const, actionRegistrableDomain: 'ok.example', hasHiddenCredentialField: false, hasAutocompleteDisabledCredential: false, injectedAfterLoad: false },
            { fieldKinds: ['password'] as const, method: 'POST' as const, actionRegistrableDomain: null, hasHiddenCredentialField: true, hasAutocompleteDisabledCredential: false, injectedAfterLoad: false },
          ],
          pageRegistrableDomain: null,
        },
      },
    },
  };
  const anyHidden: Predicate = {
    op: 'exists', collection: 'loginForm.forms', where: { op: 'is', path: '$.hasHiddenCredentialField' },
  };
  assert.equal(matchPredicate(anyHidden, evaluations, testRuleSet, 'TEST'), true);

  const anyHiddenViaField: Predicate = {
    op: 'exists', collection: 'loginForm.forms',
    where: { op: 'eq', path: '$.method', value: 'DELETE' },
  };
  assert.equal(matchPredicate(anyHiddenViaField, evaluations, testRuleSet, 'TEST'), false);
}

// --- Unit: 'priorFindingActive' resolves against the threaded prior boolean --
// (Option C, 2026-09-03 — the throw/`blocked` path is retired; the predicate
//  now answers from PriorPassState.anyPriorPrimaryFindingActive.)

{
  const predicate: Predicate = { op: 'priorFindingActive' };
  // Default (no prior boolean) -> noMatch, not a throw. A first pass has no
  // prior committed pass, so DL-01 correctly cannot fire.
  assert.equal(matchPredicate(predicate, baseEvaluations(), testRuleSet, 'DL-01'), false);
  // Threaded true -> match. This is the value DL-01 reads once a prior pass
  // committed a primary finding with non-zero effective weight.
  assert.equal(matchPredicate(predicate, baseEvaluations(), testRuleSet, 'DL-01', undefined, true), true);
  // Never fabricates a match from nothing: threaded false stays noMatch.
  assert.equal(matchPredicate(predicate, baseEvaluations(), testRuleSet, 'DL-01', undefined, false), false);

  const ruleSetWithPriorFindingRule: RuleSet = {
    ...testRuleSet,
    rules: [
      {
        id: 'FAKE-DL', family: 'DL', name: 'test', type: 'primary', parent: null,
        predicate: { op: 'priorFindingActive' }, requiredModules: [], baseWeight: 1, tier: 0,
        interveningTier: 0, owner: 'test', introducedIn: '0.1.0', lastModifiedIn: '0.1.0',
        lifecycleState: 'Active', rationale: 'test', empiricalConfidence: 'Unvalidated',
        knownFalsePositiveRisks: [], knownLimitations: [], cweMappings: [], capecMappings: [],
      },
      {
        id: 'FAKE-URL', family: 'CRED', name: 'test', type: 'primary', parent: null,
        predicate: { op: 'is', path: 'url.isSecureScheme' }, requiredModules: ['url'], baseWeight: 1,
        tier: 0, interveningTier: 0, owner: 'test', introducedIn: '0.1.0', lastModifiedIn: '0.1.0',
        lifecycleState: 'Active', rationale: 'test', empiricalConfidence: 'Unvalidated',
        knownFalsePositiveRisks: [], knownLimitations: [], cweMappings: [], capecMappings: [],
      },
    ],
  };
  // No prior boolean threaded -> FAKE-DL is 'unmatched' (was 'blocked' before
  // Option C), and it MATCHES when the prior boolean is threaded true.
  const noPrior = matchAllRules(baseEvaluations(), ruleSetWithPriorFindingRule);
  assert.equal(noPrior.length, 2);
  assert.equal(noPrior[0]?.status, 'unmatched');
  const withPrior = matchAllRules(baseEvaluations(), ruleSetWithPriorFindingRule, true);
  assert.equal(withPrior[0]?.status, 'matched',
    'priorFindingActive matches once a prior primary finding is threaded in');
  // CORRECTED 2026-08-27 (E-6). FAKE-URL declares requiredModules: ['url'],
  // and `url` is unevaluable in baseEvaluations() — so §15.2's pre-check
  // makes this `unevaluable`, NOT `unmatched`. The previous expectation was
  // the E-6 violation itself: its own comment already noted the module was
  // unevaluable while asserting the rule "found nothing".
  const fakeUrl = noPrior[1];
  assert.equal(fakeUrl?.status, 'unevaluable');
  assert.ok(fakeUrl?.status === 'unevaluable' && fakeUrl.unevaluableModules.includes('url'),
    'the unevaluable module must be named in the outcome (§15.2 unevaluableModules)');
  assert.equal(fakeUrl?.status === 'unevaluable' ? fakeUrl.reason : null, 'required_evidence_not_collected',
    "the module's own reason is carried through, not a rule-level invention");
}

// --- Integration: real rules-v0.1.0.json against real fixtures, via the
// real Stage 1 dispatch (evaluateAllModules) --------------------------

const uncalledStoreReader: AuthStoreReader = {
  lookup: async () => { throw new Error('must not be called — every fixture has fingerprint notCollected'); },
};

const FIXTURES = {
  'clean-login': cleanLogin,
  'no-credential': noCredential,
  'off-origin-post': offOriginPost,
  'sso-flow': ssoFlow,
};

for (const [name, evidence] of Object.entries(FIXTURES)) {
  const dispatch = await evaluateAllModules(evidence, uncalledStoreReader);
  const results = matchAllRules(dispatch, ruleSet);

  assert.equal(results.length, ruleSet.rules.length, `${name}: one result per rule`);
  for (const result of results) {
    // 'unevaluable' added 2026-08-27 — invariant E-6 (evaluation.contract.v1.ts:304)
    // requires Stage 2 to distinguish "could not test" from "tested, no match".
    // 'blocked' retired 2026-09-03 (Option C): priorFindingActive now resolves.
    assert.ok(['matched', 'unmatched', 'unevaluable'].includes(result.status),
      `${name}/${result.ruleId}: bad status`);
    // Every unevaluable outcome must carry §15.2's diagnostic payload.
    if (result.status === 'unevaluable') {
      assert.ok(Array.isArray(result.unevaluableModules), `${name}/${result.ruleId}: missing unevaluableModules`);
      assert.equal(typeof result.reason, 'string', `${name}/${result.ruleId}: missing reason`);
    }
  }

  // DL-01 declares requiredModules ['downloadContext'], unevaluable on all four
  // fixtures (no download evidence), so §15.2's pre-check reports 'unevaluable'
  // before the predicate is touched — it never reaches priorFindingActive here.
  // No rule is ever 'blocked' now (Option C retired that status); the resolved
  // priorFindingActive path is covered by the unit test above.
  const dl01 = results.find((r) => r.ruleId === 'DL-01');
  assert.equal(dl01?.status, 'unevaluable', `${name}: DL-01 unevaluable (downloadContext not collected)`);

  // DEFECT-19: CRED-04 can never match against real dispatch, for any
  // fixture, because redirect.ts always reports both domain fields null.
  //
  // CORRECTED 2026-08-27 (E-6): the property being asserted is "never
  // MATCHED", which is what DEFECT-19 established. The exact non-matching
  // STATUS is now fixture-dependent: CRED-04 declares requiredModules
  // ['redirect','loginForm'], and on no-credential `loginForm` is unevaluable,
  // so §15.2 reports 'unevaluable' there while the other three fixtures
  // report 'unmatched'. Asserting 'unmatched' flatly would re-encode the very
  // conflation E-6 forbids, so the invariant is asserted directly instead.
  const cred04 = results.find((r) => r.ruleId === 'CRED-04');
  assert.notEqual(cred04?.status, 'matched', `${name}: CRED-04 must never match (DEFECT-19)`);
  assert.ok(
    cred04?.status === 'unmatched' || cred04?.status === 'unevaluable',
    `${name}: CRED-04 status should be unmatched or unevaluable, got ${cred04?.status}`,
  );
}

console.log('all stage2 fixture assertions passed');
