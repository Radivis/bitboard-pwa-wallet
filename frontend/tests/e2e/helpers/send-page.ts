import { expect, type Page } from '@playwright/test'
import { runDashboardSyncUntilIdle } from './dashboard-sync'
import { onChainSpendableSatsFromSendPageAvailableText } from './onchain-spendable-balance-text'
import {
  E2E_CI_AWARE_LONG_WAIT_MS,
  E2E_IS_CI,
  waitForDashboardShowsFundedOnChainBalance,
} from './regtest'
import { goToWalletTab } from './wallet-nav'

async function readSendPageAvailableSectionText(page: Page): Promise<string> {
  const availableRow = page.locator('div').filter({ hasText: /^Available:/ }).first()
  if (!(await availableRow.isVisible().catch(() => false))) {
    return ''
  }
  return (await availableRow.innerText()) ?? ''
}

/**
 * Waits until the send form reflects a spendable on-chain balance (not merely pending incoming).
 * Re-syncs from the dashboard when BDK lags Esplora after regtest funding.
 */
export async function waitForSendPageSpendableOnChainBalance(
  page: Page,
  minSats: number,
): Promise<void> {
  const timeoutMs = E2E_IS_CI
    ? Math.max(120_000, E2E_CI_AWARE_LONG_WAIT_MS)
    : Math.max(45_000, E2E_CI_AWARE_LONG_WAIT_MS)
  let dashboardResyncAttempts = 0
  const maxDashboardResyncAttempts = E2E_IS_CI ? 4 : 2

  await expect
    .poll(
      async () => {
        const availableText = await readSendPageAvailableSectionText(page)
        if (onChainSpendableSatsFromSendPageAvailableText(availableText) >= minSats) {
          return true
        }

        if (dashboardResyncAttempts >= maxDashboardResyncAttempts) {
          return false
        }

        dashboardResyncAttempts += 1
        await goToWalletTab(page, 'Dashboard')
        await runDashboardSyncUntilIdle(page)
        await waitForDashboardShowsFundedOnChainBalance(page)
        await goToWalletTab(page, 'Send')
        await expect(page.getByText('Send Bitcoin')).toBeVisible({ timeout: 10_000 })
        return false
      },
      {
        timeout: timeoutMs,
        intervals: [300, 600, 1200, 2000],
        message: `Send page Available balance still below ${minSats} sats (need confirmed/spendable, not pending only)`,
      },
    )
    .toBe(true)
}

export async function waitForSendReviewTransactionButtonEnabled(
  page: Page,
  timeoutMs = E2E_IS_CI ? 60_000 : 45_000,
): Promise<void> {
  await expect(page.getByRole('button', { name: 'Review Transaction' })).toBeEnabled({
    timeout: timeoutMs,
  })
}
