import { test, expect } from '@playwright/test'

test.describe('Settings Page', () => {
  test('settings network switch', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await expect(page.getByRole('button', { name: 'Signet' })).toBeVisible()
    await page.getByRole('button', { name: 'Testnet' }).click()
  })

  test('settings address type switch', async ({ page }) => {
    await page.goto('/settings')

    await expect(
      page.getByRole('button', { name: 'Taproot (BIP86)' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'SegWit (BIP84)' }),
    ).toBeVisible()
  })

  test('settings Esplora endpoint', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText('Esplora Endpoint')).toBeVisible()

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

    await expect(page.getByText('Esplora endpoint saved')).toBeVisible({
      timeout: 10000,
    })
  })
})
