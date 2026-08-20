#!/usr/bin/env node
// PreToolUse guard: blocks Write/Edit/NotebookEdit against frozen artifacts.
// Node instead of bash: Node 22 is already a required toolchain dependency
// (engines + ci.yml), so it's guaranteed present, and Windows can spawn
// `node <script>.mjs` directly without shebang interpretation or a bash
// installation - unlike a bare `.sh` path, which cmd.exe cannot execute.

const FROZEN_MESSAGE =
  "Frozen artifact. Contracts are amended by hand per DECISIONS.md Annex A, never by Claude Code. Generated schemas are never hand-edited. spec/ is the read-only audited baseline.";

const UNPARSEABLE_MESSAGE =
  "block-frozen.mjs: could not determine tool_input.file_path from stdin. Failing closed: refusing this write/edit rather than risking an unchecked frozen-file edit.";

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

function isFrozenPath(path) {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.includes("packages/contracts/")) return true;
  if (normalized.includes("spec/")) return true;
  if (/d0_\d+_schema\.json/.test(normalized)) return true;
  return false;
}

const raw = await readStdin();

let filePath;
try {
  const input = JSON.parse(raw);
  filePath = input?.tool_input?.file_path;
} catch {
  console.error(UNPARSEABLE_MESSAGE);
  process.exit(2);
}

if (typeof filePath !== "string" || filePath.length === 0) {
  console.error(UNPARSEABLE_MESSAGE);
  process.exit(2);
}

if (isFrozenPath(filePath)) {
  console.error(FROZEN_MESSAGE);
  process.exit(2);
}

process.exit(0);