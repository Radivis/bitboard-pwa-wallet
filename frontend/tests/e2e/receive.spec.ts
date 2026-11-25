import { test, expect } from '@playwright/test'
import {
  SOFT_GAP_CONFIRM_TITLE,
  SOFT_GAP_GENERATE_LABEL,
} from '@/lib/wallet/receive-gap-surface'
import { createWalletViaUI } from './helpers/wallet-setup'
import { goToWalletTab } from './helpers/wallet-nav'
import { enableSegwitAddressesFeature } from './helpers/segwit-addresses-feature'

test.describe('Receive Page', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000)
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
      .locator('.design-type-addresses:not(input):not(textarea):not(select)')
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
    // Re-read immediately before clicking: the display can update after copy (e.g. async
    // wallet work) and oldToMatch would otherwise stay out of sync with what "new" means.
    const addressBeforeNew = (await addressDisplay.textContent())?.trim() ?? ''
    await newAddressButton.click()
    // After a sync, an unpaid address asks for confirmation before the next reveal.
    // Before that sync the same click reveals immediately.
    const gapConfirm = page
      .getByRole('dialog', { name: SOFT_GAP_CONFIRM_TITLE })
      .getByRole('button', { name: SOFT_GAP_GENERATE_LABEL, exact: true })
    let confirmedGapPrompt = false
    await expect.poll(async () => {
      if (!confirmedGapPrompt && (await gapConfirm.isVisible())) {
        confirmedGapPrompt = true
        await gapConfirm.click()
      }
      return (await addressDisplay.textContent())?.trim() ?? ''
    }, { timeout: 25_000 }).not.toBe(addressBeforeNew)
  })
})
