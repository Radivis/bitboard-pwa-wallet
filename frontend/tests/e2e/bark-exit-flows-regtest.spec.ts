/**
 * Collaborative and emergency Bark exit against a short exit delay.
 *
 * Run: `npm run test:e2e:bark-exit-regtest` from `frontend/`.
 * That clean-start loads docker/captaind/captaind.exit.toml (`vtxo_exit_delta = 6`).
 *
 * Contracts: E2E-BARK-REG-04, E2E-BARK-REG-05, and E2E-BARK-REG-07.
 */
import { type Locator, type Page, test, expect } from '@playwright/test'
import { boardRegtestBarkWallet } from './helpers/bark-regtest-scenarios'
import {
  expectBarkRailSyncFails,
  readDashboardBarkSpendableSats,
  readDashboardOnchainSats,
  restartCaptaind,
  startCaptaind,
  stopCaptaind,
  triggerBarkRailSync,
  waitForBarkLoadReady,
} from './helpers/bark-regtest'
import { runDashboardSyncUntilIdle } from './helpers/dashboard-sync'
import { fundRegtestWalletReceiveAddress, mineRegtestBlocks } from './helpers/regtest'
import { goToWalletTab } from './helpers/wallet-nav'
import { unlockWalletViaUI } from './helpers/wallet-setup'

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
    await offboardBarkAmount(page, PARTIAL_EXIT_SATS)
    await syncUntilBarkSpendableDrops(page, spendableBeforePartialExit)
    await offboardBarkRemainder(page)
  })

  test('E2E-BARK-REG-05 emergency exit progresses to a claim', async ({ page }) => {
    await boardRegtestBarkWallet(page)
    // The child spends confirmed on-chain coins. The boarded VTXO's 330 sat
    // anchor is not enough, and the board change is not what coin selection saw.
    await fundConfirmedCoinsForExitChild(page)
    await startEmergencyExitOfOneVtxo(page)
    await progressEmergencyExitUntilClaimable(page)
    await claimEmergencyExitUntilOnchainGain(page)
    await triggerBarkRailSync(page)
    await expect(page.getByText('Bark emergency exit', { exact: true })).toBeVisible({
      timeout: 60_000,
    })
  })

  test('E2E-BARK-REG-07 emergency exit reaches a claim while the Ark server is stopped', async ({
    page,
  }) => {
    await boardRegtestBarkWallet(page)
    await fundConfirmedCoinsForExitChild(page)
    await stopCaptaind()
    try {
      await reopenWalletInFreshBarkSession(page)
      await expectBarkRailSyncFails(page)
      await startEmergencyExitOfOneVtxo(page)
      await progressEmergencyExitUntilClaimable(page)
      await claimEmergencyExitUntilOnchainGain(page)
    } finally {
      await startCaptaind()
    }
  })
})

const EXIT_CHILD_FUND_SATS = 100_000

/** A reload drops the worker, so the next unlock opens Bark from its stored records without a sync. */
async function reopenWalletInFreshBarkSession(page: Page): Promise<void> {
  await page.reload()
  await page.goto('/wallet')
  await unlockWalletViaUI(page)
  await waitForBarkLoadReady(page)
}

async function openEmergencyExitPage(page: Page): Promise<void> {
  await goToWalletTab(page, 'Management')
  await page.getByTestId('bark-emergency-exit-link').click()
  await expect(page.getByRole('heading', { name: 'Bark emergency exit' })).toBeVisible({
    timeout: 30_000,
  })
}

async function startEmergencyExitOfOneVtxo(page: Page): Promise<void> {
  await openEmergencyExitPage(page)
  const vtxo = page.locator('[data-testid^="bark-emergency-exit-vtxo-"]').first()
  await expect(vtxo).toBeVisible({ timeout: 60_000 })
  await vtxo.click()
  await clickEmergencyExitAction(page, {
    label: 'Emergency exit review',
    buttonTestId: 'bark-emergency-exit-review',
    success: page.getByTestId('bark-emergency-exit-fee-review'),
  })
  await page.getByTestId('bark-emergency-exit-start').click()
  await confirmEmergencyExitStart(page)
}

/** Acknowledge the loss-of-funds and fee risks, then confirm. Start runs only after that. */
async function confirmEmergencyExitStart(page: Page): Promise<void> {
  await expect(page.getByTestId('bark-emergency-exit-start-confirm-modal')).toBeVisible()
  await page.getByTestId('bark-emergency-exit-start-ack').check()
  await clickEmergencyExitAction(page, {
    label: 'Emergency exit start',
    buttonTestId: 'bark-emergency-exit-start-confirm',
    success: page.getByText('Emergency exit started.'),
  })
}

async function progressEmergencyExitUntilClaimable(page: Page): Promise<void> {
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
    await clickEmergencyExitProgress(page)
  }
  await expect(row).toContainText('Claimable')
}

/**
 * A full progress toasts. A partial one leaves children waiting for confirmed change
 * and shows the funding banner instead, so the next pass can fund them after a block.
 */
async function clickEmergencyExitProgress(page: Page): Promise<void> {
  const notes: string[] = []
  const onConsole = (message: { type: () => string; text: () => string }) => {
    const type = message.type()
    if (type === 'error' || type === 'warning') notes.push(`${type}: ${message.text()}`)
  }
  page.on('console', onConsole)
  const progressButton = page.getByTestId('bark-emergency-exit-progress')
  const errorToast = page.locator('[data-sonner-toast][data-type="error"]')
  const errorsBefore = await errorToast.count()
  const fundingBanner = page.getByTestId('bark-emergency-exit-funding-banner')
  const progressed = page.getByText('Emergency exit progressed.')
  let sawProgressToast = false
  const watchProgressToast = progressed
    .waitFor({ state: 'visible', timeout: 120_000 })
    .then(() => {
      sawProgressToast = true
    })
    .catch(() => undefined)
  try {
    await progressButton.click()
    await expect(progressButton).toBeDisabled()
    await expect(progressButton).toBeEnabled({ timeout: 120_000 })
    const failed = errorToast.nth(errorsBefore)
    if (await failed.isVisible()) {
      const message = (await failed.innerText()).replace(/\s+/g, ' ').trim()
      throw new Error(`Emergency exit progress failed: ${message}`)
    }
    if (!sawProgressToast && !(await fundingBanner.isVisible())) {
      await expect(progressed.or(fundingBanner).first()).toBeVisible({ timeout: 5_000 })
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Emergency exit progress failed:')) {
      throw err
    }
    throw new Error(
      `Emergency exit progress showed neither its result nor an error. Console: ${notes.join(' | ') || '(none)'}`,
      { cause: err },
    )
  } finally {
    page.off('console', onConsole)
    void watchProgressToast
  }
}

async function claimEmergencyExitUntilOnchainGain(page: Page): Promise<void> {
  await goToWalletTab(page, 'Dashboard')
  const onchainBeforeClaim = await readDashboardOnchainSats(page)
  await openEmergencyExitPage(page)
  await expect(page.getByTestId('bark-emergency-exit-claim')).toBeEnabled({ timeout: 30_000 })
  await clickEmergencyExitAction(page, {
    label: 'Emergency exit claim',
    buttonTestId: 'bark-emergency-exit-claim',
    success: page.getByText(/Claim broadcast/),
  })
  await goToWalletTab(page, 'Dashboard')
  await mineUntilOnchainExceeds(page, onchainBeforeClaim)
}

async function fundConfirmedCoinsForExitChild(page: Page): Promise<void> {
  await goToWalletTab(page, 'Receive')
  const addressEl = page
    .locator('[data-infomode-id="receive-receiving-address-card"]')
    .locator('.design-type-addresses:not(input):not(textarea):not(select)')
  await expect(addressEl).toHaveText(/bcrt1/)
  const receiveAddress = (await addressEl.textContent())?.trim() ?? ''
  await fundRegtestWalletReceiveAddress(receiveAddress, EXIT_CHILD_FUND_SATS)
  await goToWalletTab(page, 'Dashboard')
  await runDashboardSyncUntilIdle(page)
}

type EmergencyExitAction = {
  label: string
  buttonTestId: string
  success: Locator
}

/** Clicks one emergency-exit control and fails with the error toast text instead of a timeout. */
async function clickEmergencyExitAction(page: Page, action: EmergencyExitAction): Promise<void> {
  const notes: string[] = []
  const onConsole = (message: { type: () => string; text: () => string }) => {
    const type = message.type()
    if (type === 'error' || type === 'warning') notes.push(`${type}: ${message.text()}`)
  }
  page.on('console', onConsole)
  const errorToast = page.locator('[data-sonner-toast][data-type="error"]')
  const errorsBefore = await errorToast.count()
  await page.getByTestId(action.buttonTestId).click()
  const failed = errorToast.nth(errorsBefore)
  try {
    await expect(action.success.or(failed).first()).toBeVisible({ timeout: 120_000 })
  } catch (err) {
    throw new Error(
      `${action.label} showed neither its result nor an error. Console: ${notes.join(' | ') || '(none)'}`,
      { cause: err },
    )
  } finally {
    page.off('console', onConsole)
  }
  if (await failed.isVisible()) {
    const message = (await failed.innerText()).replace(/\s+/g, ' ').trim()
    throw new Error(`${action.label} failed: ${message}`)
  }
}

async function offboardBarkAmount(page: Page, amountSats: number): Promise<number> {
  await goToWalletTab(page, 'Dashboard')
  const onchainBefore = await readDashboardOnchainSats(page)
  await page.getByTestId('dashboard-bark-offboard-link').click()
  await expect(page.getByTestId('bark-offboard-destination')).toHaveText(/bcrt1/)
  await expect(page.locator('input')).toHaveCount(1)
  await page.getByTestId('bark-offboard-amount').fill(String(amountSats))
  await page.getByTestId('bark-offboard-review-amount').click()
  const arrivedSats = await readOffboardOnchainAmount(page)
  await confirmOffboardAndReturnToDashboard(page)
  await mineUntilOnchainGain(page, onchainBefore, arrivedSats)
  return arrivedSats
}

async function offboardBarkRemainder(page: Page): Promise<void> {
  await goToWalletTab(page, 'Dashboard')
  const onchainBefore = await readDashboardOnchainSats(page)
  expect(onchainBefore).toBeGreaterThan(0)
  await page.getByTestId('dashboard-bark-offboard-link').click()
  const reviewAll = page.getByTestId('bark-offboard-review-all')
  await expect(reviewAll).toBeEnabled({ timeout: 60_000 })
  await reviewAll.click()
  const arrivedSats = await readOffboardOnchainAmount(page)
  expect(arrivedSats).toBeGreaterThan(0)
  await confirmOffboardAndReturnToDashboard(page)
  await mineUntilOnchainGain(page, onchainBefore, arrivedSats)
}

async function confirmOffboardAndReturnToDashboard(page: Page): Promise<void> {
  await page.getByTestId('bark-offboard-confirm').click()
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


async function readOffboardOnchainAmount(page: Page): Promise<number> {
  const amount = page.getByTestId('bark-offboard-onchain-amount')
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
