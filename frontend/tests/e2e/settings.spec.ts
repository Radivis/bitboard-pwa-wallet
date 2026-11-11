import { test, expect } from '@playwright/test'
import { clickDrawerNavLink } from './helpers/drawer-nav'
import { createWalletViaUI } from './helpers/wallet-setup'
import {
  openSettingsFeaturesTab,
  openSettingsMainTab,
  settingsNetworkButton,
  waitForSettingsNetworkSwitchComplete,
  waitForSettingsNetworkModeButtonSelected,
} from './helpers/settings-waits'

test.describe('Settings Page', () => {
  test('settings network switch', async ({ page }) => {
    test.setTimeout(120_000)
    await createWalletViaUI(page)

    await clickDrawerNavLink(page, 'Settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    const testnetButton = settingsNetworkButton(page, 'Testnet')
    const signetButton = settingsNetworkButton(page, 'Signet')
    await expect(testnetButton).toBeVisible()
    await expect(signetButton).toBeVisible()

    await signetButton.click()
    await waitForSettingsNetworkSwitchComplete(page)

    await testnetButton.click()
    await waitForSettingsNetworkSwitchComplete(page)
  })

  test('settings address type switch', async ({ page }) => {
    await createWalletViaUI(page)

    await clickDrawerNavLink(page, 'Settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await openSettingsFeaturesTab(page)
    const segwitFeatureSwitch = page.getByRole('switch', {
      name: 'Enable SegWit address options and labels',
    })
    await segwitFeatureSwitch.scrollIntoViewIfNeeded()
    await segwitFeatureSwitch.click()
    await openSettingsMainTab(page)
    await expect(
      page.getByRole('button', { name: 'Taproot (BIP86)' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'SegWit (BIP84)' }),
    ).toBeVisible()
  })

  test('settings Esplora endpoint', async ({ page }) => {
    test.setTimeout(120_000)
    await createWalletViaUI(page)

    await clickDrawerNavLink(page, 'Settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByText(/Esplora Endpoint/)).toBeVisible()

    // Switch to Regtest first: HTTP URLs are only valid for regtest (HTTPS required for others)
    await openSettingsFeaturesTab(page)
    const regtestModeSwitch = page.getByRole('switch', {
      name: 'Enable Regtest mode for developers',
    })
    await regtestModeSwitch.scrollIntoViewIfNeeded()
    await regtestModeSwitch.click()
    await openSettingsMainTab(page)

    await settingsNetworkButton(page, 'Regtest').click()
    await waitForSettingsNetworkSwitchComplete(page)
    await waitForSettingsNetworkModeButtonSelected(page, 'Regtest')

    const urlInput = page.getByLabel('Endpoint URL')
    await expect(urlInput).toBeVisible()

    await expect(
      page.getByRole('button', { name: 'Save Endpoint' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Reset to default' }),
    ).toBeVisible()

    await urlInput.fill('http://custom-esplora:3002')
    await expect(urlInput).toHaveValue('http://custom-esplora:3002')

    await page.getByRole('button', { name: 'Save Endpoint' }).click()

    // Persisted custom URL (TanStack Query refetch) enables reset; more reliable than toast or badge timing.
    await expect(page.getByRole('button', { name: 'Reset to default' })).toBeEnabled({
      timeout: 20000,
    })
    await expect(urlInput).toHaveValue('http://custom-esplora:3002', { timeout: 5000 })
  })

  test('shows toast when Mainnet is tapped without Mainnet access enabled', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await createWalletViaUI(page)

    await clickDrawerNavLink(page, 'Settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await waitForSettingsNetworkSwitchComplete(page)
    // Mainnet is aria-disabled until Features access is on. A DOM click still runs the handler.
    await settingsNetworkButton(page, 'Mainnet').evaluate((mainnetButton) => {
      mainnetButton.click()
    })
    await expect(
      page.getByText('Activate Mainnet access in Settings → Features before selecting Mainnet.'),
    ).toBeVisible({ timeout: 10000 })
  })
})
