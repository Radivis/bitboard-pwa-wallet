import { defineConfig, devices } from '@playwright/test'

const devServerCommand =
  process.env.VITE_E2E_NWC_MOCK === 'true'
    ? 'VITE_E2E_NWC_MOCK=true npm run dev'
    : 'npm run dev'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  reporter: [
    ['html', { open: 'on-failure' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: devServerCommand,
    url: 'http://localhost:3000',
    reuseExistingServer:
      !process.env.CI && process.env.VITE_E2E_NWC_MOCK !== 'true',
  },
})
