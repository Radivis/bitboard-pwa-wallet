import { test, expect } from '@playwright/test'
import {
  createWalletViaUI,
  importWalletViaUI,
  TEST_MNEMONIC,
  TEST_PASSWORD,
} from './helpers/wallet-setup'
import { fundRegtestAddress, mineRegtestBlocks } from './helpers/regtest'

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

    // Workaround: Use SegWit (BIP84) instead of default Taproot (BIP86) for this test.
    // Taproot descriptor wallets fail with "base58 error" when building transactions
    // (likely a bug in BDK or a dependency). See .cursor/architecture/research/
    // taproot-base58-investigation.md for details.

    await importWalletViaUI(page, TEST_MNEMONIC, TEST_PASSWORD)

    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.getByRole('button', { name: 'Regtest' }).click()
    await expect(page.getByText(/Regtest Taproot sub-wallet loaded/)).toBeVisible({
      timeout: 60000,
    })

    await page.getByRole('button', { name: 'SegWit (BIP84)' }).click()
    await page.getByRole('button', { name: 'Change' }).click()
    await expect(page.getByText(/Regtest SegWit sub-wallet loaded/)).toBeVisible({
      timeout: 15000,
    })

    await page.getByRole('link', { name: /receive/i }).click()
    await expect(page.getByText('Receive Bitcoin')).toBeVisible()
    const addressEl = page.getByRole('main').locator('.font-mono').first()
    await expect(addressEl).toBeVisible({ timeout: 10000 })
    await expect(addressEl).toHaveText(/bcrt1/, { timeout: 15000 })
    const receiveAddress = (await addressEl.textContent())?.trim()
    if (!receiveAddress || !receiveAddress.startsWith('bcrt1')) {
      throw new Error(`Expected regtest address, got: ${receiveAddress}`)
    }

    await fundRegtestAddress(receiveAddress, 100_000)
    await mineRegtestBlocks(1)

    await page.getByRole('link', { name: /dashboard/i }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await page.getByRole('button', { name: /Sync/ }).click()
    await expect(page.getByText('Wallet synced')).toBeVisible({ timeout: 30000 })

    await page.getByRole('link', { name: /send/i }).click()
    await expect(page.getByText('Send Bitcoin')).toBeVisible()
    await page.getByLabel('Recipient Address').fill(receiveAddress)
    await page.getByRole('button', { name: 'Switch to sats' }).click()
    const amountInput = page.getByLabel(/Amount/)
    await amountInput.fill('1000')
    await expect(amountInput).toHaveValue('1000')
    await expect(
      page.getByRole('button', { name: 'Review Transaction' }),
    ).toBeEnabled({ timeout: 15000 })
    const reviewButton = page.getByRole('button', { name: 'Review Transaction' })
    await reviewButton.click()

    const result = await Promise.race([
      page
        .getByText('Transaction Details')
        .waitFor({ state: 'visible', timeout: 60000 })
        .then(() => 'success' as const),
      page
        .getByText(/Failed to build|Insufficient funds|base58 error/i)
        .waitFor({ state: 'visible', timeout: 60000 })
        .then(() => 'error' as const),
    ]).catch(() => 'timeout' as const)

    if (result === 'error') {
      const errorEl = page
        .getByText(/Failed to build|Insufficient funds|base58 error/i)
        .first()
      throw new Error(`Transaction build failed: ${await errorEl.textContent()}`)
    }
    if (result === 'timeout') {
      throw new Error(
        'Transaction build timed out. Build may be hanging - try running with --headed to inspect.',
      )
    }

    await page.getByRole('button', { name: 'Confirm and Send' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 30000,
    })
  })
})
