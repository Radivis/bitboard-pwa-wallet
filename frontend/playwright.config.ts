import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Cursor's agent shell may set PLAYWRIGHT_BROWSERS_PATH to an empty sandbox cache.
 * Fall back to the user's normal Playwright install when that path has no browsers.
 */
function ensurePlaywrightBrowsersPath(): void {
  const configuredPath = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (configuredPath == null || configuredPath === '') {
    return
  }
  let hasBrowserInstall = false
  try {
    hasBrowserInstall = fs
      .readdirSync(configuredPath)
      .some((entry) => entry.startsWith('chromium'))
  } catch {
    hasBrowserInstall = false
  }
  if (hasBrowserInstall) {
    return
  }
  const userCachePath = path.join(os.homedir(), '.cache', 'ms-playwright')
  if (fs.existsSync(userCachePath)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = userCachePath
  }
}

ensurePlaywrightBrowsersPath()
/** Prefer `frontend/.env.testnet`; fall back to repo-root `.env.testnet` (common when editing from workspace root). */
for (const envPath of [
  path.join(__dirname, '.env.testnet'),
  path.join(__dirname, '..', '.env.testnet'),
]) {
  dotenv.config({ path: envPath })
}

function buildE2eDevServerCommand(): string {
  const envFlags: string[] = []
  if (process.env.VITE_E2E_NWC_MOCK === 'true') {
    envFlags.push('VITE_E2E_NWC_MOCK=true')
  }
  if (process.env.VITE_E2E_ARKADE_MOCK === 'true') {
    envFlags.push('VITE_E2E_ARKADE_MOCK=true')
  }
  if (envFlags.length === 0) {
    return 'npm run dev'
  }
  return `${envFlags.join(' ')} npm run dev`
}

const devServerCommand = buildE2eDevServerCommand()
const usesE2eMockDevServer =
  process.env.VITE_E2E_NWC_MOCK === 'true' || process.env.VITE_E2E_ARKADE_MOCK === 'true'

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
    reuseExistingServer: !isCi && !usesE2eMockDevServer,
    /** Cold Vite + first WASM init on CI can exceed the default 60s. */
    timeout: isCi ? 180_000 : 60_000,
  },
})
