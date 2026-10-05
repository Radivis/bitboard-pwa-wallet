/**
 * Bark board against local captaind.
 *
 * Run: `npm run test:e2e:bark-regtest` from `frontend/`.
 *
 * Contract: E2E-BARK-REG-02 — see doc/features/bark-regtest-contract.yaml
 */
import { test, expect } from '@playwright/test'
import { generateMnemonic } from '@scure/bip39'
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js'
import { enableRegtestDeveloperMode, switchToRegtestNetwork } from './helpers/arkade-management'
import { enableBarkFeature } from './helpers/bark-settings'
import {
  BARK_REGTEST_BOARD_CONFIRMATIONS,
  readDashboardBarkSpendableSats,
  readDashboardOnchainSats,
  resolveBarkBoardedFixtureExportPath,
  restartCaptaind,
  triggerBarkRailSync,
  waitForBarkLoadReady,
  writeBoardedBarkFixture,
} from './helpers/bark-regtest'
import { runDashboardSyncUntilIdle } from './helpers/dashboard-sync'
import { runRegtestPostFundDashboardCheck } from './helpers/regtest-onchain-balance-diagnostics'
import { fundRegtestWalletReceiveAddress, mineRegtestBlocks } from './helpers/regtest'
import { goToWalletTab } from './helpers/wallet-nav'
import { importWalletViaUI, TEST_PASSWORD } from './helpers/wallet-setup'

const BARK_REGTEST_TIMEOUT_MS = 600_000
const BOARD_AMOUNT_SATS = 100_000
const ONCHAIN_FUND_SATS = 500_000

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
    const mnemonic = generateMnemonic(englishWordlist, 128)
    await importWalletViaUI(page, mnemonic, TEST_PASSWORD)
    await enableRegtestDeveloperMode(page)
    await enableBarkFeature(page)
    await switchToRegtestNetwork(page)
    await goToWalletTab(page, 'Dashboard')
    await waitForBarkLoadReady(page)

    await goToWalletTab(page, 'Receive')
    const addressEl = page
      .locator('[data-infomode-id="receive-receiving-address-card"]')
      .locator('.font-mono')
    await expect(addressEl).toHaveText(/bcrt1/, { timeout: 45_000 })
    const receiveAddress = (await addressEl.textContent())?.trim()
    if (receiveAddress == null || !receiveAddress.startsWith('bcrt1')) {
      throw new Error(`Expected regtest address, got: ${receiveAddress}`)
    }
    await fundRegtestWalletReceiveAddress(receiveAddress, ONCHAIN_FUND_SATS)

    await goToWalletTab(page, 'Dashboard')
    await runRegtestPostFundDashboardCheck(page, {
      receiveAddress,
      minConfirmedSats: ONCHAIN_FUND_SATS,
    })
    const onchainBefore = await readDashboardOnchainSats(page)

    await page.getByTestId('dashboard-bark-board-link').click()
    await expect(page.getByTestId('bark-board-amount')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('bark-board-amount').fill(String(BOARD_AMOUNT_SATS))
    await page.getByTestId('bark-board-review').click()
    await expect(page.getByTestId('bark-board-onchain-fee')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('bark-board-offchain-fee')).toBeVisible()
    const netVtxoText = await page.getByTestId('bark-board-net-vtxo').textContent()
    const netVtxoSats = Number((netVtxoText ?? '').replace(/\D/g, ''))
    expect(netVtxoSats).toBeGreaterThan(0)
    expect(netVtxoSats).toBeLessThanOrEqual(BOARD_AMOUNT_SATS)

    await page.getByTestId('bark-board-confirm').click()
    await expect(page.getByText(/Board accepted/)).toBeVisible({ timeout: 120_000 })

    const fixturePath = resolveBarkBoardedFixtureExportPath()
    if (fixturePath != null) {
      await writeBoardedBarkFixture(page, fixturePath)
      const written = await import('node:fs/promises').then((fs) => fs.readFile(fixturePath, 'utf8'))
      const parsed = JSON.parse(written) as { mnemonic?: string; recordDump?: string }
      expect(parsed.mnemonic?.trim().length).toBeGreaterThan(0)
      expect(parsed.recordDump?.trim().length).toBeGreaterThan(0)
    }

    await goToWalletTab(page, 'Dashboard')
    await runDashboardSyncUntilIdle(page)
    await mineRegtestBlocks(BARK_REGTEST_BOARD_CONFIRMATIONS)
    await runDashboardSyncUntilIdle(page)
    for (let extraBlocks = 0; extraBlocks < 6; extraBlocks += 1) {
      await triggerBarkRailSync(page)
      const spendableSats = await readDashboardBarkSpendableSats(page).catch(() => 0)
      if (spendableSats >= netVtxoSats) break
      await mineRegtestBlocks(1)
      await runDashboardSyncUntilIdle(page)
    }
    await expect
      .poll(async () => readDashboardBarkSpendableSats(page), {
        timeout: 60_000,
        intervals: [1000, 2000, 5000],
      })
      .toBeGreaterThanOrEqual(netVtxoSats)

    const onchainAfter = await readDashboardOnchainSats(page)
    expect(onchainBefore - onchainAfter).toBeGreaterThanOrEqual(BOARD_AMOUNT_SATS)
  })
})
