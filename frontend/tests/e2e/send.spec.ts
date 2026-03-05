import { test, expect } from '@playwright/test'
import { createWalletViaUI } from './helpers/wallet-setup'

test.describe('Send Page', () => {
  test.beforeEach(async ({ page }) => {
    await createWalletViaUI(page)
  })

  test('send page validates inputs', async ({ page }) => {
    await page.getByRole('link', { name: /send/i }).click()
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
})
