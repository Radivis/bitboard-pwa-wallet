import { test, expect } from '@playwright/test'
import { createWalletViaUI } from './helpers/wallet-setup'
import { waitForSettingsNetworkSwitchComplete } from './helpers/settings-waits'

test.describe('Settings Page', () => {
  test('settings network switch', async ({ page }) => {
    test.setTimeout(120_000)
    await createWalletViaUI(page)

    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    const testnetButton = page.getByRole('button', { name: 'Testnet' })
    const signetButton = page.getByRole('button', { name: 'Signet' })
    await expect(testnetButton).toBeVisible()
    await expect(signetButton).toBeVisible()

    await signetButton.click()
    await waitForSettingsNetworkSwitchComplete(page)

    await testnetButton.click()
    await waitForSettingsNetworkSwitchComplete(page)
  })

  test('settings address type switch', async ({ page }) => {
    await createWalletViaUI(page)

    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await expect(
      page.getByRole('button', { name: 'Taproot (BIP86)' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'SegWit (BIP84)' }),
    ).toBeVisible()
  })

  test('settings Esplora endpoint', async ({ page }) => {
    await createWalletViaUI(page)

    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByText(/Esplora Endpoint/)).toBeVisible()

    // Switch to Regtest first: HTTP URLs are only valid for regtest (HTTPS required for others)
    await page.getByRole('button', { name: 'Regtest' }).click()
    await waitForSettingsNetworkSwitchComplete(page)

    const urlInput = page.getByLabel('Endpoint URL')
    await expect(urlInput).toBeVisible()

    await expect(
      page.getByRole('button', { name: 'Save Endpoint' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Reset to Default' }),
    ).toBeVisible()

    await urlInput.fill('http://custom-esplora:3002')
    await expect(urlInput).toHaveValue('http://custom-esplora:3002')

    await page.getByRole('button', { name: 'Save Endpoint' }).click()

    // Persisted custom URL (TanStack Query refetch) enables reset; more reliable than toast or badge timing.
    await expect(page.getByRole('button', { name: 'Reset to Default' })).toBeEnabled({
      timeout: 20000,
    })
    await expect(urlInput).toHaveValue('http://custom-esplora:3002', { timeout: 5000 })
  })
})
