import { type Browser, type Page, expect } from '@playwright/test'
import { generateMnemonic } from '@scure/bip39'
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js'
import { enableRegtestDeveloperMode, switchToRegtestNetwork } from './arkade-management'
import { enableBarkFeature } from './bark-settings'
import {
  BARK_REGTEST_BOARD_CONFIRMATIONS,
  readDashboardBarkSpendableSats,
  readDashboardOnchainSats,
  readOptionalDashboardSats,
  triggerBarkRailSync,
  waitForBarkLoadReady,
  writeBoardedBarkFixture,
} from './bark-regtest'
import { runDashboardSyncUntilIdle } from './dashboard-sync'
import { runRegtestPostFundDashboardCheck } from './regtest-onchain-balance-diagnostics'
import { fundRegtestWalletReceiveAddress, mineRegtestBlocks } from './regtest'
import { E2E_DEV_SERVER_ORIGIN } from '../e2e-dev-server'
import { goToWalletTab } from './wallet-nav'
import { importWalletViaUI, TEST_PASSWORD } from './wallet-setup'

export const BARK_REGTEST_BOARD_AMOUNT_SATS = 100_000
export const BARK_REGTEST_ONCHAIN_FUND_SATS = 500_000
export const BARK_REGTEST_PAYMENT_SATS = 20_000

const ARKADE_BALANCE_TEST_ID = 'dashboard-arkade-balance-amount'

export interface BoardedBarkWallet {
  mnemonic: string
  netVtxoSats: number
  onchainBefore: number
  onchainAfter: number
}

async function readOnchainReceiveAddress(page: Page): Promise<string> {
  await goToWalletTab(page, 'Receive')
  const addressEl = page
    .locator('[data-infomode-id="receive-receiving-address-card"]')
    .locator('.font-mono')
  await expect(addressEl).toHaveText(/bcrt1/, { timeout: 45_000 })
  const receiveAddress = (await addressEl.textContent())?.trim()
  if (receiveAddress == null || !receiveAddress.startsWith('bcrt1')) {
    throw new Error(`Expected regtest address, got: ${receiveAddress}`)
  }
  return receiveAddress
}

async function confirmBoard(page: Page, amountSats: number): Promise<number> {
  await goToWalletTab(page, 'Dashboard')
  await page.getByTestId('dashboard-bark-board-link').click()
  await expect(page.getByTestId('bark-board-amount')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('bark-board-amount').fill(String(amountSats))
  await page.getByTestId('bark-board-review').click()
  await expect(page.getByTestId('bark-board-onchain-fee')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('bark-board-offchain-fee')).toBeVisible()
  const netVtxoText = await page.getByTestId('bark-board-net-vtxo').textContent()
  const netVtxoSats = Number((netVtxoText ?? '').replace(/\D/g, ''))
  expect(netVtxoSats).toBeGreaterThan(0)
  expect(netVtxoSats).toBeLessThanOrEqual(amountSats)
  await page.getByTestId('bark-board-confirm').click()
  await expect(page.getByText(/Board accepted/)).toBeVisible({ timeout: 120_000 })
  return netVtxoSats
}

async function waitUntilBarkSpendableAtLeast(page: Page, minimumSats: number): Promise<void> {
  await goToWalletTab(page, 'Dashboard')
  await runDashboardSyncUntilIdle(page)
  await mineRegtestBlocks(BARK_REGTEST_BOARD_CONFIRMATIONS)
  await runDashboardSyncUntilIdle(page)
  for (let extraBlocks = 0; extraBlocks < 6; extraBlocks += 1) {
    await triggerBarkRailSync(page)
    const spendableSats = await readDashboardBarkSpendableSats(page).catch(() => 0)
    if (spendableSats >= minimumSats) break
    await mineRegtestBlocks(1)
    await runDashboardSyncUntilIdle(page)
  }
  await expect
    .poll(async () => readDashboardBarkSpendableSats(page), {
      timeout: 60_000,
      intervals: [1000, 2000, 5000],
    })
    .toBeGreaterThanOrEqual(minimumSats)
}

/**
 * Fresh wallet, Bark on, regtest, one board above the server minimum.
 * When `exportFixturePath` is set, boards a second VTXO and writes the dump
 * after both are spendable so Rust tests can spend one and exit the other.
 */
export async function boardRegtestBarkWallet(
  page: Page,
  options?: { exportFixturePath?: string | null },
): Promise<BoardedBarkWallet> {
  const mnemonic = generateMnemonic(englishWordlist, 128)
  await importWalletViaUI(page, mnemonic, TEST_PASSWORD)
  await enableRegtestDeveloperMode(page)
  await enableBarkFeature(page)
  await switchToRegtestNetwork(page)
  await goToWalletTab(page, 'Dashboard')
  await waitForBarkLoadReady(page)

  const receiveAddress = await readOnchainReceiveAddress(page)
  await fundRegtestWalletReceiveAddress(receiveAddress, BARK_REGTEST_ONCHAIN_FUND_SATS)
  await goToWalletTab(page, 'Dashboard')
  await runRegtestPostFundDashboardCheck(page, {
    receiveAddress,
    minConfirmedSats: BARK_REGTEST_ONCHAIN_FUND_SATS,
  })
  const onchainBefore = await readDashboardOnchainSats(page)
  const netVtxoSats = await confirmBoard(page, BARK_REGTEST_BOARD_AMOUNT_SATS)
  await waitUntilBarkSpendableAtLeast(page, netVtxoSats)
  const onchainAfter = await readDashboardOnchainSats(page)

  const exportFixturePath = options?.exportFixturePath
  if (exportFixturePath != null && exportFixturePath !== '') {
    const secondNetVtxoSats = await confirmBoard(page, BARK_REGTEST_BOARD_AMOUNT_SATS)
    await waitUntilBarkSpendableAtLeast(page, netVtxoSats + secondNetVtxoSats)
    await writeBoardedBarkFixture(page, exportFixturePath)
  }

  return { mnemonic, netVtxoSats, onchainBefore, onchainAfter }
}

export async function openSecondBarkRegtestPage(browser: Browser): Promise<{
  page: Page
  close: () => Promise<void>
}> {
  const context = await browser.newContext({ baseURL: E2E_DEV_SERVER_ORIGIN })
  const page = await context.newPage()
  return {
    page,
    close: async () => {
      await context.close()
    },
  }
}

async function prepareRecipientBarkWallet(page: Page): Promise<void> {
  const mnemonic = generateMnemonic(englishWordlist, 128)
  await importWalletViaUI(page, mnemonic, TEST_PASSWORD)
  await enableRegtestDeveloperMode(page)
  await enableBarkFeature(page)
  await switchToRegtestNetwork(page)
  await goToWalletTab(page, 'Dashboard')
  await waitForBarkLoadReady(page)
}

export async function peekBarkReceiveAddress(page: Page): Promise<string> {
  await goToWalletTab(page, 'Receive')
  await page.getByRole('button', { name: 'Bark', exact: true }).click()
  const address = page.getByTestId('bark-receive-address')
  await expect(address).toHaveText(/tark1p/i, { timeout: 60_000 })
  const text = (await address.textContent())?.trim() ?? ''
  if (!/^tark1p/i.test(text)) {
    throw new Error(`Expected a Bark receive address, got: ${text}`)
  }
  return text
}

export async function sendBarkPayment(
  page: Page,
  destination: string,
  amountSats: number,
): Promise<void> {
  await goToWalletTab(page, 'Send')
  await page.locator('#recipient-address').fill(destination)
  await expect(page.getByRole('heading', { name: 'Send on Bark' })).toBeVisible()
  await page.getByLabel('Unit for amount entry').selectOption('sat')
  await page.locator('#send-amount').fill(String(amountSats))
  const sendButton = page.getByRole('button', { name: 'Send on Bark' })
  await expect(sendButton).toBeEnabled({ timeout: 30_000 })
  await sendButton.click()
  await expect(page.getByText('Bark payment sent')).toBeVisible({ timeout: 120_000 })
}

export interface BarkPaymentBalances {
  senderSpendableBefore: number
  senderSpendableAfter: number
  recipientSpendable: number
  recipientOnchainBefore: number
  recipientOnchainAfter: number
  recipientArkadeBefore: number | null
  recipientArkadeAfter: number | null
}

/** Sender is already boarded. Recipient is a second browser context. */
export async function payFreshBarkRecipient(
  senderPage: Page,
  recipientPage: Page,
  amountSats: number,
): Promise<BarkPaymentBalances> {
  await prepareRecipientBarkWallet(recipientPage)
  const recipientOnchainBefore = await readDashboardOnchainSats(recipientPage)
  const recipientArkadeBefore = await readOptionalDashboardSats(
    recipientPage,
    ARKADE_BALANCE_TEST_ID,
  )
  const destination = await peekBarkReceiveAddress(recipientPage)

  await goToWalletTab(senderPage, 'Dashboard')
  const senderSpendableBefore = await readDashboardBarkSpendableSats(senderPage)
  await sendBarkPayment(senderPage, destination, amountSats)
  await triggerBarkRailSync(senderPage)
  const senderSpendableAfter = await readDashboardBarkSpendableSats(senderPage)

  await goToWalletTab(recipientPage, 'Dashboard')
  await triggerBarkRailSync(recipientPage)
  await expect
    .poll(async () => readDashboardBarkSpendableSats(recipientPage), {
      timeout: 60_000,
      intervals: [1000, 2000, 5000],
    })
    .toBeGreaterThanOrEqual(amountSats)
  const recipientSpendable = await readDashboardBarkSpendableSats(recipientPage)
  const recipientOnchainAfter = await readDashboardOnchainSats(recipientPage)
  const recipientArkadeAfter = await readOptionalDashboardSats(
    recipientPage,
    ARKADE_BALANCE_TEST_ID,
  )

  return {
    senderSpendableBefore,
    senderSpendableAfter,
    recipientSpendable,
    recipientOnchainBefore,
    recipientOnchainAfter,
    recipientArkadeBefore,
    recipientArkadeAfter,
  }
}
