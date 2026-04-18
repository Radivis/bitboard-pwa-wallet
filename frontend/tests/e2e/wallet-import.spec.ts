import { test, expect } from '@playwright/test'
import {
  TEST_MNEMONIC,
  TEST_PASSWORD,
  dismissSetAppPasswordModalIfPresent,
  expectNoInitialWalletSyncErrorToast,
} from './helpers/wallet-setup'

test.describe('Wallet Import Flow', () => {
  test('wallet import full flow', async ({ page }) => {
    test.setTimeout(90_000) // Argon2 key derivation + wallet load can take 20–30s on CI
    await page.goto('/setup')
    await page.getByRole('button', { name: 'Import Wallet' }).click()

    await dismissSetAppPasswordModalIfPresent(page, TEST_PASSWORD)

    await expect(page.getByRole('heading', { name: 'Import Wallet' })).toBeVisible()
    await expect(page.getByText('Enter Seed Phrase')).toBeVisible()

    await page.getByLabel('Seed Phrase').fill(TEST_MNEMONIC)

    await expect(page.getByText('Valid mnemonic')).toBeVisible({ timeout: 10000 })

    await expect(page.getByRole('button', { name: 'Restore Wallet' })).toBeEnabled()
    await page.getByRole('button', { name: 'Restore Wallet' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 60000 })
    await expect(page.getByText('Balance')).toBeVisible()
    await expectNoInitialWalletSyncErrorToast(page)
  })
})
