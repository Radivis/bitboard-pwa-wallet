import { type Page, expect } from '@playwright/test'
import {
  openSettingsFeaturesTab,
  openSettingsMainTab,
  waitForSettingsNetworkSwitchComplete,
  waitForSettingsNetworkModeButtonSelected,
} from './settings-waits'
import { enableArkadeFeature } from './arkade-settings'
import { importWalletViaUI, TEST_PASSWORD } from './wallet-setup'
import { goToWalletTab } from './wallet-nav'
import { runDashboardSyncUntilIdle } from './dashboard-sync'
import {
  fundRegtestAddress,
  waitForConfirmedBalance,
  waitForDashboardShowsFundedOnChainBalance,
} from './regtest'
import {
  waitForArkadeLoadReady,
  waitForDashboardArkadeBalanceAtLeast,
  triggerArkadeRailSync,
} from './dashboard-arkade'

const REGTEST_NETWORK_SWITCH_TIMEOUT_MS = process.env.CI ? 90_000 : 60_000

export async function enableRegtestDeveloperMode(page: Page): Promise<void> {
  await page.getByRole('link', { name: /settings/i }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await openSettingsFeaturesTab(page)
  const regtestModeSwitch = page.getByRole('switch', {
    name: 'Enable Regtest mode for developers',
  })
  await regtestModeSwitch.scrollIntoViewIfNeeded()
  const checked = await regtestModeSwitch.getAttribute('aria-checked')
  if (checked !== 'true') {
    await regtestModeSwitch.click()
  }
  await openSettingsMainTab(page)
}

export async function switchToRegtestNetwork(page: Page): Promise<void> {
  await page.getByRole('link', { name: /settings/i }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.getByRole('button', { name: 'Regtest' }).click()
  await waitForSettingsNetworkModeButtonSelected(
    page,
    'Regtest',
    REGTEST_NETWORK_SWITCH_TIMEOUT_MS,
  )
  await waitForSettingsNetworkSwitchComplete(page, REGTEST_NETWORK_SWITCH_TIMEOUT_MS)
}

export async function goToArkadeManagementPanel(page: Page): Promise<void> {
  await goToWalletTab(page, 'Management')
  await expect(page.getByRole('heading', { name: 'Management' })).toBeVisible()
  await expect(page.getByText('Arkade (offchain layer)')).toBeVisible({ timeout: 60_000 })
}

/**
 * Import deterministic wallet, enable regtest + Arkade, wait for Arkade session.
 *
 * Arkade must be enabled **before** switching to regtest so
 * `refreshArkadeSessionAfterNetworkSwitch` opens a session (same order as mock E2E:
 * enable Arkade → switch network).
 */
export async function setupRegtestArkadeWallet(
  page: Page,
  mnemonic: string,
): Promise<void> {
  await importWalletViaUI(page, mnemonic, TEST_PASSWORD)
  await enableRegtestDeveloperMode(page)
  await enableArkadeFeature(page)
  await switchToRegtestNetwork(page)
  await goToWalletTab(page, 'Dashboard')
  await waitForArkadeLoadReady(page, 120_000)
}

export async function goToArkadeBoardPage(page: Page): Promise<void> {
  await goToArkadeManagementPanel(page)
  await page.getByRole('link', { name: 'Board from on-chain' }).click()
  await expect(page.getByRole('heading', { name: 'Board to Arkade' })).toBeVisible()
}

export async function readBoardingAddress(page: Page): Promise<string> {
  await goToArkadeBoardPage(page)
  const addressLocator = page.locator('.font-mono.text-xs').first()
  await expect
    .poll(
      async () => {
        const address = (await addressLocator.textContent())?.trim() ?? ''
        return address.startsWith('bcrt1') ? address : null
      },
      { timeout: 60_000, intervals: [500, 1000, 2000] },
    )
    .not.toBeNull()
  const address = (await addressLocator.textContent())?.trim() ?? ''
  if (!address.startsWith('bcrt1')) {
    throw new Error(`Expected regtest boarding address, got: ${address}`)
  }
  return address
}

/**
 * arkd `validateBoardingInput` treats block-based `boardingExitDelay` as wall-clock seconds
 * (30 blocks → ~30s cooperative settle window). Fund and settle within this budget.
 */
const BOARDING_COOPERATIVE_SETTLE_BUDGET_MS = 25_000

export async function settleBoardingUtxo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settle boarding UTXO' }).click()
  await expect(page.getByRole('button', { name: 'Settling…' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(async () => {
    const isSettling = await page.getByRole('button', { name: 'Settling…' }).isVisible()
    if (isSettling) {
      throw new Error('Boarding settle still in progress')
    }

    if (await page.getByText('Boarding settlement submitted to operator').isVisible()) {
      return
    }

    const expiredLine = page.locator('li').filter({ hasText: 'Unilateral exit only:' })
    const expiredText = (await expiredLine.textContent()) ?? ''
    const expiredMatch = expiredText.match(/Unilateral exit only:\s*([\d,]+)/)
    const expiredSats = expiredMatch
      ? Number(expiredMatch[1].replace(/,/g, ''))
      : 0
    if (expiredSats > 0) {
      throw new Error(`Boarding UTXO left cooperative settle window: ${expiredText.trim()}`)
    }

    const errorToast = page.locator('[data-sonner-toast]').filter({
      hasText: /boarding|settle|intent|register|expired|fee|failed|error|timed out|batch/i,
    })
    if (await errorToast.first().isVisible()) {
      const message = ((await errorToast.first().textContent()) ?? 'unknown').trim()
      throw new Error(`Boarding settle failed: ${message}`)
    }

    throw new Error('Waiting for boarding settle success or error')
  }).toPass({ timeout: 180_000 })
  await expect(page.getByRole('button', { name: 'Settle boarding UTXO' })).toBeEnabled({
    timeout: 10_000,
  })
}

export async function fundAndBoardToArkade(
  page: Page,
  boardSats: number,
): Promise<void> {
  const boardingAddress = await readBoardingAddress(page)
  const fundStartedAt = Date.now()
  await fundRegtestAddress(boardingAddress, boardSats)
  await waitForConfirmedBalance(boardingAddress, boardSats, 20_000)
  // Stay on the board page — avoid dashboard on-chain sync racing the Arkade worker.
  await expect
    .poll(
      async () => {
        const readyLine = page.locator('li').filter({ hasText: 'Ready to settle:' })
        const text = (await readyLine.textContent()) ?? ''
        return /Ready to settle:\s*(?!0\s)/.test(text)
      },
      { timeout: 15_000, intervals: [200, 500, 1000] },
    )
    .toBe(true)
  const elapsedMs = Date.now() - fundStartedAt
  if (elapsedMs > BOARDING_COOPERATIVE_SETTLE_BUDGET_MS) {
    throw new Error(
      `Boarding UTXO cooperative settle window likely expired before settle (${elapsedMs}ms since fund; budget ${BOARDING_COOPERATIVE_SETTLE_BUDGET_MS}ms)`,
    )
  }
  await settleBoardingUtxo(page)
  await goToWalletTab(page, 'Dashboard')
  await triggerArkadeRailSync(page)
  // Headline balance includes boarding ready-to-settle; require settled offchain VTXOs.
  await waitForDashboardArkadeBalanceAtLeast(page, boardSats - Math.ceil(boardSats * 0.02), 120_000)
  await goToArkadeBoardPage(page)
  await expect
    .poll(
      async () => {
        const readyLine = page.locator('li').filter({ hasText: 'Ready to settle:' })
        const text = (await readyLine.textContent()) ?? ''
        return /Ready to settle:\s*0(\s|$)/.test(text)
      },
      { timeout: 60_000, intervals: [500, 1000, 2000] },
    )
    .toBe(true)
}

export async function ensureOnChainBumperFunds(page: Page, sats: number): Promise<void> {
  await goToWalletTab(page, 'Receive')
  const addressEl = page
    .locator('[data-infomode-id="receive-receiving-address-card"]')
    .locator('.font-mono')
  await expect(addressEl).toBeVisible({ timeout: 15_000 })
  const address = (await addressEl.textContent())?.trim()
  if (!address) throw new Error('Missing on-chain receive address')
  await fundRegtestAddress(address, sats)
  await goToWalletTab(page, 'Dashboard')
  await runDashboardSyncUntilIdle(page)
  await waitForDashboardShowsFundedOnChainBalance(page)
}
