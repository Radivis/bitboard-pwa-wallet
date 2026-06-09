import { type Page, expect } from '@playwright/test'
import { satsFromFirstFormattedBitcoinDisplayInRoot } from './bitcoin-amount-display'
import { goToWalletTab } from './wallet-nav'

/** Mock ASP E2E happy path is ~5–15s; allow headroom for CI WASM cold start. */
const ARKADE_MOCK_UI_TIMEOUT_MS = process.env.CI ? 60_000 : 30_000

export async function waitForArkadeBalanceCard(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await expect(page.getByTestId('dashboard-arkade-balance-card')).toBeVisible({ timeout })
}

export async function expectArkadeBalanceNotEmptySession(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await waitForArkadeBalanceCard(page, timeout)
  await expect(page.getByTestId('dashboard-arkade-session-empty')).not.toBeVisible({ timeout })
  await expect(page.getByTestId('dashboard-arkade-balance-amount')).toBeVisible({ timeout })
}

export async function waitForArkadeActivityLoaded(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await expect(page.getByText('Loading Arkade activity…')).not.toBeVisible({ timeout })
}

export async function readDashboardArkadeBalanceSats(page: Page): Promise<number> {
  const amountLocator = page.getByTestId('dashboard-arkade-balance-amount')
  await expect(amountLocator).toBeVisible({ timeout: 15_000 })
  const sats = await satsFromFirstFormattedBitcoinDisplayInRoot(amountLocator)
  if (sats == null) {
    throw new Error('Could not parse Arkade balance from dashboard')
  }
  return sats
}

export async function goToReceiveArkadeMode(page: Page): Promise<void> {
  await goToWalletTab(page, 'Receive')
  const arkadeToggle = page.getByRole('button', { name: 'Arkade' })
  await expect(arkadeToggle).toBeVisible({ timeout: 15_000 })
  await arkadeToggle.click()
  await expect(page.getByRole('heading', { name: 'Receive on Arkade' })).toBeVisible({
    timeout: 15_000,
  })
}

export async function waitForReceiveArkadeAddressReady(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await expect(page.getByText('Loading address…')).not.toBeVisible({ timeout })
  await expect(page.getByRole('button', { name: 'Copy address' })).toBeEnabled({ timeout })
}

/** Unlock starts Arkade session open in the background; wait before WASM diagnostics or Receive. */
export async function waitForArkadeWasmSessionReady(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await expect(async () => {
    await page.evaluate(() => window.__E2E_ARKADE__!.readReceiveDebugSnapshot())
  }).toPass({ timeout })
}

export async function readReceiveArkadeAddress(page: Page): Promise<string> {
  await waitForReceiveArkadeAddressReady(page)
  const addressLocator = page.locator('.font-mono.break-all').first()
  await expect(addressLocator).toBeVisible({ timeout: 15_000 })
  const address = (await addressLocator.textContent())?.trim() ?? ''
  if (!address.startsWith('tark1') && !address.startsWith('ark1')) {
    throw new Error(`Expected Arkade receive address, got: ${address}`)
  }
  return address
}

export async function waitForDashboardArkadeBalanceSats(
  page: Page,
  expectedSats: number,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await expect(async () => {
    expect(await readDashboardArkadeBalanceSats(page)).toBe(expectedSats)
  }).toPass({ timeout })
}
