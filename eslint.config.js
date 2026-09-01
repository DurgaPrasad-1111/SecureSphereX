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
      // `**/dist/**`, not `dist/**`: the extension's build output is at
      // apps/extension/dist/**, which a top-level `dist/**` does NOT match —
      // that mismatch was linting the built browser bundles and producing 38
      // spurious no-undef errors (chrome/document) on generated code.
      '**/dist/**',
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
    // Browser + WebExtension globals for the extension ONLY (chrome, document,
    // window, location, MutationObserver, …). Scoped to apps/extension so
    // packages/engine's config is untouched and the engine stays provably free
    // of browser globals (G-3, architectural-gates.mjs). NOTE: the base
    // `no-undef` rule is already off for .ts under tseslint's recommended
    // config, so this is defensive/intent-documenting rather than load-bearing
    // today — the actual no-undef source was the dist bundles, now ignored.
    files: ['apps/extension/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.webextensions },
    },
  },
  {
    // tsc's noUnusedLocals already covers .ts files via the TS-aware rule
    // below, which (unlike the base rule) correctly ignores unused
    // parameter names in interface/type member signatures — there is no
    // function body for them to go unused in.
    files: ['**/*.ts'],
    rules: {
      // `^_`: an underscore-prefixed name is the standard "intentionally
      // unused" signal (e.g. a stub that must accept its typed argument but
      // does not yet use it). A convention, not a per-line suppression.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
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
