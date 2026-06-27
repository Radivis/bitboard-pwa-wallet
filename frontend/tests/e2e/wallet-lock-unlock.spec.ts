import { test, expect } from '@playwright/test'
import {
  createWalletViaUI,
  expectWalletUnlockDialog,
  unlockWalletViaUI,
} from './helpers/wallet-setup'
import { goToWalletTab } from './helpers/wallet-nav'

test.describe('Wallet Lock/Unlock', () => {
  test('wallet lock and unlock', async ({ page }) => {
    await createWalletViaUI(page)

    await goToWalletTab(page, 'Management')
    await expect(page.getByRole('heading', { name: 'Management' })).toBeVisible()

    await page.getByRole('button', { name: 'Lock Wallet' }).click()

    await page.goto('/wallet')
    await unlockWalletViaUI(page)

    await expect(page.getByText('Balance')).toBeVisible()
  })

  test('full critical path: create → lock → unlock → receive', async ({ page }) => {
    test.setTimeout(120_000)
    await createWalletViaUI(page)

    await goToWalletTab(page, 'Management')
    await page.getByRole('button', { name: 'Lock Wallet' }).click()

    await page.goto('/wallet')
    await unlockWalletViaUI(page)

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
    await page.goto('/wallet')
    await expectWalletUnlockDialog(page)

    await page.reload()
    await page.goto('/wallet')
    await expectWalletUnlockDialog(page)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).not.toBeVisible()
  })
})
