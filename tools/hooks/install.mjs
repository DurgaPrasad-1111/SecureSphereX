#!/usr/bin/env node
// Activates the committed git hooks by pointing core.hooksPath at tools/hooks.
// Wired to npm's `prepare` lifecycle (package.json) so a fresh clone gets the
// pre-commit lint gate on its first `npm install` — without this, core.hooksPath
// is per-clone local config and a new contributor would silently have no hook,
// exactly the "CI enforces what local never runs" gap DEFECT-36 records.
//
// No-ops (exit 0) when this is not a git working tree — e.g. an exported
// tarball or a `npm ci` outside the repo — so it can never break `npm install`.
import { spawnSync } from 'node:child_process';

const inWorkTree = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
if (inWorkTree.status !== 0 || inWorkTree.stdout.trim() !== 'true') {
  process.exit(0);
}

const set = spawnSync('git', ['config', 'core.hooksPath', 'tools/hooks'], { stdio: 'inherit' });
if (set.status === 0) {
  console.log('git hooks activated: core.hooksPath -> tools/hooks (pre-commit lint gate on).');
}
process.exit(set.status ?? 0);
