import { test, expect } from '@playwright/test'
import { createWalletViaUI } from './helpers/wallet-setup'
import { goToWalletTab } from './helpers/wallet-nav'

test.describe('Receive Page', () => {
  test.beforeEach(async ({ page }) => {
    await createWalletViaUI(page)
  })

  test('receive page shows address and QR', async ({ page }) => {
    await goToWalletTab(page, 'Receive')
    await expect(page.getByText('Receive Bitcoin')).toBeVisible()

    const qrCode = page.getByRole('main').getByRole('img')
    await expect(qrCode).toBeVisible({ timeout: 10000 })

    const addressDisplay = page.getByRole('main').locator('.font-mono')
    await expect(addressDisplay.first()).toBeVisible({ timeout: 10000 })
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
    const oldAddress = addressText
    await newAddressButton.click()

    await page.waitForTimeout(2000)
    const newAddressText = await addressDisplay.textContent()
    expect(newAddressText).toBeTruthy()
    if (oldAddress && newAddressText) {
      expect(newAddressText).not.toBe(oldAddress)
    }
  })
})
