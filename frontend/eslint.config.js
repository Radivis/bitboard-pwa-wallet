import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/** react-hooks "recommended" here is the classic two rules, not plugin v7's expanded flat.recommended (React Compiler). */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'eslint.config.js',
      'playwright-report/**',
      'src/routeTree.gen.ts',
      'src/wasm-pkg/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Catch snake_case field leaks in app code (wire/DB layers use dedicated files).
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/workers/**',
      'src/lib/lightning/lightning-wire-types.ts',
      'src/db/**',
      'src/wasm-pkg/**',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/__tests__/**',
      'src/test-utils/**',
      'src/pages/setup/**',
      'src/routeTree.gen.ts',
      'src/vite-env.d.ts',
    ],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'objectLiteralProperty',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          filter: {
            regex: '_',
            match: true,
          },
        },
      ],
    },
  },
  {
    files: ['src/routes/**/*.{ts,tsx}'],
    rules: {
      // TanStack Router files export `Route` and define local route components; not compatible with "single component export".
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Tooling scripts run under Node and routinely use Playwright's `page.evaluate(...)`,
    // whose callback bodies execute inside a browser context. Both global sets are needed.
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
)
