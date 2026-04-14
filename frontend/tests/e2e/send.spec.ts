import { test, expect } from '@playwright/test'
import {
  createWalletViaUI,
  importWalletViaUI,
  TEST_MNEMONIC,
  TEST_PASSWORD,
} from './helpers/wallet-setup'
import { fundRegtestAddress, mineRegtestBlocks, waitForConfirmedBalance } from './helpers/regtest'
import { goToWalletTab } from './helpers/wallet-nav'
import {
  waitForSettingsAddressTypeSwitchComplete,
  waitForSettingsNetworkModeButtonSelected,
  waitForSettingsNetworkSwitchComplete,
} from './helpers/settings-waits'
import { ensureSegwitAddressesFeatureOn } from './helpers/segwit-addresses-feature'

test.describe('Send Page', () => {
  test.beforeEach(async ({ page }) => {
    await createWalletViaUI(page)
  })

  test('send page validates inputs', async ({ page }) => {
    await goToWalletTab(page, 'Send')
    await expect(page.getByText('Send Bitcoin')).toBeVisible()

    await expect(
      page.getByRole('button', { name: 'Review Transaction' }),
    ).toBeDisabled()

    await page.getByLabel('Recipient Address').fill('invalid_address')
    await expect(page.getByText(/Invalid address/)).toBeVisible()

    await page.getByLabel('Recipient Address').clear()
    await page
      .getByLabel('Recipient Address')
      .fill('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')

    await expect(page.getByText('Switch to sats')).toBeVisible()
    await page.getByRole('button', { name: 'Switch to sats' }).click()
    await expect(page.getByText('Switch to BTC')).toBeVisible()

    await page.getByRole('button', { name: 'Switch to BTC' }).click()

    await page.getByLabel(/Amount/).fill('0.001')

    await expect(page.getByRole('button', { name: /Low/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Medium/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /High/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Custom' })).toBeVisible()

    await page.getByRole('button', { name: 'Custom' }).click()
    await expect(page.getByPlaceholder('Custom fee rate')).toBeVisible()
  })

  test('sends bitcoin on regtest @regtest', async ({ page }) => {
    test.setTimeout(60_000)

    await importWalletViaUI(page, TEST_MNEMONIC, TEST_PASSWORD)

    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    const regtestModeSwitch = page.getByRole('switch', {
      name: 'Enable Regtest mode for developers',
    })
    await regtestModeSwitch.scrollIntoViewIfNeeded()
    await regtestModeSwitch.click()

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

    // Wait for the Sync button to be ready (not "Syncing..." from a
    // settings-switch sync that may still be running).
    const syncButton = page.getByRole('button', { name: 'Sync' })
    await expect(syncButton).toBeVisible({ timeout: 30000 })

    await syncButton.click()

    // Wait for the sync to START (button changes to "Syncing...") and then
    // FINISH (button changes back to "Sync"). This is the only reliable way
    // to know the current sync completed — success toasts from the settings
    // switch were removed in favor of inline status; button state is reliable.
    await expect(page.getByRole('button', { name: 'Syncing...' })).toBeVisible({
      timeout: 5000,
    })
    await expect(syncButton).toBeVisible({ timeout: 60000 })

    await goToWalletTab(page, 'Send')
    await expect(page.getByText('Send Bitcoin')).toBeVisible()
    await page.getByLabel('Recipient Address').fill(receiveAddress)
    await page.getByRole('button', { name: 'Switch to sats' }).click()
    const amountInput = page.getByLabel(/Amount/)
    await amountInput.fill('1000')
    await expect(amountInput).toHaveValue('1000')
    await expect(
      page.getByRole('button', { name: 'Review Transaction' }),
    ).toBeEnabled({ timeout: 30000 })
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

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 30000,
    })
  })
})
