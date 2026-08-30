#!/usr/bin/env node
// DEC-32 — the CONFIG-ECHO check. Guards the DEFECT-34 class of bug.
//
// THE CLASS: a conformance/parity fixture whose reference side runs at a
// LIBRARY DEFAULT rather than the producer's actual configuration. The fixture
// then verifies that two defaults agree with each other, passes, and proves
// nothing about what this system runs. DEFECT-34 is the worked example:
// psl-reference.py called tldextract.extract() at defaults while capture.py
// ran with include_psl_private_domains=True, and the fixture was green while
// the two PSLs disagreed on 32.5% of phishing snapshots.
//
// ── WHAT THIS CHECK CAN AND CANNOT DO ───────────────────────────────────
// It CANNOT verify that a fixture's configuration is CORRECT. "Correct" means
// "matches the producer", and no tool can derive which of several files is the
// producer, nor that `include_psl_private_domains` and `allowPrivateDomains`
// are the same idea. That mapping is human knowledge.
//
// What it CAN do, and all it claims: force every conformance fixture to make
// an ASSERTION ABOUT ITS ORACLE'S CONFIGURATION. A fixture that never mentions
// its oracle's config cannot possibly be checking it. That is a necessary
// condition, not a sufficient one — and stating the difference is the point,
// because a check that overclaims is the very thing DEFECT-34 was about.
//
// The load-bearing fix is DEC-32's single-source manifest (tools/ci/
// psl-config.json), which removes the duplication instead of policing it.
// This check is the backstop for the NEXT shared config, before someone
// single-sources that one too.
//
// USAGE  node tools/ci/check-conformance-config.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SKIP = new Set(['node_modules', '.git', 'spec', 'corpus', 'dist', 'build']);

/** Every *conformance*.test.ts / *.conformance.ts in the tree. */
function findFixtures(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) findFixtures(p, out);
    else if (/conformance.*\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * A fixture passes if it asserts on a configuration field.
 *
 * Two accepted forms, deliberately narrow so the check cannot be satisfied by
 * accident:
 *   1. an assertion mentioning a config-shaped identifier echoed by an oracle
 *      (`includePrivateDomains`, `*Config`, `config.*`), or
 *   2. an explicit CONFIG-ECHO-EXEMPT marker with a stated reason, for a
 *      fixture that genuinely has no configurable oracle.
 */
const CONFIG_ASSERT = /assert[^;]*\b(includePrivateDomains|[A-Za-z]+Config\b|config\.[A-Za-z]+)/s;
const EXEMPT = /CONFIG-ECHO-EXEMPT:\s*\S+/;

const fixtures = findFixtures(ROOT);
const failures = [];

for (const f of fixtures) {
  const src = readFileSync(f, 'utf8');
  const rel = f.slice(ROOT.length + 1);
  if (EXEMPT.test(src)) continue;
  if (!CONFIG_ASSERT.test(src)) failures.push(rel);
}

console.log(`conformance fixtures scanned: ${fixtures.length}`);
for (const f of fixtures) console.log(`  ${f.slice(ROOT.length + 1)}`);

if (fixtures.length === 0) {
  // A check that finds nothing must not report success — DEFECT-29's lesson.
  console.error('\nFAIL: no conformance fixtures found. Either the naming convention '
    + 'changed or this check is looking in the wrong place; either way it is verifying nothing.');
  process.exit(1);
}

if (failures.length > 0) {
  console.error('\nFAIL — conformance fixture(s) make no assertion about their oracle\'s CONFIGURATION:');
  for (const f of failures) console.error(`  ${f}`);
  console.error('\nA fixture that never mentions its oracle\'s config cannot be checking it, so it may be');
  console.error('comparing two library DEFAULTS to each other and passing while both differ from the');
  console.error('producer (DEFECT-34). Assert the config the oracle echoes, e.g.');
  console.error('    assert.equal(ref.includePrivateDomains, true, ...)');
  console.error('or, if the oracle genuinely takes no configuration, add a line containing');
  console.error('    CONFIG-ECHO-EXEMPT: <reason>');
  process.exit(1);
}

console.log('\nPASS: every conformance fixture asserts on its oracle\'s configuration.');
