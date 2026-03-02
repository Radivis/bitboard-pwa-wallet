import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in parallel by default, but allow sequential mode via E2E_SEQUENTIAL=true */
  /* Sequential mode avoids file descriptor exhaustion when many Vite servers run simultaneously */
  fullyParallel: process.env.E2E_SEQUENTIAL !== 'true',
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry failed tests to handle sporadic failures */
  /* More retries in CI due to higher parallelism and resource contention */
  retries: process.env.CI ? 3 : 1,
  /* Use sequential mode (workers: 1) if E2E_SEQUENTIAL is set, otherwise use default (parallel) */
  workers: process.env.E2E_SEQUENTIAL === 'true' ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { open: 'on-failure' }], // Auto-open report when tests fail
    ['list'], // Console output
    ['./tests/reporter.ts'], // Custom file reporter
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL - will be overridden by frontendServer fixture with dynamic port */
    // baseURL: 'http://localhost:3000',  // Disabled - set dynamically in fixtures
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Run in headed mode if HEADED environment variable is set */
    headless: process.env.HEADED !== 'true',
    /* Slow down operations to make them easier to follow */
    ...(process.env.HEADED === 'true' && { launchOptions: { slowMo: 100 } }),
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Web server is managed by fixtures */
});
