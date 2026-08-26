#!/usr/bin/env node
// Computes and verifies rules-v*.json's integrityDigest (D0.3 §12.2).
//
// ALGORITHM, precisely, so this file alone is enough to reproduce it with
// zero other context:
//
//   1. Parse the rule-set JSON file into an in-memory object.
//   2. Make a copy with the top-level `integrityDigest` field set to the
//      empty string `""`. This is the self-reference exclusion: the digest
//      cannot include itself, or writing the digest would change the digest
//      that was just written.
//   3. Serialize that copy to a CANONICAL JSON string:
//        - Object keys are sorted lexicographically (by UTF-16 code unit,
//          i.e. plain `Array.prototype.sort()` on the key strings) at every
//          nesting level. Array element ORDER is preserved as-is — arrays
//          are ordered data, not sorted.
//        - No whitespace anywhere: no space after `:` or `,`, no
//          indentation, no trailing newline in the hashed string itself.
//        - Every value is otherwise serialized via the platform's ordinary
//          `JSON.stringify` for that value's type (strings, numbers,
//          booleans, null) — no unusual escaping. In particular, non-ASCII
//          characters (e.g. "§", "→", "—", which this rule set's prose
//          fields use extensively) are NOT escaped to \uXXXX; they pass
//          through as literal UTF-8 bytes when the string is hashed. If you
//          are reimplementing this in another language, use whatever JSON
//          serializer's default non-ASCII behavior is, but MATCH THIS: no
//          \u-escaping of non-ASCII. (Python's json.dumps defaults to
//          ensure_ascii=True — the OPPOSITE of this script's behavior. Pass
//          ensure_ascii=False if reimplementing there, or digests will not
//          match despite byte-identical logical content.)
//   4. UTF-8 encode that canonical string and take its SHA-256 digest, as a
//      lowercase hex string.
//   5. Prefix with "sha256:". That full string, e.g.
//      "sha256:abcd...1234", is the value that belongs in integrityDigest.
//
// USAGE
//   node tools/ci/compute-ruleset-digest.mjs [path]
//     Computes and prints the digest the file's integrityDigest SHOULD hold
//     right now, given its current content (ignoring whatever value is
//     currently stored there). Does not modify the file.
//
//   node tools/ci/compute-ruleset-digest.mjs --verify [path]
//     Recomputes and compares against the file's ACTUAL current
//     integrityDigest value. Prints MATCH or MISMATCH. Exit 0 on match,
//     1 on mismatch, 2 on a file/parse error.
//
//   [path] defaults to rulesets/rules-v0.1.0.json (repo-root-relative) if
//   omitted.
//
// FOLLOW-UP, not implemented here (see DEFECT-17, docs/DEFECTS.md): this
// verify mode is what should eventually become a 14th static check (V-14)
// in tools/ci/validate-ruleset.py, so a stale digest fails G-8 in CI rather
// than requiring a human to remember to run this script by hand. Scope
// deliberately kept to this standalone script for tonight's fix.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(dirname(BASE)); // tools/ci -> tools -> repo root
const DEFAULT_PATH = join(REPO_ROOT, 'rulesets', 'rules-v0.1.0.json');

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

function computeDigest(ruleset) {
  const copy = { ...ruleset, integrityDigest: '' };
  const canonical = canonicalize(copy);
  const hex = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${hex}`;
}

function main() {
  const args = process.argv.slice(2);
  const verifyMode = args.includes('--verify');
  const positional = args.filter((a) => a !== '--verify');
  const path = positional.length > 0 ? resolve(positional[0]) : DEFAULT_PATH;

  let ruleset;
  try {
    ruleset = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`ERROR: could not read/parse ${path}: ${err.message}`);
    process.exit(2);
  }

  const computed = computeDigest(ruleset);

  if (!verifyMode) {
    console.log(computed);
    process.exit(0);
  }

  const stored = ruleset.integrityDigest;
  if (stored === computed) {
    console.log(`MATCH: ${path}`);
    console.log(`  stored:   ${stored}`);
    console.log(`  computed: ${computed}`);
    process.exit(0);
  } else {
    console.log(`MISMATCH: ${path}`);
    console.log(`  stored:   ${stored}`);
    console.log(`  computed: ${computed}`);
    process.exit(1);
  }
}

main();
