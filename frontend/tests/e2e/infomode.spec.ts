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
    const networkCard = page.locator('[data-infomode-id="settings-network-card"]')
    const testnetInNetworkCard = networkCard.getByRole('button', { name: 'Testnet' })
    const labButton = page.getByRole('button', { name: 'Lab', exact: true })
    const infomodeDialog = page.getByRole('dialog', { name: 'Infomode explanation' })

    await page.getByRole('button', { name: 'Turn on infomode' }).click()
    await expect(page.getByText('Infomode on')).toBeVisible()

    const suppressionRe = /Action has been suppressed due to active infomode/

    await networkCardDescription.click()
    await expect(page.getByText(suppressionRe)).toHaveCount(0)
    await expect(infomodeDialog).toBeVisible()
    await expect(infomodeDialog.getByRole('heading', { name: 'Bitcoin networks' })).toBeVisible()

    await page.getByRole('button', { name: 'Close explanation' }).click()
    await expect(page.locator('[data-infomode-popup]')).toHaveCount(0)

    await testnetInNetworkCard.click()
    await expect(page.getByText(suppressionRe)).toBeVisible()
    await expect(infomodeDialog).toBeVisible()
    await expect(infomodeDialog.getByRole('heading', { name: 'Testnet' })).toBeVisible()

    await page.getByRole('button', { name: 'Close explanation' }).click()
    await expect(page.locator('[data-infomode-popup]')).toHaveCount(0)

    const committedDescriptorBlock = page.locator(
      '[data-infomode-id="settings-network-committed-descriptor"]',
    )
    // Visible label is exactly "Receiving descriptor"; sr-only help begins with "Receiving descriptor hidden…"
    await committedDescriptorBlock
      .getByText('Receiving descriptor', { exact: true })
      .click()
    // Static label only (no control): no *new* suppression from this tap; a toast may still
    // be visible from the network-mode button above until Sonner’s duration elapses.
    await expect(infomodeDialog).toBeVisible()
    await expect(infomodeDialog.getByRole('heading', { name: 'Output descriptors' })).toBeVisible()

    await page.getByRole('button', { name: 'Close explanation' }).click()
    await expect(page.locator('[data-infomode-popup]')).toHaveCount(0)

    const networkBefore = await getDocumentNetwork(page)
    expect(networkBefore).toBeDefined()

    await labButton.click()
    await expect(page.getByText(suppressionRe)).toBeVisible()
    await expect(infomodeDialog).toBeVisible()
    await expect(
      infomodeDialog.getByRole('heading', { name: 'Lab', exact: true }),
    ).toBeVisible()
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
