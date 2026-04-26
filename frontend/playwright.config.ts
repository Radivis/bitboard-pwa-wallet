import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env.testnet') })

const devServerCommand =
  process.env.VITE_E2E_NWC_MOCK === 'true'
    ? 'VITE_E2E_NWC_MOCK=true npm run dev'
    : 'npm run dev'

const isCi = !!process.env.CI

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 1,
  /** GitHub-hosted runners are small; too many Chromium + WASM lab workers can OOM or hit 90s timeouts. */
  workers: isCi ? 2 : undefined,
  reporter: isCi
    ? [
        ['github'],
        ['html', { open: 'never' }],
        ['list'],
      ]
    : [
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
      !isCi && process.env.VITE_E2E_NWC_MOCK !== 'true',
    /** Cold Vite + first WASM init on CI can exceed the default 60s. */
    timeout: isCi ? 180_000 : 60_000,
  },
})
