#!/usr/bin/env node
// Working CI script — G-2, G-3, G-6 architectural invariants (DEC-11-adjacent;
// tracked as DEFECT-13, now resolved for G-2/G-3, DEFECT-14 for G-6's honest
// scope limit).
//
// G-2  Origin casts       — evidence.contract.v1.ts I-9, boundary.interfaces.v1.ts
//                            B-2: only toOrigin() may construct an Origin. No
//                            `as Origin` / `as unknown as Origin` outside it.
// G-3  Engine purity      — CLAUDE.md §2.1: packages/engine SHALL NOT reference
//                            chrome.*, window, document, localStorage, or any
//                            DOM/browser API.
// G-6  Transmission audit — RuleEngine-Spec-v0_8.md §20.2: no code path
//                            reachable from a network-request constructor may
//                            read the Authentication History Store.
//
//                            G-6 IS NOT REAL REACHABILITY ANALYSIS. The spec
//                            calls for tracing actual call-graph reachability
//                            from a network constructor to a store read. That
//                            requires a real call graph — and the store has no
//                            concrete implementation yet (AuthStoreReader /
//                            AuthStoreWriter are interfaces only; "reachable
//                            from a network call to the store" isn't even a
//                            well-defined graph query against code that
//                            doesn't exist). What's implemented below is a
//                            co-occurrence heuristic: a file referencing
//                            AuthStoreReader/AuthStoreWriter AND containing a
//                            network-call construct is flagged as a MANUAL
//                            REVIEW TRIGGER, not a proven violation. It does
//                            not fail the build. See DEFECT-14.
//
// USAGE
//   node tools/ci/architectural-gates.mjs

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const REPO_ROOT = path.dirname(path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))));

const SCAN_ROOTS_G2 = ['packages', 'apps', 'fixtures'];
const SCAN_ROOTS_G3 = ['packages/engine'];
const SCAN_ROOTS_G6 = ['packages', 'apps'];

// __gatecheck__ is deliberately NOT excluded: ci.yml's boundary-violation-check
// job seeds a violation under packages/engine/src/__gatecheck__/ specifically
// so this script catches it — excluding the directory would silently defeat
// that job's entire purpose.
const EXCLUDE_DIR_NAMES = new Set(['node_modules', 'dist', 'build']);

function walkTsFiles(rootRel) {
  const root = path.join(REPO_ROOT, rootRel);
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
        stack.push(path.join(dir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        out.push(path.join(dir, entry.name));
      }
    }
  }
  return out;
}

function relOf(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

function parseFile(absPath) {
  const text = fs.readFileSync(absPath, 'utf-8');
  return ts.createSourceFile(absPath, text, ts.ScriptTarget.ES2022, /* setParentNodes */ true, ts.ScriptKind.TS);
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

/** True if `node` is lexically inside a function declared with the given name. */
function isInsideFunctionNamed(node, name) {
  let cur = node.parent;
  while (cur) {
    if (
      (ts.isFunctionDeclaration(cur) || ts.isFunctionExpression(cur)) &&
      cur.name &&
      cur.name.text === name
    ) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

// ── G-2 — Origin casts ──────────────────────────────────────────────────────

function checkG2() {
  const violations = [];
  const files = SCAN_ROOTS_G2.flatMap(walkTsFiles);

  for (const absPath of files) {
    const sourceFile = parseFile(absPath);

    function visit(node) {
      if (ts.isAsExpression(node) && node.type.getText(sourceFile) === 'Origin') {
        if (!isInsideFunctionNamed(node, 'toOrigin')) {
          violations.push({
            file: relOf(absPath),
            line: lineOf(sourceFile, node),
            description: `\`as Origin\` cast outside toOrigin(): \`${node.getText(sourceFile)}\``,
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return violations;
}

// ── G-3 — engine purity ─────────────────────────────────────────────────────

const FORBIDDEN_GLOBALS = new Set(['chrome', 'window', 'document', 'localStorage']);

function checkG3() {
  const violations = [];
  const files = SCAN_ROOTS_G3.flatMap(walkTsFiles);

  for (const absPath of files) {
    const sourceFile = parseFile(absPath);

    function visit(node) {
      if (ts.isIdentifier(node) && FORBIDDEN_GLOBALS.has(node.text)) {
        const parent = node.parent;
        // Skip binding positions: declaring a local named e.g. `window` is not
        // a reference to the browser global. Only flag read/use positions.
        const isBindingName =
          (ts.isVariableDeclaration(parent) && parent.name === node) ||
          (ts.isParameter(parent) && parent.name === node) ||
          (ts.isFunctionDeclaration(parent) && parent.name === node) ||
          (ts.isPropertySignature(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node) ||
          (ts.isImportSpecifier(parent) || ts.isImportClause(parent));
        // Property-name position (`x.window`, `(globalThis as any).window`)
        // is deliberately NOT excluded: that's exactly the evasive form a
        // real violation would take to dodge a bare-identifier-only check
        // (this is the literal shape of ci.yml's own existing G-3 seed:
        // `(globalThis as any).window.location.href`). Over-flagging a
        // hypothetical unrelated `.window` property is the correct tradeoff
        // for a purity gate that must not be this easily evadable.

        if (!isBindingName) {
          violations.push({
            file: relOf(absPath),
            line: lineOf(sourceFile, node),
            description: `reference to forbidden browser global \`${node.text}\` in packages/engine`,
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return violations;
}

// ── G-6 — transmission audit (HEURISTIC — see header comment) ─────────────

const NETWORK_CALL_PATTERNS = [/\bfetch\s*\(/, /\bnew\s+XMLHttpRequest\b/, /\baxios[.(]/, /\bhttps?\.request\s*\(/];
const STORE_INTERFACE_PATTERN = /\bAuthStoreReader\b|\bAuthStoreWriter\b/;

function checkG6() {
  const flags = [];
  const files = SCAN_ROOTS_G6.flatMap(walkTsFiles);

  for (const absPath of files) {
    const text = fs.readFileSync(absPath, 'utf-8');
    const referencesStore = STORE_INTERFACE_PATTERN.test(text);
    if (!referencesStore) continue;

    const networkMatch = NETWORK_CALL_PATTERNS.find((re) => re.test(text));
    if (!networkMatch) continue;

    const lines = text.split('\n');
    const networkLine = lines.findIndex((l) => networkMatch.test(l)) + 1;
    flags.push({
      file: relOf(absPath),
      line: networkLine || 1,
      description:
        'file references AuthStoreReader/AuthStoreWriter AND contains a network-call construct — ' +
        'co-occurrence heuristic, NOT proof of a §20.2 violation. Needs manual review.',
    });
  }
  return flags;
}

// ── Reporting — mirrors validate-ruleset.py / contract-conformance-check.py ─

function main() {
  const g2 = checkG2();
  const g3 = checkG3();
  const g6 = checkG6();

  console.log(`${'CHECK'.padEnd(8)} ${'STATUS'.padEnd(8)} DETAIL`);
  console.log('-'.repeat(78));

  let anyFail = false;

  if (g2.length) {
    anyFail = true;
    console.log(`${'G-2'.padEnd(8)} ${'FAIL'.padEnd(8)} ${g2.length} violation(s)`);
    for (const v of g2) console.log(`         ${' '.repeat(8)}   - ${v.file}:${v.line}  ${v.description}`);
  } else {
    console.log(`${'G-2'.padEnd(8)} ${'OK'.padEnd(8)}`);
  }

  if (g3.length) {
    anyFail = true;
    console.log(`${'G-3'.padEnd(8)} ${'FAIL'.padEnd(8)} ${g3.length} violation(s)`);
    for (const v of g3) console.log(`         ${' '.repeat(8)}   - ${v.file}:${v.line}  ${v.description}`);
  } else {
    console.log(`${'G-3'.padEnd(8)} ${'OK'.padEnd(8)}`);
  }

  // G-6 is a heuristic, not a proof — it warns, it does not fail the build.
  if (g6.length) {
    console.log(`${'G-6'.padEnd(8)} ${'REVIEW'.padEnd(8)} ${g6.length} file(s) flagged (heuristic — see DEFECT-14)`);
    for (const v of g6) console.log(`         ${' '.repeat(8)}   - ${v.file}:${v.line}  ${v.description}`);
  } else {
    console.log(`${'G-6'.padEnd(8)} ${'OK'.padEnd(8)} (heuristic found no co-occurrence — see DEFECT-14)`);
  }

  console.log('-'.repeat(78));
  console.log(`RESULT: ${anyFail ? 'NON-CONFORMANT (G-2/G-3)' : 'CONFORMANT (G-2/G-3; G-6 unproven either way, see DEFECT-14)'}`);

  process.exit(anyFail ? 1 : 0);
}

main();
