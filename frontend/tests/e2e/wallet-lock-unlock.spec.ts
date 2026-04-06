import { test, expect } from '@playwright/test'
import { createWalletViaUI, TEST_PASSWORD } from './helpers/wallet-setup'
import { goToWalletTab } from './helpers/wallet-nav'

test.describe('Wallet Lock/Unlock', () => {
  test('wallet lock and unlock', async ({ page }) => {
    await createWalletViaUI(page)

    await goToWalletTab(page, 'Management')
    await expect(page.getByRole('heading', { name: 'Management' })).toBeVisible()

    await page.getByRole('button', { name: 'Lock Wallet' }).click()

    await goToWalletTab(page, 'Dashboard')
    await expect(page.getByText('Unlock Wallet')).toBeVisible({ timeout: 10000 })

    await page.getByLabel('Bitboard app password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Unlock' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 60000 })
    await expect(page.getByText('Balance')).toBeVisible()
  })

  test('full critical path: create → lock → unlock → receive', async ({ page }) => {
    test.setTimeout(120_000)
    await createWalletViaUI(page)

    await goToWalletTab(page, 'Management')
    await page.getByRole('button', { name: 'Lock Wallet' }).click()

    await goToWalletTab(page, 'Dashboard')
    await expect(page.getByText('Unlock Wallet')).toBeVisible({ timeout: 10000 })
    await page.getByLabel('Bitboard app password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Unlock' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 60000 })

    await goToWalletTab(page, 'Receive')
    await expect(page.getByRole('heading', { name: /receive/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Receiving Address')).toBeVisible()
  })

  test('reload when locked shows Unlock screen (no sensitive state leak)', async ({
    page,
  }) => {
    await createWalletViaUI(page)
    await goToWalletTab(page, 'Management')
    await page.getByRole('button', { name: 'Lock Wallet' }).click()
    await goToWalletTab(page, 'Dashboard')
    await expect(page.getByText('Unlock Wallet')).toBeVisible({ timeout: 10000 })

    await page.reload()
    await expect(page.getByText('Unlock Wallet')).toBeVisible({ timeout: 10000 })
    await expect(page.getByLabel('Bitboard app password')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).not.toBeVisible()
  })
})
