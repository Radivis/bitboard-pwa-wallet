import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

import { E2E_DEV_SERVER_ORIGIN, E2E_DEV_SERVER_PORT } from './tests/e2e/e2e-dev-server'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Playwright always uses a dedicated port — never 3000 (reserved for manual `npm run dev`).
process.env.E2E_DEV_SERVER_PORT = String(E2E_DEV_SERVER_PORT)

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
  const envFlags: string[] = [`E2E_DEV_SERVER_PORT=${E2E_DEV_SERVER_PORT}`]
  if (process.env.VITE_E2E_NWC_MOCK === 'true') {
    envFlags.push('VITE_E2E_NWC_MOCK=true')
  }
  if (process.env.VITE_E2E_ARKADE_MOCK === 'true') {
    envFlags.push('VITE_E2E_ARKADE_MOCK=true')
  }
  if (process.env.VITE_E2E_ARKADE_REGTEST === 'true') {
    envFlags.push('VITE_E2E_ARKADE_REGTEST=true')
    envFlags.push('VITE_ARKADE_OPERATOR_REGTEST=http://localhost:7070')
  }
  return `${envFlags.join(' ')} node scripts/e2e-dev-server.mjs`
}

const devServerCommand = buildE2eDevServerCommand()
const usesE2eEnvSpecificDevServer =
  process.env.VITE_E2E_NWC_MOCK === 'true' ||
  process.env.VITE_E2E_ARKADE_MOCK === 'true' ||
  process.env.VITE_E2E_ARKADE_REGTEST === 'true'

/** Vite middleware mocks must not reuse a plain dev server. Regtest can reuse :3100 if already up. */
const requiresFreshE2eDevServer =
  process.env.VITE_E2E_NWC_MOCK === 'true' ||
  process.env.VITE_E2E_ARKADE_MOCK === 'true'

const isCi = !!process.env.CI

/** Cold Vite + WASM first compile often exceeds 60s locally (arkade-regtest, mocks, lab). */
const e2eWebServerStartupTimeoutMs =
  usesE2eEnvSpecificDevServer || isCi ? 180_000 : 90_000

export default defineConfig({
  globalSetup: './playwright.global-setup.ts',
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
    baseURL: E2E_DEV_SERVER_ORIGIN,
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
    url: E2E_DEV_SERVER_ORIGIN,
    reuseExistingServer: !isCi && !requiresFreshE2eDevServer,
    timeout: e2eWebServerStartupTimeoutMs,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
