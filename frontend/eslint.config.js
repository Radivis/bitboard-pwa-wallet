import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/** react-hooks "recommended" here is the classic two rules, not plugin v7's expanded flat.recommended (React Compiler). */

/** Tailwind type utilities. Color utilities such as `text-[var(--token)]` stay allowed. */
const rawTypeUtilityPattern =
  /(?:^|[^A-Za-z0-9-])(?:text-(?:xs|sm|base|lg|xl|[2-9]xl|\[[0-9])|font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b|leading-|tracking-)/

const rawTypeUtilityMessage =
  'Use a design-type class from design-type.ts. Raw Tailwind size, weight, leading, and tracking utilities are not legal type.'

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
    files: [
      'src/components/design/**/*.{ts,tsx}',
      'src/components/PageHeader.tsx',
      'src/lib/library/article-shared.tsx',
    ],
    ignores: ['src/components/design/**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=/${rawTypeUtilityPattern.source}/]`,
          message: rawTypeUtilityMessage,
        },
        {
          selector: `TemplateElement[value.raw=/${rawTypeUtilityPattern.source}/]`,
          message: rawTypeUtilityMessage,
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
