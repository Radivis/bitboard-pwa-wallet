import { test, expect } from '@playwright/test'
import {
  createWalletViaUI,
  expectWalletUnlockDialog,
  dismissWalletUnlockDialog,
  fillWalletUnlockDialog,
  unlockWalletViaUI,
  TEST_PASSWORD,
} from './helpers/wallet-setup'
import { goToWalletTab } from './helpers/wallet-nav'
import { clickDrawerNavLink } from './helpers/drawer-nav'
import {
  openSettingsMainTab,
  settingsNetworkButton,
  waitForSettingsNetworkSwitchComplete,
  waitForSettingsNetworkModeButtonSelected,
} from './helpers/settings-waits'

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

  test('unlock dialog stays dismissed after successful password unlock', async ({ page }) => {
    test.setTimeout(120_000)
    await createWalletViaUI(page)

    await goToWalletTab(page, 'Management')
    await page.getByRole('button', { name: 'Lock Wallet' }).click()

    await page.goto('/wallet')
    await expectWalletUnlockDialog(page)
    await fillWalletUnlockDialog(page, TEST_PASSWORD)

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('dialog', { name: 'Unlock Wallet' })).not.toBeVisible()

    await page.waitForTimeout(2_000)
    await expect(page.getByRole('dialog', { name: 'Unlock Wallet' })).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('locked wallet cannot access management without unlocking', async ({ page }) => {
    test.setTimeout(120_000)
    await createWalletViaUI(page)

    await goToWalletTab(page, 'Management')
    await page.getByRole('button', { name: 'Lock Wallet' }).click()

    await expect(page.getByRole('heading', { name: 'Management' })).not.toBeVisible({
      timeout: 15_000,
    })

    await goToWalletTab(page, 'Management')
    await expectWalletUnlockDialog(page)
  })

  test('settings network switch unlocks inline and does not re-prompt', async ({ page }) => {
    test.setTimeout(120_000)
    await createWalletViaUI(page)

    await goToWalletTab(page, 'Management')
    await page.getByRole('button', { name: 'Lock Wallet' }).click()
    await expect(page.getByRole('heading', { name: 'Management' })).not.toBeVisible({
      timeout: 15_000,
    })

    await clickDrawerNavLink(page, 'Settings')
    await openSettingsMainTab(page)

    await settingsNetworkButton(page, 'Signet').click()
    await expectWalletUnlockDialog(page)
    await fillWalletUnlockDialog(page, TEST_PASSWORD)

    await expect(page.getByRole('dialog', { name: 'Unlock Wallet' })).not.toBeVisible({
      timeout: 60_000,
    })
    await waitForSettingsNetworkSwitchComplete(page)
    await waitForSettingsNetworkModeButtonSelected(page, 'Signet')

    await page.waitForTimeout(2_000)
    await expect(page.getByRole('dialog', { name: 'Unlock Wallet' })).not.toBeVisible()
  })

  test('dismiss unlock modal returns to previous non-wallet route', async ({ page }) => {
    test.setTimeout(120_000)
    await createWalletViaUI(page)

    await goToWalletTab(page, 'Management')
    await page.getByRole('button', { name: 'Lock Wallet' }).click()
    await expect(page.getByRole('heading', { name: 'Management' })).not.toBeVisible({
      timeout: 15_000,
    })

    await clickDrawerNavLink(page, 'Settings')
    await openSettingsMainTab(page)

    await clickDrawerNavLink(page, 'Wallet')
    await expectWalletUnlockDialog(page)
    await dismissWalletUnlockDialog(page)

    await expect(page.getByRole('dialog', { name: 'Unlock Wallet' })).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({
      timeout: 15_000,
    })
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
