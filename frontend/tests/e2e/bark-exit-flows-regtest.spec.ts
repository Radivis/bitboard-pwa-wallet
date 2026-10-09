/**
 * Collaborative and emergency Bark exit against a short exit delay.
 *
 * Run: `npm run test:e2e:bark-exit-regtest` from `frontend/`.
 * That clean-start loads docker/captaind/captaind.exit.toml (`vtxo_exit_delta = 6`).
 *
 * Contracts: E2E-BARK-REG-04 and E2E-BARK-REG-05.
 */
import { type Page, test, expect } from '@playwright/test'
import { boardRegtestBarkWallet } from './helpers/bark-regtest-scenarios'
import {
  readDashboardBarkSpendableSats,
  readDashboardOnchainSats,
  restartCaptaind,
  triggerBarkRailSync,
} from './helpers/bark-regtest'
import { runDashboardSyncUntilIdle } from './helpers/dashboard-sync'
import { fundRegtestWalletReceiveAddress, mineRegtestBlocks } from './helpers/regtest'
import { goToWalletTab } from './helpers/wallet-nav'

const BARK_REGTEST_TIMEOUT_MS = 600_000
const EXIT_DELTA_BLOCKS = 6
const PARTIAL_EXIT_SATS = 20_000

test.describe('Bark exit flows regtest @bark-exit-regtest', () => {
  test.describe.configure({ mode: 'serial', timeout: BARK_REGTEST_TIMEOUT_MS })

  test.beforeEach(async () => {
    test.skip(
      process.env.VITE_E2E_BARK_REGTEST !== 'true',
      'Run with VITE_E2E_BARK_REGTEST=true (npm run test:e2e:bark-exit-regtest).',
    )
    await restartCaptaind()
  })

  test('E2E-BARK-REG-04 collaborative exit of part and then the rest', async ({ page }) => {
    await boardRegtestBarkWallet(page)
    const spendableBeforePartialExit = await readDashboardBarkSpendableSats(page)
    await exitBarkAmount(page, PARTIAL_EXIT_SATS)
    await syncUntilBarkSpendableDrops(page, spendableBeforePartialExit)
    await exitBarkRemainder(page)
  })

  test('E2E-BARK-REG-05 emergency exit progresses to a claim', async ({ page }) => {
    await boardRegtestBarkWallet(page)
    // The child spends confirmed on-chain coins. The boarded VTXO's 330 sat
    // anchor is not enough, and the board change is not what coin selection saw.
    await fundConfirmedCoinsForExitChild(page)
    await goToWalletTab(page, 'Management')
    await page.getByTestId('bark-emergency-exit-link').click()
    await expect(page.getByRole('heading', { name: 'Bark emergency exit' })).toBeVisible({
      timeout: 30_000,
    })

    const vtxo = page.locator('[data-testid^="bark-emergency-exit-vtxo-"]').first()
    await expect(vtxo).toBeVisible({ timeout: 60_000 })
    await vtxo.click()
    await page.getByTestId('bark-emergency-exit-review').click()
    await page.getByTestId('bark-emergency-exit-start').click()
    await expect(page.getByText('Emergency exit started.')).toBeVisible({ timeout: 120_000 })

    const row = page.locator('[data-testid^="bark-emergency-exit-row-"]').first()
    for (let step = 0; step < 12; step += 1) {
      await expect(row).toBeVisible({ timeout: 30_000 })
      const text = (await row.textContent()) ?? ''
      if (text.includes('Claimable')) break
      if (text.includes('Waiting for timelock')) {
        await mineRegtestBlocks(EXIT_DELTA_BLOCKS)
      } else {
        await mineRegtestBlocks(1)
      }
      await progressEmergencyExitOnce(page)
    }
    await expect(row).toContainText('Claimable')

    await goToWalletTab(page, 'Dashboard')
    const onchainBeforeClaim = await readDashboardOnchainSats(page)
    await goToWalletTab(page, 'Management')
    await page.getByTestId('bark-emergency-exit-link').click()
    const claim = page.getByTestId('bark-emergency-exit-claim')
    await expect(claim).toBeEnabled({ timeout: 30_000 })
    await claim.click()
    await expect(page.getByText(/Claim broadcast/)).toBeVisible({ timeout: 120_000 })

    await goToWalletTab(page, 'Dashboard')
    await mineUntilOnchainExceeds(page, onchainBeforeClaim)
    await triggerBarkRailSync(page)
    await expect(page.getByText('Bark emergency exit', { exact: true })).toBeVisible({
      timeout: 60_000,
    })
  })
})

const EXIT_CHILD_FUND_SATS = 100_000

async function fundConfirmedCoinsForExitChild(page: Page): Promise<void> {
  await goToWalletTab(page, 'Receive')
  const addressEl = page
    .locator('[data-infomode-id="receive-receiving-address-card"]')
    .locator('.font-mono')
  await expect(addressEl).toHaveText(/bcrt1/)
  const receiveAddress = (await addressEl.textContent())?.trim() ?? ''
  await fundRegtestWalletReceiveAddress(receiveAddress, EXIT_CHILD_FUND_SATS)
  await goToWalletTab(page, 'Dashboard')
  await runDashboardSyncUntilIdle(page)
}

async function progressEmergencyExitOnce(page: Page): Promise<void> {
  const notes: string[] = []
  const onConsole = (message: { type: () => string; text: () => string }) => {
    const type = message.type()
    if (type === 'error' || type === 'warning') notes.push(`${type}: ${message.text()}`)
  }
  page.on('console', onConsole)
  const errorToast = page.locator('[data-sonner-toast][data-type="error"]')
  const errorsBefore = await errorToast.count()
  await page.getByTestId('bark-emergency-exit-progress').click()
  const progressed = page.getByText('Emergency exit progressed.')
  const failed = errorToast.nth(errorsBefore)
  try {
    await expect(progressed.or(failed).first()).toBeVisible({ timeout: 120_000 })
  } catch (err) {
    page.off('console', onConsole)
    throw new Error(
      `Emergency exit progress produced no toast. Console: ${notes.join(' | ') || '(none)'}`,
      { cause: err },
    )
  }
  page.off('console', onConsole)
  if (await failed.isVisible()) {
    const message = (await failed.innerText()).replace(/\s+/g, ' ').trim()
    throw new Error(`Emergency exit progress failed: ${message}`)
  }
}

async function exitBarkAmount(page: Page, amountSats: number): Promise<number> {
  await goToWalletTab(page, 'Dashboard')
  const onchainBefore = await readDashboardOnchainSats(page)
  await page.getByTestId('dashboard-bark-exit-link').click()
  await expect(page.getByTestId('bark-exit-destination')).toHaveText(/bcrt1/)
  await expect(page.locator('input')).toHaveCount(1)
  await page.getByTestId('bark-exit-amount').fill(String(amountSats))
  await page.getByTestId('bark-exit-review-amount').click()
  const arrivedSats = await readExitOnchainAmount(page)
  await confirmExitAndReturnToDashboard(page)
  await mineUntilOnchainGain(page, onchainBefore, arrivedSats)
  return arrivedSats
}

async function exitBarkRemainder(page: Page): Promise<void> {
  await goToWalletTab(page, 'Dashboard')
  const onchainBefore = await readDashboardOnchainSats(page)
  expect(onchainBefore).toBeGreaterThan(0)
  await page.getByTestId('dashboard-bark-exit-link').click()
  const reviewAll = page.getByTestId('bark-exit-review-all')
  await expect(reviewAll).toBeEnabled({ timeout: 60_000 })
  await reviewAll.click()
  const arrivedSats = await readExitOnchainAmount(page)
  expect(arrivedSats).toBeGreaterThan(0)
  await confirmExitAndReturnToDashboard(page)
  await mineUntilOnchainGain(page, onchainBefore, arrivedSats)
}

async function confirmExitAndReturnToDashboard(page: Page): Promise<void> {
  await page.getByTestId('bark-exit-confirm').click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 120_000 })
}

async function syncUntilBarkSpendableDrops(page: Page, spendableBefore: number): Promise<void> {
  // Bark re-checks an offboard confirmation on a 30s cadence. The change VTXO
  // becomes spendable on the sync after that check.
  await expect(async () => {
    await triggerBarkRailSync(page)
    const latest = await readDashboardBarkSpendableSats(page)
    expect(latest).toBeGreaterThan(0)
    expect(latest).toBeLessThan(spendableBefore)
  }).toPass({ timeout: 90_000, intervals: [5_000, 10_000, 15_000, 15_000] })
}


async function readExitOnchainAmount(page: Page): Promise<number> {
  const amount = page.getByTestId('bark-exit-onchain-amount')
  await expect(amount).toBeVisible({ timeout: 60_000 })
  const text = (await amount.textContent()) ?? ''
  const sats = Number(text.replace(/\D/g, ''))
  expect(sats).toBeGreaterThan(0)
  return sats
}

async function mineUntilOnchainGain(
  page: Page,
  onchainBefore: number,
  minimumGain: number,
): Promise<void> {
  await goToWalletTab(page, 'Dashboard')
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await mineRegtestBlocks(1)
    await runDashboardSyncUntilIdle(page)
    const onchainAfter = await readDashboardOnchainSats(page)
    if (onchainAfter - onchainBefore >= minimumGain) return
  }
  const onchainAfter = await readDashboardOnchainSats(page)
  expect(onchainAfter - onchainBefore).toBeGreaterThanOrEqual(minimumGain)
}

async function mineUntilOnchainExceeds(page: Page, onchainBefore: number): Promise<void> {
  await mineUntilOnchainGain(page, onchainBefore, 1)
}
