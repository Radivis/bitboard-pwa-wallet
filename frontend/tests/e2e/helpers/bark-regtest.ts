import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { promisify } from 'node:util'
import { type Page, expect } from '@playwright/test'
import { satsFromFirstFormattedBitcoinDisplayInRoot } from './bitcoin-amount-display'
import { goToWalletTab } from './wallet-nav'

const execFileAsync = promisify(execFile)

const CAPTAIND_REGTEST_CONTAINER =
  process.env.CAPTAIND_REGTEST_CONTAINER ?? 'bitboard-regtest-captaind'

/** Blocks a board tx needs before captaind counts it spendable. */
export const BARK_REGTEST_BOARD_CONFIRMATIONS = 3

export const BARK_REGTEST_BOARDED_FIXTURE_DEFAULT = 'test-results/bark-boarded-fixture.json'

export function resolveBarkBoardedFixtureExportPath(): string | null {
  const raw = process.env.BARK_REGTEST_EXPORT_BOARDED_FIXTURE
  if (raw == null || raw === '' || raw === '0' || raw === 'false') return null
  if (raw === '1' || raw === 'true') return BARK_REGTEST_BOARDED_FIXTURE_DEFAULT
  return raw
}

export async function restartCaptaind(): Promise<void> {
  await execFileAsync('docker', ['restart', CAPTAIND_REGTEST_CONTAINER], {
    maxBuffer: 10 * 1024 * 1024,
  })
  const { waitForBarkRegtestHealthy } = await import(
    '../../../../scripts/bark-regtest-health.mjs'
  )
  await waitForBarkRegtestHealthy()
}

export async function waitForBarkLoadReady(page: Page, timeout = 120_000): Promise<void> {
  const card = page.getByTestId('dashboard-bark-balance-card')
  await expect(card).toBeVisible({ timeout })
  await expect
    .poll(
      async () => {
        const loadPhase = await card.getAttribute('data-rail-bark-load')
        if (loadPhase === 'loaded') return 'loaded'
        if (loadPhase === 'load-error') {
          const banner = page.getByTestId('bark-session-load-error-message')
          const message = ((await banner.textContent()) ?? 'unknown').trim()
          throw new Error(`Bark session failed to open: ${message}`)
        }
        return loadPhase
      },
      { timeout, intervals: [250, 500, 1000, 2000] },
    )
    .toBe('loaded')
}

export async function triggerBarkRailSync(page: Page, timeout = 120_000): Promise<void> {
  await goToWalletTab(page, 'Dashboard')
  await waitForBarkLoadReady(page, timeout)
  const syncButton = page.getByTestId('rail-sync-bark')
  await expect(syncButton).toBeEnabled({ timeout })
  await syncButton.click()
  await expect(async () => {
    const syncPhase = await page
      .getByTestId('dashboard-bark-balance-card')
      .getAttribute('data-rail-bark-sync')
    if (syncPhase !== 'not-syncing') {
      throw new Error(`Bark sync still in progress: ${syncPhase ?? 'unknown'}`)
    }
  }).toPass({ timeout })
}

export async function readDashboardOnchainSats(page: Page): Promise<number> {
  const amount = page.getByTestId('dashboard-onchain-balance-amount')
  await expect(amount).toBeVisible()
  return satsFromFirstFormattedBitcoinDisplayInRoot(amount)
}

/** Spendable line when some sats are locked; otherwise the card total is the spendable amount. */
export async function readDashboardBarkSpendableSats(page: Page): Promise<number> {
  const spendable = page.getByTestId('dashboard-bark-balance-spendable')
  if ((await spendable.count()) > 0 && (await spendable.isVisible())) {
    return satsFromFirstFormattedBitcoinDisplayInRoot(spendable)
  }
  return satsFromFirstFormattedBitcoinDisplayInRoot(
    page.getByTestId('dashboard-bark-balance-amount'),
  )
}

export async function exportBoardedBarkFixture(page: Page): Promise<{
  mnemonic: string
  recordDump: string
}> {
  await page.waitForFunction(
    () => typeof window.__e2eExportBoardedBarkFixture === 'function',
    undefined,
    { timeout: 15_000 },
  )
  return page.evaluate(async () => {
    const exportFn = window.__e2eExportBoardedBarkFixture
    if (exportFn == null) {
      throw new Error(
        '__e2eExportBoardedBarkFixture not available (DEV + VITE_E2E_BARK_REGTEST required)',
      )
    }
    return exportFn()
  })
}

export async function writeBoardedBarkFixture(
  page: Page,
  fixturePath: string,
): Promise<void> {
  const fixture = await exportBoardedBarkFixture(page)
  if (fixture.mnemonic.trim() === '' || fixture.recordDump.trim() === '') {
    throw new Error('Bark boarded fixture is missing a mnemonic or record dump')
  }
  await fs.mkdir(path.dirname(fixturePath), { recursive: true })
  await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2), 'utf8')
}
