import { test, expect } from '@playwright/test'
import {
  createWalletViaUI,
  importWalletViaUI,
  TEST_MNEMONIC,
  TEST_PASSWORD,
} from './helpers/wallet-setup'
import { fundRegtestAddress, mineRegtestBlocks } from './helpers/regtest'

const REGTEST_RECIPIENT =
  'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'

test.describe('Send Page', () => {
  test.beforeEach(async ({ page }) => {
    await createWalletViaUI(page)
  })

  test('send page validates inputs', async ({ page }) => {
    await page.getByRole('link', { name: /send/i }).click()
    await expect(page.getByText('Send Bitcoin')).toBeVisible()

    await expect(
      page.getByRole('button', { name: 'Review Transaction' }),
    ).toBeDisabled()

    await page.getByLabel('Recipient Address').fill('invalid_address')
    await expect(page.getByText(/Invalid address/)).toBeVisible()

    await page.getByLabel('Recipient Address').clear()
    await page
      .getByLabel('Recipient Address')
      .fill('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')

    await expect(page.getByText('Switch to sats')).toBeVisible()
    await page.getByRole('button', { name: 'Switch to sats' }).click()
    await expect(page.getByText('Switch to BTC')).toBeVisible()

    await page.getByRole('button', { name: 'Switch to BTC' }).click()

    await page.getByLabel(/Amount/).fill('0.001')

    await expect(page.getByRole('button', { name: /Low/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Medium/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /High/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Custom' })).toBeVisible()

    await page.getByRole('button', { name: 'Custom' }).click()
    await expect(page.getByPlaceholder('Custom fee rate')).toBeVisible()
  })

  test('sends bitcoin on regtest @regtest', async ({ page }) => {
    test.setTimeout(120_000)

    await importWalletViaUI(page, TEST_MNEMONIC, TEST_PASSWORD)

    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.getByRole('button', { name: 'Regtest' }).click()

    await page.getByRole('link', { name: /receive/i }).click()
    await expect(page.getByText('Receive Bitcoin')).toBeVisible()
    const addressEl = page.getByRole('main').locator('.font-mono').first()
    await expect(addressEl).toBeVisible({ timeout: 10000 })
    const receiveAddress = (await addressEl.textContent())?.trim()
    if (!receiveAddress || !receiveAddress.startsWith('bcrt1')) {
      throw new Error(`Expected regtest address, got: ${receiveAddress}`)
    }

    await fundRegtestAddress(receiveAddress, 100_000)
    await mineRegtestBlocks(1)

    await page.getByRole('link', { name: /dashboard/i }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await page.getByRole('button', { name: /Sync/ }).click()
    await page.waitForTimeout(5000)

    await page.getByRole('link', { name: /send/i }).click()
    await expect(page.getByText('Send Bitcoin')).toBeVisible()
    await page.getByLabel('Recipient Address').fill(REGTEST_RECIPIENT)
    await page.getByRole('button', { name: 'Switch to sats' }).click()
    await page.getByLabel(/Amount/).fill('5000')
    await expect(
      page.getByRole('button', { name: 'Review Transaction' }),
    ).toBeEnabled({ timeout: 5000 })
    await page.getByRole('button', { name: 'Review Transaction' }).click()

    await expect(page.getByText('Transaction Details')).toBeVisible({
      timeout: 15000,
    })
    await page.getByRole('button', { name: 'Broadcast Transaction' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 30000,
    })
  })
})
