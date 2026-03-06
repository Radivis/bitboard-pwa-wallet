import { test, expect } from '@playwright/test'
import { createWalletViaUI } from './helpers/wallet-setup'

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
    await expect(page.getByText(/Signet Taproot sub-wallet loaded/)).toBeVisible({
      timeout: 60000,
    })

    await testnetButton.click()
    await expect(page.getByText(/Testnet Taproot sub-wallet loaded/)).toBeVisible({
      timeout: 60000,
    })
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
    await expect(page.getByText(/Regtest Taproot sub-wallet loaded/)).toBeVisible({
      timeout: 60000,
    })

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

    await expect(page.getByText(/Esplora endpoint saved/)).toBeVisible({
      timeout: 10000,
    })
  })
})
