import { test, expect, type Page } from '@playwright/test'
import { createWalletViaUI } from './helpers/wallet-setup'

async function getDocumentNetwork(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.documentElement.dataset.network)
}

test.describe('Infomode on Settings', () => {
  test('toggle, network card vs Lab explainer, then normal Lab switch', async ({ page }) => {
    test.setTimeout(120_000)
    await createWalletViaUI(page)

    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    const networkCardDescription = page
      .locator('[data-infomode-id="settings-network-card"]')
      .getByText('Select the Bitcoin network to connect to.')
    const labButton = page.getByRole('button', { name: 'Lab' })
    const infomodeDialog = page.getByRole('dialog', { name: 'Infomode explanation' })

    await page.getByRole('button', { name: 'Turn on infomode' }).click()
    await expect(page.getByText('Infomode on')).toBeVisible()

    await networkCardDescription.click()
    await expect(infomodeDialog).toBeVisible()
    await expect(infomodeDialog.getByRole('heading', { name: 'Bitcoin networks' })).toBeVisible()

    const networkBefore = await getDocumentNetwork(page)
    expect(networkBefore).toBeDefined()

    await labButton.click()
    await expect(infomodeDialog).toBeVisible()
    await expect(infomodeDialog.getByRole('heading', { name: 'Lab' })).toBeVisible()
    await expect(infomodeDialog.getByRole('heading', { name: 'Bitcoin networks' })).toHaveCount(0)
    expect(await getDocumentNetwork(page)).toBe(networkBefore)

    await page.getByRole('button', { name: 'Turn off infomode' }).click()
    await expect(page.getByText('Infomode off')).toBeVisible()
    await expect(page.locator('[data-infomode-popup]')).toHaveCount(0)

    await networkCardDescription.click()
    await expect(page.locator('[data-infomode-popup]')).toHaveCount(0)

    await labButton.click()
    await expect
      .poll(async () => getDocumentNetwork(page), { timeout: 60_000 })
      .toBe('lab')
  })
})
