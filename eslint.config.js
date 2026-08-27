// G-1 Lint. Was never authored (DEFECT-12, docs/DEFECTS.md) — the frozen CI
// baseline names a 'G-1 Lint' step from the start, but with no config to run
// against it, so it has never actually run once. Minimal, TypeScript-aware,
// matching this project's tsconfig conventions (strict, noUnusedLocals) —
// deliberately not maximally strict for its own sake.
//
// spec/ is excluded: it is the read-only audited baseline (CLAUDE.md), never
// hand-edited by Claude Code, and lint findings there would be unactionable.

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '**/*.tsbuildinfo',
      'spec/**',
      'corpus/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // tsc's noUnusedLocals already covers .ts files via the TS-aware rule
    // below, which (unlike the base rule) correctly ignores unused
    // parameter names in interface/type member signatures — there is no
    // function body for them to go unused in.
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
  {
    // The .mjs CI tooling has no TS-aware equivalent; use the base rule.
    files: ['**/*.mjs', '**/*.cjs'],
    rules: {
      'no-unused-vars': 'error',
    },
  },
);
