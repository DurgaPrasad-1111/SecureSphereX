#!/usr/bin/env node
// Pre-commit lint gate. Runs eslint on the STAGED lintable files only, at the
// same strictness CI's G-1 uses (`--max-warnings=0`), and blocks the commit
// (non-zero exit) on any error or warning.
//
// WHY THIS EXISTS. DEFECT-36: CI's G-1 Lint caught an eslint break only 4 days
// and 42 red runs after the commit that introduced it (f3520ea), because no
// LOCAL workflow ran eslint. This hook closes that gap — it runs eslint at
// commit time, so the break is caught before it ever reaches CI.
//
// NODE, NOT SHELL (block-frozen.mjs's convention, per DEFECT-8's reasoning): a
// shell hook that resolves its linter through PATH can error on the lookup and
// fail OPEN (commit proceeds uncaught). This is pure Node — Node 22 is a
// guaranteed toolchain dependency (package.json engines, ci.yml) — and it fails
// CLOSED: if eslint cannot be run for any reason, the commit is blocked, never
// silently allowed. eslint is invoked as `node node_modules/eslint/bin/eslint.js`
// (not `npx`, not a `.bin` shim) so there is no PATH lookup and no Windows
// `.cmd` wrapper to depend on.

import { spawnSync } from 'node:child_process';

// Files staged for THIS commit: added / copied / modified / renamed only —
// never deleted (a deleted path must not be handed to eslint). NUL-delimited
// (`-z`) so paths containing spaces survive intact.
const staged = spawnSync(
  'git',
  ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
  { encoding: 'utf8' },
);
if (staged.status !== 0) {
  console.error('pre-commit lint: `git diff --cached` failed; blocking commit to be safe.');
  process.exit(1);
}

// .js .jsx .cjs .mjs .ts .tsx .cts .mts — everything eslint's flat config lints.
const LINTABLE = /\.(?:m|c)?[jt]sx?$/;
const files = staged.stdout.split('\0').filter((f) => f !== '' && LINTABLE.test(f));

if (files.length === 0) {
  // Nothing lintable staged (e.g. a docs-only commit) — nothing to check.
  process.exit(0);
}

// eslint at CI strictness. `--no-warn-ignored`: an explicitly-staged but
// config-ignored path (e.g. something under **/dist/**) is skipped quietly
// instead of counting as a warning that --max-warnings=0 would fail on.
const eslint = spawnSync(
  process.execPath,
  ['node_modules/eslint/bin/eslint.js', '--max-warnings=0', '--no-warn-ignored', ...files],
  { stdio: 'inherit' },
);

if (eslint.status !== 0) {
  console.error(
    `\npre-commit: eslint failed on ${files.length} staged file(s) — commit blocked.\n`
    + 'Fix the errors above. Bypass only with a real reason via `git commit --no-verify`.',
  );
  process.exit(eslint.status ?? 1);
}

process.exit(0);
