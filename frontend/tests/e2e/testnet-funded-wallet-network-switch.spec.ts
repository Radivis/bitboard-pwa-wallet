/**
 * Live Testnet Esplora E2E (optional, local only).
 *
 * Requires `.env.testnet` in `frontend/` or at repo root (gitignored) with:
 * - E2E_TESTNET_SEED — space-separated 12-word mnemonic for a **testnet-only** wallet
 * - E2E_TESTNET_APP_PASSWORD — Bitboard app password used on first-run setup
 *
 * Prerequisites:
 * - Fund that wallet with non-zero testnet coins (the flow asserts balance > 0 on testnet).
 * - Do not reuse mainnet seeds; never commit `.env.testnet`.
 *
 * Run: `npm run test:e2e:testnet-live` from `frontend/`.
 * CI must not define these variables (test self-skips).
 */
import { test, expect, type Page } from '@playwright/test'
import {
  dismissSetAppPasswordModalIfPresent,
  expectNoInitialWalletSyncErrorToast,
} from './helpers/wallet-setup'
import { satsFromFirstFormattedBitcoinDisplayInRoot } from './helpers/bitcoin-amount-display'
import {
  openSettingsFeaturesTab,
  openSettingsMainTab,
  waitForSettingsNetworkSwitchComplete,
  waitForSettingsNetworkSwitchCompleteIncludingMainnet,
  waitForSettingsNetworkModeButtonSelected,
} from './helpers/settings-waits'
import { waitForDashboardSyncButtonEnabled } from './helpers/dashboard-sync'
import { waitForFullScanLoadingToastGone } from './helpers/full-scan-toast'
import { goToWalletTab } from './helpers/wallet-nav'

const seed = process.env.E2E_TESTNET_SEED?.trim()
const appPassword = process.env.E2E_TESTNET_APP_PASSWORD

/** Full Esplora full scan can exceed default action timeouts; toast must clear before balance is trustworthy. */
const FULL_SCAN_TOAST_TIMEOUT_MS = 480_000

const EXPLORER_UNREACHABLE_MESSAGE =
  'Testnet full scan did not succeed. The dashboard still says the Bitcoin explorer could not be reached.'

/** One full-scan attempt is a 30s request. Do not start another with less time than that. */
const MIN_MS_TO_START_ANOTHER_SCAN = 45_000

/**
 * A timed-out `/blocks` dismisses the loading toast and leaves the
 * "Initial sync did not finish" banner up. Sonner then hides its own toast,
 * so waiting only for that toast treats a failed scan as a finished one.
 * Retry through the banner until the scan settles or the existing scan budget ends.
 * A still-visible "Scanning blockchain…" toast is polled until that deadline.
 * One long `not.toBeVisible` wait fails the attempt when only a few seconds remain.
 */
async function waitUntilScanningToastClears(page: Page, deadline: number): Promise<void> {
  const scanningToast = page.getByText(/Scanning blockchain/).first()
  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now()
    try {
      await expect(scanningToast).not.toBeVisible({
        timeout: Math.min(5_000, remainingMs),
      })
      return
    } catch (error) {
      if (Date.now() >= deadline) {
        throw new Error(EXPLORER_UNREACHABLE_MESSAGE, { cause: error })
      }
    }
  }
  throw new Error(EXPLORER_UNREACHABLE_MESSAGE)
}

async function waitForInitialOnchainScanReadyForBalance(page: Page): Promise<void> {
  const deadline = Date.now() + FULL_SCAN_TOAST_TIMEOUT_MS
  for (;;) {
    if (Date.now() >= deadline) {
      throw new Error(EXPLORER_UNREACHABLE_MESSAGE)
    }
    await waitUntilScanningToastClears(page, deadline)
    const remainingMs = deadline - Date.now()
    await waitForDashboardSyncButtonEnabled(page, remainingMs)
    const initialSyncBanner = page.getByText('Initial sync did not finish')
    if (await initialSyncBanner.isVisible()) {
      if (deadline - Date.now() < MIN_MS_TO_START_ANOTHER_SCAN) {
        throw new Error(EXPLORER_UNREACHABLE_MESSAGE)
      }
      // The toast has its own Retry action. The banner button is the one in main.
      await page.getByRole('main').getByRole('button', { name: 'Retry', exact: true }).click()
      await expect(initialSyncBanner).toBeHidden({ timeout: 15_000 })
      await page
        .getByText(/Scanning blockchain/)
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => {})
      continue
    }
    const railSyncFailed = page.getByText('On-chain sync failed')
    if (await railSyncFailed.isVisible()) {
      if (deadline - Date.now() < MIN_MS_TO_START_ANOTHER_SCAN) {
        throw new Error(EXPLORER_UNREACHABLE_MESSAGE)
      }
      await page.getByRole('main').getByRole('button', { name: 'Sync again' }).click()
      await page
        .getByText(/Scanning blockchain/)
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => {})
      continue
    }
    await expectNoInitialWalletSyncErrorToast(page)
    return
  }
}

async function readDashboardOnchainSats(page: Page): Promise<number> {
  const loc = page.getByTestId('dashboard-onchain-balance-amount')
  await expect(loc).toBeVisible({ timeout: 30_000 })
  const parsed = await satsFromFirstFormattedBitcoinDisplayInRoot(loc)
  expect(
    parsed,
    'Could not parse on-chain balance from dashboard (BitcoinAmountDisplay)',
  ).not.toBeNull()
  return parsed!
}

test.describe('Funded testnet wallet (live Esplora)', () => {
  test.skip(
    !seed || !appPassword,
    'Set E2E_TESTNET_SEED and E2E_TESTNET_APP_PASSWORD in frontend/.env.testnet. See test file header.',
  )

  test('import, testnet balance, mainnet zero, restore testnet balance', async ({
    page,
  }) => {
    test.setTimeout(600_000)

    await page.goto('/setup')
    await page.getByRole('button', { name: 'Import Wallet' }).click()

    await dismissSetAppPasswordModalIfPresent(page, appPassword!)

    await expect(page.getByRole('heading', { name: 'Import Wallet' })).toBeVisible()
    await page.getByLabel('Seed Phrase').fill(seed!)
    await expect(page.getByText('Valid mnemonic')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Restore Wallet' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 180_000,
    })
    await waitForInitialOnchainScanReadyForBalance(page)

    const expectedTestnetSats = await readDashboardOnchainSats(page)
    expect(
      expectedTestnetSats,
      'Fund the E2E testnet wallet with test coins so on-chain balance is non-zero.',
    ).toBeGreaterThan(0)

    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await openSettingsFeaturesTab(page)
    await page.getByRole('switch', { name: 'Enable Mainnet access' }).click()
    await expect(
      page.getByRole('heading', { name: 'Mainnet access', level: 2 }),
    ).toBeVisible({ timeout: 10_000 })
    await page.locator('#mainnet-access-ack').click()
    await page.getByRole('button', { name: 'Activate access' }).click()

    await openSettingsMainTab(page)
    await waitForSettingsNetworkSwitchCompleteIncludingMainnet(page)

    await page.getByRole('button', { name: 'Mainnet', exact: true }).click()
    await waitForSettingsNetworkSwitchComplete(page)
    await waitForSettingsNetworkModeButtonSelected(page, 'Mainnet')

    // On Settings, the Wallet sub-nav (Dashboard) is hidden — use primary "Wallet" first.
    await goToWalletTab(page, 'Dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 60_000,
    })
    await waitForFullScanLoadingToastGone(page, FULL_SCAN_TOAST_TIMEOUT_MS)
    await waitForDashboardSyncButtonEnabled(page, 300_000)

    const mainnetSats = await readDashboardOnchainSats(page)
    expect(mainnetSats).toBe(0)

    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.getByRole('button', { name: 'Testnet', exact: true }).click()
    await waitForSettingsNetworkSwitchComplete(page)
    await waitForSettingsNetworkModeButtonSelected(page, 'Testnet')

    await goToWalletTab(page, 'Dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 60_000,
    })
    await waitForFullScanLoadingToastGone(page, FULL_SCAN_TOAST_TIMEOUT_MS)
    await waitForDashboardSyncButtonEnabled(page, 300_000)

    const restoredTestnetSats = await readDashboardOnchainSats(page)
    expect(restoredTestnetSats).toBe(expectedTestnetSats)
  })
})
