import { test, expect } from '@playwright/test'
import { createWalletViaUI } from './helpers/wallet-setup'
import { goToWalletTab } from './helpers/wallet-nav'
import { enableSegwitAddressesFeature } from './helpers/segwit-addresses-feature'

test.describe('Receive Page', () => {
  test.beforeEach(async ({ page }) => {
    await createWalletViaUI(page)
  })

  test('receive page shows address and QR', async ({ page }) => {
    await goToWalletTab(page, 'Receive')
    await expect(page.getByText('Receive Bitcoin')).toBeVisible()

    await enableSegwitAddressesFeature(page)
    await goToWalletTab(page, 'Receive')
    await expect(page.getByText('Receive Bitcoin')).toBeVisible()

    const qrCode = page.getByRole('main').getByRole('img')
    await expect(qrCode).toBeVisible({ timeout: 10000 })

    const addressDisplay = page
      .locator('[data-infomode-id="receive-receiving-address-card"]')
      .locator('.font-mono')
    await expect(addressDisplay).toBeVisible({ timeout: 10000 })
    const addressText = await addressDisplay.textContent()
    expect(addressText).toBeTruthy()
    expect(addressText!.length).toBeGreaterThan(10)

    await expect(
      page.getByText(/Taproot|SegWit/),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Copy address' }).click()

    const newAddressButton = page.getByRole('button', {
      name: 'Generate New Address',
    })
    await expect(newAddressButton).toBeVisible()
    const oldTrimmed = addressText!.trim()
    await newAddressButton.click()
    // getNewAddress is async; poll until the UI shows a different address (fixed
    // sleeps are flaky under load).
    await expect(addressDisplay).not.toHaveText(oldTrimmed, { timeout: 20000 })
  })
})
