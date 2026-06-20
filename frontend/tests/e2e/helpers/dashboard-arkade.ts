import { type Page, expect } from '@playwright/test'
import { satsFromFirstFormattedBitcoinDisplayInRoot } from './bitcoin-amount-display'
import { goToWalletTab } from './wallet-nav'
import { E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS } from '@/lib/arkade/e2e/arkade-operator-mock-state'

/** Mock ASP E2E happy path is ~5–15s; allow headroom for CI WASM cold start. */
const ARKADE_MOCK_UI_TIMEOUT_MS = process.env.CI ? 60_000 : 30_000

export async function waitForArkadeBalanceCard(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await expect(page.getByTestId('dashboard-arkade-balance-card')).toBeVisible({ timeout })
}

/** Wait until Arkade load lifecycle reaches `loaded`. */
export async function waitForArkadeLoadReady(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await expect(page.locator('[data-rail-arkade-load="loaded"]')).toBeVisible({ timeout })
}

/**
 * Session is open and balance UI is visible. Does not wait for post-load operator sync —
 * use {@link waitForArkadeMockDashboardBalance} when asserting mock ASP fixture balances.
 */
export async function expectArkadeBalanceNotEmptySession(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await waitForArkadeLoadReady(page, timeout)
  await waitForArkadeBalanceCard(page, timeout)
  await expect(page.getByTestId('dashboard-arkade-session-empty')).not.toBeVisible({ timeout })
  await expect(page.getByTestId('dashboard-arkade-balance-amount')).toBeVisible({ timeout })
}

/** Load + post-load operator sync; balance matches mock ASP fixture (default 42_000 sats). */
export async function waitForArkadeMockDashboardBalance(
  page: Page,
  expectedSats = E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await expectArkadeBalanceNotEmptySession(page, timeout)
  await waitForDashboardArkadeBalanceSats(page, expectedSats, timeout)
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
  await expect(async () => {
    const address =
      (await page.getByTestId('arkade-receive-address').textContent())?.trim() ?? ''
    if (!address.startsWith('tark1') && !address.startsWith('ark1')) {
      throw new Error(`Arkade receive address not ready: "${address}"`)
    }
  }).toPass({ timeout })
  await expect(page.getByRole('button', { name: 'Copy address' })).toBeEnabled({
    timeout: 10_000,
  })
}

/** Unlock starts Arkade load in the background — wait before Receive assertions. */
export async function waitForDashboardArkadeSessionAfterUnlock(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await goToWalletTab(page, 'Dashboard')
  await waitForArkadeLoadReady(page, timeout)
  await waitForArkadeWasmSessionReady(page, timeout)
}

/**
 * Like {@link waitForDashboardArkadeSessionAfterUnlock} but does not require balance UI —
 * use when the test only asserts receive-address persistence (balance query may lag).
 */
export async function waitForArkadeWorkerReadyAfterUnlock(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await goToWalletTab(page, 'Dashboard')
  await waitForArkadeLoadReady(page, timeout)
  await waitForArkadeBalanceCard(page, timeout)
  await waitForArkadeWasmSessionReady(page, timeout)
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
  const addressLocator = page.getByTestId('arkade-receive-address')
  await expect(addressLocator).toBeVisible({ timeout: 15_000 })
  await expect(addressLocator).not.toHaveText(/^Loading/, { timeout: 15_000 })
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
