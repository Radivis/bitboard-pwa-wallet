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

const seed = process.env.E2E_TESTNET_SEED?.trim()
const appPassword = process.env.E2E_TESTNET_APP_PASSWORD

/** Full Esplora full scan can exceed default action timeouts; toast must clear before balance is trustworthy. */
const FULL_SCAN_TOAST_TIMEOUT_MS = 480_000

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
    await waitForFullScanLoadingToastGone(page, FULL_SCAN_TOAST_TIMEOUT_MS)
    await waitForDashboardSyncButtonEnabled(page, 300_000)
    await expectNoInitialWalletSyncErrorToast(page)

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

    await page.getByRole('link', { name: /dashboard/i }).click()
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

    await page.getByRole('link', { name: /dashboard/i }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 60_000,
    })
    await waitForFullScanLoadingToastGone(page, FULL_SCAN_TOAST_TIMEOUT_MS)
    await waitForDashboardSyncButtonEnabled(page, 300_000)

    const restoredTestnetSats = await readDashboardOnchainSats(page)
    expect(restoredTestnetSats).toBe(expectedTestnetSats)
  })
})
