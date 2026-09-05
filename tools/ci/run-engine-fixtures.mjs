#!/usr/bin/env node
// Runs EVERY packages/engine/*.fixture.test.ts under the type-stripping runner,
// failing on the first non-zero exit. Auto-discovers by glob rather than a
// hardcoded list, so a newly added engine fixture test is gated by verify:all
// automatically — the gap DEFECT-42 fixed cannot silently reopen when someone
// adds the eleventh fixture test.
//
// Usage: node tools/ci/run-engine-fixtures.mjs

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINE_DIR = join(REPO, 'packages', 'engine');

const files = readdirSync(ENGINE_DIR)
  .filter((f) => f.endsWith('.fixture.test.ts'))
  .sort();

if (files.length === 0) {
  console.error('run-engine-fixtures.mjs: no packages/engine/*.fixture.test.ts files found — expected at least one.');
  process.exit(1);
}

console.log(`run-engine-fixtures.mjs: running ${files.length} engine fixture test(s)`);
for (const f of files) {
  const rel = join('packages', 'engine', f);
  console.log(`\n── ${rel} ──`);
  const result = spawnSync('node', ['--experimental-strip-types', rel], { stdio: 'inherit', shell: false, cwd: REPO });
  if ((result.status ?? 1) !== 0) {
    console.error(`\nrun-engine-fixtures.mjs: FAILED on ${rel} (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}
console.log(`\nrun-engine-fixtures.mjs: all ${files.length} engine fixture test(s) passed ✓`);
