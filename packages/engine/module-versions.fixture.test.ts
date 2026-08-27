/**
 * Drift guard for `module-versions.ts`.
 *
 * `MODULE_VERSIONS` is hand-maintained, per the Architecture Owner's
 * 2026-08-27 ruling that per-module versioning (not a single shared engine
 * constant) is what DEC-15's LDD signal calls for. Hand-maintained means it
 * can silently fall out of step with the package it ships in — this file is
 * what makes that loud instead.
 *
 * The invariant asserted is deliberately narrow and matches today's reality:
 * NO module has forked yet, so every entry must equal
 * packages/engine/package.json's `version`. The day a single module is
 * genuinely patched independently, this test SHOULD fail — that failure is
 * the prompt to record the fork explicitly (move the diverged module to an
 * allowlist below with a note), not to delete the check.
 *
 * Run directly:
 *   node --experimental-strip-types packages/engine/module-versions.fixture.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MODULE_VERSIONS } from './module-versions.ts';
import type { ModuleId } from '../contracts/evaluation.contract.v1.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

const packageVersion = (
  JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')) as { version: string }
).version;

assert.equal(typeof packageVersion, 'string', 'packages/engine/package.json must declare a version');

/**
 * Modules that have genuinely diverged from the package version, each with
 * the reason. Empty today — nothing has forked. An entry here is a
 * deliberate, recorded decision, never a way to quiet this test.
 */
const FORKED: Partial<Record<ModuleId, string>> = {};

const ALL_MODULE_IDS: readonly ModuleId[] = [
  'url', 'ssl', 'dns', 'redirect', 'loginForm',
  'javascript', 'homograph', 'authContext', 'downloadContext', 'permissionContext',
];

// Every module must be present — a missing key would type-error, but an
// extra/typo'd one would not be caught by Record<ModuleId, string> alone.
assert.deepEqual(
  Object.keys(MODULE_VERSIONS).sort(),
  [...ALL_MODULE_IDS].sort(),
  'MODULE_VERSIONS must have exactly one entry per ModuleId',
);

for (const moduleId of ALL_MODULE_IDS) {
  const declared = MODULE_VERSIONS[moduleId];
  if (FORKED[moduleId] !== undefined) {
    assert.notEqual(declared, packageVersion,
      `${moduleId} is listed as forked but still matches the package version — remove it from FORKED`);
    continue;
  }
  assert.equal(
    declared, packageVersion,
    `${moduleId}: MODULE_VERSIONS says "${declared}" but packages/engine/package.json says ` +
    `"${packageVersion}". Either bump both together, or record the divergence in FORKED with a reason.`,
  );
}

console.log(`all module-versions drift assertions passed (10 modules @ ${packageVersion})`);
