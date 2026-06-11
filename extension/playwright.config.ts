import { defineConfig } from '@playwright/test';

// E2E for the TrapGuard upload gate. Each test loads the UNPACKED build
// (.output/chrome-mv3) into a persistent Chromium context and drives a real
// upload on a routed claude.ai / chatgpt.com fixture (see e2e/fixtures.ts).
// The `pnpm e2e` script runs `wxt build` first so .output is fresh.
//
// Extensions require a persistent context, so tests run serially (workers: 1).
export default defineConfig({
  testDir: './e2e',
  // screens.spec.ts is a dev-only visual-capture harness, excluded from the gate.
  // Run it with: `TG_SCREENS=1 TG_HIDPI=1 npx playwright test e2e/screens.spec.ts`.
  testIgnore: process.env.TG_SCREENS === '1' ? [] : '**/screens.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
});
