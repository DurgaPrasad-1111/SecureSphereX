#!/usr/bin/env node
// PreToolUse guard: blocks Write/Edit/NotebookEdit against frozen artifacts,
// and blocks Bash commands that mutate frozen artifacts via shell redirection
// or common mutating utilities. The Bash check is a heuristic tripwire, not a
// security boundary — a write through python, a here-doc, or an unusual tool
// can still slip past it. The durable control is that spec/ and
// packages/contracts/ are now committed to git, so any change shows up in
// `git status` regardless of how it got written.
//
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

function bashTargetsFrozenPath(command) {
  // `> path` or `>> path` — the token immediately following the redirect.
  for (const m of command.matchAll(/>>?\s*([^\s;|&]+)/g)) {
    if (isFrozenPath(m[1])) return true;
  }

  // Mutating utilities: rm, mv, cp, tee, truncate, install.
  if (/\b(rm|mv|cp|tee|truncate|install)\b/.test(command) && isFrozenPath(command)) {
    return true;
  }

  // sed -i (in-place edit).
  if (/\bsed\b/.test(command) && /-i\b/.test(command) && isFrozenPath(command)) {
    return true;
  }

  // dd of=<path>
  const ddMatch = command.match(/\bdd\b.*\bof=([^\s;|&]+)/);
  if (ddMatch && isFrozenPath(ddMatch[1])) return true;

  return false;
}

const raw = await readStdin();

let input;
try {
  input = JSON.parse(raw);
} catch {
  console.error(UNPARSEABLE_MESSAGE);
  process.exit(2);
}

const toolName = input?.tool_name;

if (toolName === "Bash") {
  const command = input?.tool_input?.command;
  if (typeof command !== "string" || command.length === 0) {
    // Fail OPEN: an unparseable Bash invocation must not block every shell
    // call. Failing closed here is precisely the bug that broke every Bash
    // call the first time this hook was wired to the Bash matcher.
    process.exit(0);
  }
  if (bashTargetsFrozenPath(command)) {
    console.error(FROZEN_MESSAGE);
    process.exit(2);
  }
  process.exit(0);
}

if (toolName === "Write" || toolName === "Edit" || toolName === "NotebookEdit") {
  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== "string" || filePath.length === 0) {
    console.error(UNPARSEABLE_MESSAGE);
    process.exit(2);
  }
  if (isFrozenPath(filePath)) {
    console.error(FROZEN_MESSAGE);
    process.exit(2);
  }
  process.exit(0);
}

process.exit(0);
