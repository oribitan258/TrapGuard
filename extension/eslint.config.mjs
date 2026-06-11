import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Flat ESLint config for the TrapGuard extension.
// WXT helpers (defineContentScript, createShadowRootUi, defineBackground, …) are
// auto-imported globals provided by WXT's generated types; declare them here so
// no-undef doesn't flag them. tsc validates their real types via .wxt/tsconfig.
export default tseslint.config(
  {
    // .output build artifacts, generated WXT types, and the manual DevTools probe
    // (a deliberately loose console snippet, not product code).
    ignores: ['.wxt/**', '.output/**', 'node_modules/**', 'dist/**', 'e2e/spike/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        // WXT auto-imports (https://wxt.dev/guide/essentials/config/auto-imports)
        defineContentScript: 'readonly',
        defineBackground: 'readonly',
        defineUnlistedScript: 'readonly',
        defineConfig: 'readonly',
        createShadowRootUi: 'readonly',
        createIntegratedUi: 'readonly',
        createIframeUi: 'readonly',
        browser: 'readonly',
        storage: 'readonly',
        injectScript: 'readonly',
      },
    },
    rules: {
      // Force explicit reasoning on any escape hatch (CLAUDE.md: no silent any).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },
  {
    // Playwright E2E + config run in Node, not the browser.
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Playwright fixtures destructure an empty fixtures bag: async ({}, use).
      'no-empty-pattern': 'off',
    },
  },
);
