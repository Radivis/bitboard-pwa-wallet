import { type Page } from '@playwright/test'

const WALLET_TAB_PATHS: Record<WalletSubNavTab, string> = {
  Dashboard: '/wallet',
  Send: '/wallet/send',
  Receive: '/wallet/receive',
  Management: '/wallet/management',
}

export type WalletSubNavTab = 'Dashboard' | 'Send' | 'Receive' | 'Management'

/**
 * Opens a wallet sub-nav tab (Dashboard, Send, Receive, Management). That bar is
 * only rendered on wallet routes; after Settings, Lab, or Library, use the primary
 * "Wallet" link first.
 *
 * After lock, the app sends users to Library; opening Wallet can show the unlock
 * dialog whose overlay sits above the sub-nav (z-50 vs z-40), so the sub-nav is
 * not Playwright-visible even on `/wallet`. In that case we navigate by URL.
 */
export async function goToWalletTab(page: Page, tab: WalletSubNavTab): Promise<void> {
  const walletSubNav = page.getByRole('navigation', { name: 'Wallet' })

  if (await walletSubNav.isVisible()) {
    await walletSubNav.getByRole('link', { name: tab }).click()
    return
  }

  await page.getByRole('link', { name: /^Wallet$/i }).click()
  await page.waitForURL(/\/wallet(\/|$)/)

  try {
    await walletSubNav.waitFor({ state: 'visible', timeout: 2500 })
    await walletSubNav.getByRole('link', { name: tab }).click()
  } catch {
    await page.goto(WALLET_TAB_PATHS[tab])
  }
}
