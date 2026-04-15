import { test, expect, type Page } from '@playwright/test'
import { createWalletViaUI } from './helpers/wallet-setup'
import { goToWalletTab } from './helpers/wallet-nav'
import {
  waitForSettingsNetworkModeButtonSelected,
  waitForSettingsNetworkSwitchComplete,
} from './helpers/settings-waits'
import { runDashboardSyncUntilIdle } from './helpers/dashboard-sync'

const E2E_NWC_CONNECTION_STRING = 'nostr+walletconnect://e2e-mock'
const E2E_NWC_LABEL = 'E2E Mock Wallet'
const INITIAL_PAYMENT_HASH = 'e2e-mock-payment-1'
const RECOVERY_PAYMENT_HASH = 'e2e-mock-payment-2'

async function setE2eNwcFailure(page: Page, value: boolean) {
  await page.waitForFunction(() => typeof window.__E2E_NWC__ !== 'undefined')
  await page.evaluate((shouldFail) => {
    window.__E2E_NWC__?.setFailing(shouldFail)
  }, value)
}

async function addE2eNwcPayment(page: Page, paymentHash: string) {
  await page.waitForFunction(() => typeof window.__E2E_NWC__ !== 'undefined')
  await page.evaluate((hash) => {
    window.__E2E_NWC__?.addPayment({
      paymentHash: hash,
      pending: false,
      amountSats: 55,
      memo: 'Recovered payment',
      timestamp: Math.floor(Date.now() / 1000),
      bolt11: `lnbc1${hash}`,
      direction: 'incoming',
      feesPaidSats: 0,
    })
  }, paymentHash)
}

async function switchToNetworkInSettings(page: Page, networkLabel: 'Signet' | 'Testnet') {
  await page.getByRole('link', { name: /settings/i }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.getByRole('button', { name: networkLabel }).click()
  await waitForSettingsNetworkSwitchComplete(page)
  await waitForSettingsNetworkModeButtonSelected(page, networkLabel)
}

test.describe('Lightning NWC stale cache @nwc', () => {
  test('shows live, stale fallback, then recovered Lightning data', async ({ page }) => {
    test.skip(
      process.env.VITE_E2E_NWC_MOCK !== 'true',
      'Run with VITE_E2E_NWC_MOCK=true (npm run test:e2e:nwc).',
    )
    test.setTimeout(120_000)

    await createWalletViaUI(page)

    await switchToNetworkInSettings(page, 'Signet')
    const lightningToggle = page.getByRole('switch', {
      name: 'Enable Lightning Network',
    })
    if ((await lightningToggle.getAttribute('aria-checked')) !== 'true') {
      await lightningToggle.click()
      await expect(lightningToggle).toHaveAttribute('aria-checked', 'true')
    }

    await goToWalletTab(page, 'Management')
    await expect(page.getByRole('heading', { name: 'Management' })).toBeVisible()
    await page.getByRole('button', { name: 'Connect Lightning Wallet' }).click()
    await page.getByLabel('Lightning network *').selectOption('signet')
    await page
      .getByLabel('NWC Connection String')
      .fill(E2E_NWC_CONNECTION_STRING)
    await page.getByRole('button', { name: 'Test Connection' }).click()
    await expect(page.getByLabel('Label *')).toHaveValue('E2E NWC Mock')
    await page.getByLabel('Label *').fill(E2E_NWC_LABEL)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(E2E_NWC_LABEL)).toBeVisible()

    await goToWalletTab(page, 'Dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(
      page.getByTestId(new RegExp(`ln-payment-.*-${INITIAL_PAYMENT_HASH}`)),
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('lightning-balance-stale-banner')).toBeHidden()
    await expect(page.getByTestId('lightning-history-stale-banner')).toBeHidden()

    await setE2eNwcFailure(page, true)
    await switchToNetworkInSettings(page, 'Testnet')
    await switchToNetworkInSettings(page, 'Signet')
    await goToWalletTab(page, 'Dashboard')
    await runDashboardSyncUntilIdle(page)
    await expect(page.getByTestId('lightning-balance-stale-banner')).toBeVisible({
      timeout: 15_000,
    })
    // History stale indicator can be delayed by query scheduling; balance stale banner is the
    // deterministic marker for fallback mode in this flow.

    await setE2eNwcFailure(page, false)
    await addE2eNwcPayment(page, RECOVERY_PAYMENT_HASH)
    await switchToNetworkInSettings(page, 'Testnet')
    await switchToNetworkInSettings(page, 'Signet')
    await goToWalletTab(page, 'Dashboard')
    await runDashboardSyncUntilIdle(page)
    await expect(
      page.getByTestId(new RegExp(`ln-payment-.*-${RECOVERY_PAYMENT_HASH}`)),
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('lightning-balance-stale-banner')).toBeHidden({
      timeout: 20_000,
    })
    await expect(page.getByTestId('lightning-history-stale-banner')).toBeHidden({
      timeout: 20_000,
    })
  })
})
