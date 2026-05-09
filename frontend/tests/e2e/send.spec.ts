import { test, expect } from '@playwright/test'
import {
  createWalletViaUI,
  importWalletViaUI,
  TEST_MNEMONIC,
  TEST_PASSWORD,
} from './helpers/wallet-setup'
import {
  E2E_IS_CI,
  fundRegtestAddress,
  mineRegtestBlocks,
  waitForConfirmedBalance,
  waitForDashboardShowsFundedOnChainBalance,
} from './helpers/regtest'
import { runDashboardSyncUntilIdle } from './helpers/dashboard-sync'
import { goToWalletTab } from './helpers/wallet-nav'
import {
  waitForSettingsAddressTypeSwitchComplete,
  waitForSettingsNetworkModeButtonSelected,
  waitForSettingsNetworkSwitchComplete,
  openSettingsFeaturesTab,
  openSettingsMainTab,
} from './helpers/settings-waits'
import { ensureSegwitAddressesFeatureOn } from './helpers/segwit-addresses-feature'

/** After funding, dashboard balance poll + one full sync should give the store enough headroom for `canBuild`. */
const REVIEW_BUTTON_ENABLE_TIMEOUT_MS = 20_000

/** Redirect follows broadcast + persistence; post-broadcast sync runs in the background (see useBroadcastTransactionMutation). */
const POST_BROADCAST_URL_TIMEOUT_MS = 20_000

test.describe('Send Page', () => {
  test.beforeEach(async ({ page }) => {
    await createWalletViaUI(page)
  })

  test('send page validates inputs', async ({ page }) => {
    await goToWalletTab(page, 'Send')
    await expect(page.getByText('Send Bitcoin')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Scan QR code' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Scan QR code' }).click()
    await expect(
      page.getByRole('button', { name: 'Upload image' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(
      page.getByRole('button', { name: 'Review Transaction' }),
    ).toBeDisabled()

    await page.getByLabel('Recipient Address').fill('invalid_address')
    await expect(page.getByText(/Invalid address/)).toBeVisible()

    await page.getByLabel('Recipient Address').clear()
    await page
      .getByLabel('Recipient Address')
      .fill('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')

    const unitSelect = page.getByLabel('Unit for amount entry')
    await expect(unitSelect).toBeVisible()
    await unitSelect.selectOption('sat')
    await expect(page.getByPlaceholder('0')).toBeVisible()
    await unitSelect.selectOption('BTC')
    await expect(page.getByPlaceholder('0.00000000')).toBeVisible()

    await page.getByLabel(/Amount/).fill('0.001')

    await expect(page.getByRole('button', { name: /Low/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Medium/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /High/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Custom' })).toBeVisible()

    await page.getByRole('button', { name: 'Custom' }).click()
    await expect(page.getByPlaceholder('sat/vB')).toBeVisible()
  })

  test('sends bitcoin on regtest @regtest', async ({ page }) => {
    test.setTimeout(E2E_IS_CI ? 300_000 : 60_000)

    await importWalletViaUI(page, TEST_MNEMONIC, TEST_PASSWORD)

    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await openSettingsFeaturesTab(page)
    const regtestModeSwitch = page.getByRole('switch', {
      name: 'Enable Regtest mode for developers',
    })
    await regtestModeSwitch.scrollIntoViewIfNeeded()
    await regtestModeSwitch.click()
    await openSettingsMainTab(page)

    await page.getByRole('button', { name: 'Regtest' }).click()
    await waitForSettingsNetworkSwitchComplete(page)
    await waitForSettingsNetworkModeButtonSelected(page, 'Regtest')

    await ensureSegwitAddressesFeatureOn(page)

    await page.getByRole('button', { name: 'SegWit (BIP84)' }).click()
    await page.getByRole('button', { name: 'Change' }).click()
    await waitForSettingsAddressTypeSwitchComplete(page)

    await goToWalletTab(page, 'Receive')
    await expect(page.getByText('Receive Bitcoin')).toBeVisible()
    const addressEl = page
      .locator('[data-infomode-id="receive-receiving-address-card"]')
      .locator('.font-mono')
    await expect(addressEl).toBeVisible({ timeout: 10000 })
    await expect(addressEl).toHaveText(/bcrt1/, { timeout: 45000 })
    const receiveAddress = (await addressEl.textContent())?.trim()
    if (!receiveAddress || !receiveAddress.startsWith('bcrt1')) {
      throw new Error(`Expected regtest address, got: ${receiveAddress}`)
    }

    await fundRegtestAddress(receiveAddress, 100_000)
    await mineRegtestBlocks(1)
    await waitForConfirmedBalance(receiveAddress, 100_000)

    await goToWalletTab(page, 'Dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // One full manual sync, then wait until the balance card reflects funds (polls; no fixed sleep).
    await runDashboardSyncUntilIdle(page)
    await waitForDashboardShowsFundedOnChainBalance(page)

    await goToWalletTab(page, 'Send')
    await expect(page.getByText('Send Bitcoin')).toBeVisible()
    await page.getByLabel('Recipient Address').fill(receiveAddress)
    await page.getByLabel('Unit for amount entry').selectOption('sat')
    const amountInput = page.getByLabel(/Amount/)
    await amountInput.fill('1000')
    await expect(amountInput).toHaveValue('1000')
    await expect(
      page.getByRole('button', { name: 'Review Transaction' }),
    ).toBeEnabled({ timeout: REVIEW_BUTTON_ENABLE_TIMEOUT_MS })
    const reviewButton = page.getByRole('button', { name: 'Review Transaction' })
    await reviewButton.click()

    const result = await Promise.race([
      page
        .getByText('Transaction Details')
        .waitFor({ state: 'visible', timeout: 60000 })
        .then(() => 'success' as const),
      page
        .getByText(/Failed to build|Insufficient funds|base58 error/i)
        .waitFor({ state: 'visible', timeout: 60000 })
        .then(() => 'error' as const),
    ]).catch(() => 'timeout' as const)

    if (result === 'error') {
      const errorEl = page
        .getByText(/Failed to build|Insufficient funds|base58 error/i)
        .first()
      throw new Error(`Transaction build failed: ${await errorEl.textContent()}`)
    }
    if (result === 'timeout') {
      throw new Error(
        'Transaction build timed out. Build may be hanging - try running with --headed to inspect.',
      )
    }

    await page.getByRole('button', { name: 'Confirm and Send' }).click()

    await Promise.race([
      page.waitForURL(/.*\/wallet\/?$/, { timeout: POST_BROADCAST_URL_TIMEOUT_MS }),
      page
        .getByText(/Broadcast failed/i)
        .first()
        .waitFor({ state: 'visible', timeout: POST_BROADCAST_URL_TIMEOUT_MS })
        .then(async () => {
          const t = await page.getByText(/Broadcast failed/i).first().textContent()
          throw new Error(t ?? 'Broadcast failed')
        }),
    ])
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15_000,
    })
  })
})
