// G-4 / G-5 — enforces the package dependency matrix (CLAUDE.md §2,
// Stage0-Completion-Pack.md §2). Invoked in CI as:
//   npx depcruise --config .dependency-cruiser.cjs packages apps tools
//
// | Package     | May import        | MUST NOT import                          |
// |-------------|--------------------|--------------------------------------------|
// | contracts   | nothing            | everything                                  |
// | engine      | contracts          | extension, harness, capture, browser APIs   |
// | extension   | contracts, engine  | harness, capture                            |
// | harness     | contracts, engine  | extension                                   |
// | capture     | contracts (D0.5)   | engine, extension, harness                  |
//
// "MUST NOT reference chrome.*/window/document/... browser APIs" (§2.1) is
// an AST purity check, not a module-boundary check — that's G-3, in
// tools/ci/architectural-gates.mjs, not this file.
//
// tools/capture is Python; dependency-cruiser only walks the JS/TS graph,
// so the capture row has nothing to violate today. Its rule is kept below
// so a future .ts file under tools/capture is still governed by it.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'contracts-imports-nothing',
      comment: '§2: packages/contracts may not import any other internal package.',
      severity: 'error',
      from: { path: '^packages/contracts' },
      to: { path: '^(packages/engine|apps/|tools/)' },
    },
    {
      name: 'engine-boundary',
      comment: '§2: packages/engine may import only packages/contracts.',
      severity: 'error',
      from: { path: '^packages/engine' },
      to: { path: '^(apps/extension|apps/harness|tools/capture)' },
    },
    {
      name: 'extension-boundary',
      comment: '§2: apps/extension may import packages/contracts and packages/engine, not harness or capture.',
      severity: 'error',
      from: { path: '^apps/extension' },
      to: { path: '^(apps/harness|tools/capture)' },
    },
    {
      name: 'harness-boundary',
      comment: '§2: apps/harness may import packages/contracts and packages/engine, not extension.',
      severity: 'error',
      from: { path: '^apps/harness' },
      to: { path: '^apps/extension' },
    },
    {
      name: 'capture-boundary',
      comment: '§2: tools/capture may import only packages/contracts (D0.5), not engine/extension/harness.',
      severity: 'error',
      from: { path: '^tools/capture' },
      to: { path: '^(packages/engine|apps/extension|apps/harness)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.mjs', '.js', '.json'],
    },
  },
};
