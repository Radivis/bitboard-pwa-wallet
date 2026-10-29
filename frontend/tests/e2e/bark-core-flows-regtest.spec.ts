/**
 * Bark receive, board, and Arkoor against local captaind.
 *
 * Run: `npm run test:e2e:bark-regtest` from `frontend/`.
 *
 * Contracts: E2E-BARK-REG-01, E2E-BARK-REG-02, E2E-BARK-REG-03
 * in doc/features/bark-regtest-contract.yaml
 */
import { test, expect } from '@playwright/test'
import { BARK_EMERGENCY_EXIT_BLOCKS_ACTION } from '@/lib/bark/emergency-exit-blocks-action'
import {
  BARK_REGTEST_BOARD_AMOUNT_SATS,
  BARK_REGTEST_PAYMENT_SATS,
  boardRegtestBarkWallet,
  openSecondBarkRegtestPage,
  payFreshBarkRecipient,
  peekBarkReceiveAddress,
  prepareRecipientBarkWallet,
} from './helpers/bark-regtest-scenarios'
import {
  cancelEmergencyExits,
  startEmergencyExitOfWholeWallet,
} from './helpers/bark-emergency-exit'
import { resolveBarkBoardedFixtureExportPath, restartCaptaind } from './helpers/bark-regtest'
import { goToWalletTab } from './helpers/wallet-nav'

const BARK_REGTEST_TIMEOUT_MS = 600_000

test.describe('Bark core flows regtest @bark-regtest', () => {
  test.describe.configure({ mode: 'serial', timeout: BARK_REGTEST_TIMEOUT_MS })

  test.beforeEach(async () => {
    test.skip(
      process.env.VITE_E2E_BARK_REGTEST !== 'true',
      'Run with VITE_E2E_BARK_REGTEST=true (npm run test:e2e:bark-regtest).',
    )
    await restartCaptaind()
  })

  test('E2E-BARK-REG-02 board from the on-chain wallet', async ({ page }) => {
    const boarded = await boardRegtestBarkWallet(page, {
      exportFixturePath: resolveBarkBoardedFixtureExportPath(),
    })
    expect(boarded.onchainBefore - boarded.onchainAfter).toBeGreaterThanOrEqual(
      BARK_REGTEST_BOARD_AMOUNT_SATS,
    )
  })

  test('E2E-BARK-REG-01 peek a Bark address and pay it', async ({ page, browser }) => {
    await boardRegtestBarkWallet(page)
    const recipient = await openSecondBarkRegtestPage(browser)
    try {
      const paid = await payFreshBarkRecipient(page, recipient.page, BARK_REGTEST_PAYMENT_SATS)
      expect(paid.recipientSpendable).toBeGreaterThanOrEqual(BARK_REGTEST_PAYMENT_SATS)
      expect(paid.recipientOnchainAfter).toBe(paid.recipientOnchainBefore)
      expect(paid.recipientArkadeAfter).toBe(paid.recipientArkadeBefore)
    } finally {
      await recipient.close()
    }
  })

  test('E2E-BARK-REG-03 Arkoor send drops the sender and credits the recipient', async ({
    page,
    browser,
  }) => {
    await boardRegtestBarkWallet(page)
    const recipient = await openSecondBarkRegtestPage(browser)
    try {
      await startEmergencyExitOfWholeWallet(page)
      await prepareRecipientBarkWallet(recipient.page)
      const destination = await peekBarkReceiveAddress(recipient.page)
      await goToWalletTab(page, 'Send')
      await page.locator('#recipient-address').fill(destination)
      await expect(page.getByRole('heading', { name: 'Send on Bark' })).toBeVisible()
      await page.getByLabel('Unit for amount entry').selectOption('sat')
      await page.locator('#send-amount').fill(String(BARK_REGTEST_PAYMENT_SATS))
      const sendButton = page.getByRole('button', { name: 'Send on Bark' })
      await expect(sendButton).toBeEnabled({ timeout: 30_000 })
      await sendButton.click()
      await expect(page.getByText(BARK_EMERGENCY_EXIT_BLOCKS_ACTION)).toBeVisible({
        timeout: 30_000,
      })
      await cancelEmergencyExits(page)
      const paid = await payFreshBarkRecipient(page, recipient.page, BARK_REGTEST_PAYMENT_SATS)
      expect(paid.senderSpendableBefore - paid.senderSpendableAfter).toBeGreaterThanOrEqual(
        BARK_REGTEST_PAYMENT_SATS,
      )
      expect(paid.recipientSpendable).toBeGreaterThanOrEqual(BARK_REGTEST_PAYMENT_SATS)
    } finally {
      await recipient.close()
    }
  })
})
