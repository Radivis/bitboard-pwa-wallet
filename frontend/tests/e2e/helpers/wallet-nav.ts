import { type Page, expect } from '@playwright/test'

const WALLET_SUB_NAV_VISIBLE_TIMEOUT_MS = 15_000

export type WalletSubNavTab = 'Dashboard' | 'Send' | 'Receive' | 'Management'

/**
 * Opens a wallet sub-nav tab (Dashboard, Send, Receive, Management). That bar is
 * only rendered on wallet routes; after Settings or Lab, navigate via the
 * primary "Wallet" link first.
 */
export async function goToWalletTab(page: Page, tab: WalletSubNavTab): Promise<void> {
  const walletSubNav = page.getByRole('navigation', { name: 'Wallet' })
  if (!(await walletSubNav.isVisible())) {
    await page.getByRole('link', { name: /^Wallet$/i }).click()
    await expect(walletSubNav).toBeVisible({
      timeout: WALLET_SUB_NAV_VISIBLE_TIMEOUT_MS,
    })
  }
  await walletSubNav.getByRole('link', { name: tab }).click()
}
