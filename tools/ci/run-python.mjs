#!/usr/bin/env node
// Cross-platform python launcher. CI (ubuntu-latest, no setup-python action)
// reliably has `python3`, not `python`; some Windows dev machines have the
// reverse (`python3` intercepted by the Microsoft Store app-execution alias,
// only `python` resolves to a real interpreter). Detected at run time so
// neither environment needs a hardcoded, wrong-for-the-other-OS name.
//
// Usage: node tools/ci/run-python.mjs <script.py> [args...]

import { spawnSync } from 'node:child_process';

function resolves(cmd) {
  const probe = spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: false });
  return probe.error === undefined && probe.status === 0;
}

const interpreter = ['python3', 'python'].find(resolves);

if (!interpreter) {
  console.error('run-python.mjs: neither "python3" nor "python" resolves to a working interpreter.');
  process.exit(1);
}

const result = spawnSync(interpreter, process.argv.slice(2), { stdio: 'inherit', shell: false });
process.exit(result.status ?? 1);
