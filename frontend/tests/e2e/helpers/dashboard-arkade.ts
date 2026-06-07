import { type Page, expect } from '@playwright/test'
import { satsFromFirstFormattedBitcoinDisplayInRoot } from './bitcoin-amount-display'
import { goToWalletTab } from './wallet-nav'

export async function waitForArkadeBalanceCard(page: Page, timeout = 120_000): Promise<void> {
  await expect(page.getByTestId('dashboard-arkade-balance-card')).toBeVisible({ timeout })
}

export async function expectArkadeBalanceNotEmptySession(page: Page, timeout = 120_000): Promise<void> {
  await waitForArkadeBalanceCard(page, timeout)
  await expect(page.getByTestId('dashboard-arkade-session-empty')).not.toBeVisible({ timeout })
  await expect(page.getByTestId('dashboard-arkade-balance-amount')).toBeVisible({ timeout })
}

export async function readDashboardArkadeBalanceSats(page: Page): Promise<number> {
  const amountLocator = page.getByTestId('dashboard-arkade-balance-amount')
  await expect(amountLocator).toBeVisible({ timeout: 60_000 })
  const sats = await satsFromFirstFormattedBitcoinDisplayInRoot(amountLocator)
  if (sats == null) {
    throw new Error('Could not parse Arkade balance from dashboard')
  }
  return sats
}

export async function goToReceiveArkadeMode(page: Page): Promise<void> {
  await goToWalletTab(page, 'Receive')
  const arkadeToggle = page.getByRole('button', { name: 'Arkade' })
  await expect(arkadeToggle).toBeVisible({ timeout: 30_000 })
  await arkadeToggle.click()
  await expect(page.getByRole('heading', { name: 'Receive on Arkade' })).toBeVisible({
    timeout: 30_000,
  })
}
