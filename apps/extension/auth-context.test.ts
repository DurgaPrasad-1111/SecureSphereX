/**
 * A1.5 — authContext (ACEM) wired to A1.3's real AuthStore.
 *
 * EXIT CRITERION: "Version-mismatch → unevaluable, never absent-match."
 *
 * The engine's computeAuthContextFindings already routes a store
 * `versionMismatch` to `unevaluable(fingerprint_version_mismatch)` (B-4,
 * authContext.ts) — that logic lives in the engine and is fixture-tested
 * there. What A1.5 proves is the INTEGRATION: the real A1.3 AuthStore, used as
 * the module's AuthStoreReader, actually PRODUCES a versionMismatch when its
 * stored fingerprints were written under a different algorithm version, and
 * that it flows end-to-end to `unevaluable` — never to an absent match
 * (originPresent:false), which would be a false negative.
 *
 * Run: node --experimental-strip-types apps/extension/auth-context.test.ts
 */

import assert from 'node:assert/strict';

import { AuthStore, DEFAULT_AUTH_STORE_CONFIG, type AuthStorageBackend } from './auth-store.ts';
import { computeAuthContextFindings } from '../../packages/engine/modules/authContext.ts';
import { toOrigin } from '../../packages/contracts/evidence.contract.v1.ts';
import {
  present,
  type LoginInterfaceEvidence, type LoginFingerprint, type Origin,
} from '../../packages/contracts/evidence.contract.v1.ts';
import type { AuthRecordRequest } from '../../packages/contracts/boundary.interfaces.v1.ts';

function memoryBackend(): AuthStorageBackend {
  const data: Record<string, unknown> = {};
  return {
    async get(keys) {
      if (keys === null) return JSON.parse(JSON.stringify(data));
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in data) out[k] = JSON.parse(JSON.stringify(data[k]));
      return out;
    },
    async set(items) { for (const [k, v] of Object.entries(items)) data[k] = JSON.parse(JSON.stringify(v)); },
    async remove(keys) { for (const k of (Array.isArray(keys) ? keys : [keys])) delete data[k]; },
  };
}

function mustOrigin(url: string): Origin {
  const o = toOrigin(url);
  assert.ok(o !== null);
  return o;
}

function fp(version: string): LoginFingerprint {
  return {
    fingerprintAlgorithmVersion: version,
    fieldComposition: ['username', 'password'],
    titleTokens: ['sign', 'in'],
    faviconHash: 'favicon-A',
    heroImagePerceptualHash: 'hero-A',
    dominantColors: ['#fff'],
  };
}

/** A LoginInterfaceEvidence carrying a present fingerprint — the only field
 *  computeAuthContextFindings reads. */
function evidenceWith(version: string): LoginInterfaceEvidence {
  return {
    credentialFormPresent: present(true),
    forms: present([]),
    fingerprint: present(fp(version)),
  };
}

const bank = mustOrigin('https://bank.example/login');
const config = { ...DEFAULT_AUTH_STORE_CONFIG, establishAuthCount: 1, establishDistinctDays: 1 };

function req(origin: Origin, version: string): AuthRecordRequest {
  return {
    origin, fingerprint: fp(version),
    credFindingActiveInSession: false, interventionOverriddenInSession: false,
    isPrivateContext: false, analysisSessionId: 'sess' as AuthRecordRequest['analysisSessionId'],
  };
}

/* ══ EXIT CRITERION: version mismatch → unevaluable, NEVER absent-match ═══ */
{
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: false, config, today: () => '2026-08-01' });
  // Store learned an origin under algorithm version v1.
  const rec = await store.recordAuthentication(req(bank, 'v1'));
  assert.equal(rec.result, 'recorded');

  // A pass runs under a DIFFERENT algorithm version, v2, at an UNKNOWN origin.
  // A naive store would say "absent" (originPresent:false) — a false negative.
  const result = await computeAuthContextFindings(mustOrigin('https://unknown.example/l'), evidenceWith('v2'), store);

  assert.equal(result.status, 'unevaluable', 'version mismatch MUST be unevaluable');
  assert.equal(result.status === 'unevaluable' ? result.reason : '', 'fingerprint_version_mismatch',
    'with the specific version-mismatch reason');
  // The critical negative: it is NOT an evaluated absent-match.
  assert.notEqual(result.status, 'evaluated',
    'version mismatch must NEVER surface as an evaluated result (would be a false negative absent-match)');
}

/* ══ POSITIVE: matching version, real lookup, real evaluated result ══════ */
{
  const store = new AuthStore({ backend: memoryBackend(), isPrivateContext: false, config, today: () => '2026-08-01' });
  await store.recordAuthentication(req(bank, 'v1'));

  // Same origin, same algorithm version -> a real evaluated finding.
  const present0 = await computeAuthContextFindings(bank, evidenceWith('v1'), store);
  assert.equal(present0.status, 'evaluated', 'matching version + known origin -> evaluated');
  assert.equal(present0.status === 'evaluated' && present0.findings.originPresent, true, 'origin is present');
  assert.equal(present0.status === 'evaluated' && present0.findings.lifecycleState, 'ESTABLISHED');
  assert.equal(present0.status === 'evaluated' && present0.findings.storeAvailable, true);

  // Unknown origin, matching version -> evaluated absent (a real, legitimate
  // absent-match — distinct from the version-mismatch case above).
  const absent0 = await computeAuthContextFindings(mustOrigin('https://other.example/l'), evidenceWith('v1'), store);
  assert.equal(absent0.status, 'evaluated', 'unknown origin at matching version is a legitimate evaluated absent');
  assert.equal(absent0.status === 'evaluated' && absent0.findings.originPresent, false);
}

console.log('A1.5 PROVEN: A1.3 AuthStore wired as the ACEM AuthStoreReader. Version mismatch flows');
console.log('  end-to-end to unevaluable(fingerprint_version_mismatch) — never an absent-match false');
console.log('  negative. Matching-version lookups evaluate for real (present + legitimate absent).');
