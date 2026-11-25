// Root ESLint flat config.
// Enforces the non-negotiable monorepo boundary rules from AGENTS.md / B3 §4.2:
//   packages/core MUST remain 100% pure TypeScript (no react-native, expo-*, @tauri-apps/*, DOM globals).
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'tools/pack-builder/out/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      // UI shells (apps/*) run in the browser/WebView; core/tools run in Node.
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // TypeScript handles undefined identifiers; the base rule misfires on TS types/globals.
      'no-undef': 'off',
    },
  },
  {
    // Build-tool configs (babel/metro/…) are Node CommonJS modules: give them Node globals
    // and let them use `require`.
    files: ['**/*.config.js', '**/*.config.cjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Node ESM helper scripts (e.g. the local pack file server).
    files: ['**/*.mjs', 'tools/*/scripts/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
  },
  {
    // Boundary guard: packages/core is platform-agnostic only.
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react-native',
                'react-native-*',
                'expo',
                'expo-*',
                '@tauri-apps/*',
              ],
              message:
                'packages/core must stay platform-agnostic (AGENTS.md rule 1 / B3 §4.2). Inject a platform adapter instead.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'packages/core must not use DOM globals.' },
        { name: 'document', message: 'packages/core must not use DOM globals.' },
        { name: 'localStorage', message: 'packages/core must not use DOM globals.' },
        { name: 'navigator', message: 'packages/core must not use DOM globals.' },
      ],
    },
  },
);
