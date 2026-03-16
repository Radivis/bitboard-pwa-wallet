import { test, expect } from '@playwright/test'
import { createWalletViaUI, TEST_PASSWORD } from './helpers/wallet-setup'

test.describe('Wallet Lock/Unlock', () => {
  test('wallet lock and unlock', async ({ page }) => {
    await createWalletViaUI(page)

    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await page.getByRole('button', { name: 'Lock Wallet' }).click()

    await page.getByRole('link', { name: /dashboard/i }).click()
    await expect(page.getByText('Unlock Wallet')).toBeVisible({ timeout: 10000 })

    await page.getByLabel('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Unlock' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('Balance')).toBeVisible()
  })

  test('full critical path: create → lock → unlock → receive', async ({ page }) => {
    test.setTimeout(120_000)
    await createWalletViaUI(page)

    await page.getByRole('link', { name: /settings/i }).click()
    await page.getByRole('button', { name: 'Lock Wallet' }).click()

    await page.getByRole('link', { name: /dashboard/i }).click()
    await expect(page.getByText('Unlock Wallet')).toBeVisible({ timeout: 10000 })
    await page.getByLabel('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Unlock' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 30000 })

    await page.getByRole('link', { name: /receive/i }).click()
    await expect(page.getByRole('heading', { name: /receive/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Receiving Address')).toBeVisible()
  })
})
