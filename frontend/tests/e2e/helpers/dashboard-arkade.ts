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
  const card = page.getByTestId('dashboard-arkade-balance-card')
  await expect(card).toBeVisible({ timeout })

  await expect
    .poll(
      async () => {
        const loadPhase = await card.getAttribute('data-rail-arkade-load')
        if (loadPhase === 'loaded') return 'loaded'
        if (loadPhase === 'load-error') {
          const banner = page.getByTestId('wallet-load-error-banner-arkade')
          const message = ((await banner.textContent()) ?? 'unknown').trim()
          throw new Error(`Arkade session failed to open: ${message}`)
        }
        return loadPhase
      },
      { timeout, intervals: [250, 500, 1000, 2000] },
    )
    .toBe('loaded')
}

/** Assert Arkade load-error banner is visible (session open failure). */
export async function expectArkadeLoadErrorBanner(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await expect(page.getByTestId('wallet-load-error-banner-arkade')).toBeVisible({ timeout })
}

/** Assert Arkade sync-error banner is visible (operator sync failure with loaded session). */
export async function expectArkadeSyncErrorBanner(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await expect(page.getByTestId('wallet-sync-error-banner-arkade')).toBeVisible({ timeout })
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

export async function waitForArkadeSyncIdle(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await expect(page.locator('[data-rail-arkade-sync="not-syncing"]')).toBeVisible({
    timeout,
  })
}

/** Clicks per-rail Sync Arkade and waits until operator sync finishes. */
export async function triggerArkadeRailSync(
  page: Page,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  const syncButton = page.getByTestId('rail-sync-arkade')
  await expect(syncButton).toBeVisible({ timeout })
  await expect(syncButton).toBeEnabled({ timeout })
  await syncButton.click()
  await expect(async () => {
    const syncPhase = await page
      .getByTestId('dashboard-arkade-balance-card')
      .getAttribute('data-rail-arkade-sync')
    if (syncPhase !== 'not-syncing') {
      throw new Error(`Arkade sync still in progress: ${syncPhase ?? 'unknown'}`)
    }
  }).toPass({ timeout })
}

/** Live WASM SDK persistence JSON (e.g. Rust regtest boarded-wallet fixture export). */
export async function exportBoardedWalletSdkPersistenceJson(page: Page): Promise<string> {
  await page.waitForFunction(
    () => typeof window.__e2eExportBoardedWalletSdkPersistenceJson === 'function',
    undefined,
    { timeout: 15_000 },
  )
  return page.evaluate(async () => {
    const exportFn = window.__e2eExportBoardedWalletSdkPersistenceJson
    if (exportFn == null) {
      throw new Error(
        '__e2eExportBoardedWalletSdkPersistenceJson not available (DEV + VITE_E2E_ARKADE_REGTEST required)',
      )
    }
    return exportFn()
  })
}

/** Receive route search param — avoids flaky mode-toggle clicks in E2E. */
async function navigateToReceiveArkadeMode(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const navigate = (
      window as unknown as { __e2eNavigateToReceiveArkade?: () => Promise<void> }
    ).__e2eNavigateToReceiveArkade
    if (!navigate) {
      throw new Error(
        '__e2eNavigateToReceiveArkade not available (DEV only — Playwright E2E must run against Vite dev)',
      )
    }
    await navigate()
  })
}

export async function goToReceiveArkadeMode(page: Page): Promise<void> {
  await navigateToReceiveArkadeMode(page)
  await expect(page.getByRole('heading', { name: 'Receive on Arkade' })).toBeVisible({
    timeout: 15_000,
  })
  await waitForArkadeWasmSessionReady(page)
}

export async function clickArkadeGenerateNewAddress(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Receive on Arkade' })).toBeVisible({
    timeout: 15_000,
  })
  await waitForReceiveArkadeAddressReady(page)
  const generateButton = page.getByTestId('arkade-generate-new-address')
  await expect(generateButton).toBeEnabled({ timeout: 15_000 })
  await generateButton.click()
}

/** Wait until `offchain_next_derivation_index` advances after Generate New Address. */
export async function clickArkadeGenerateNewAddressAndWaitForIndexAdvance(
  page: Page,
  previousIndex: number,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<number> {
  await clickArkadeGenerateNewAddress(page)
  let nextIndex = previousIndex
  await expect(async () => {
    nextIndex = (
      await page.evaluate(() => window.__E2E_ARKADE__!.readReceiveDebugSnapshot())
    ).offchainNextDerivationIndex
    expect(nextIndex).toBeGreaterThan(previousIndex)
  }).toPass({ timeout })
  return nextIndex
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

/** Live regtest: balance varies with boarded amount; assert a positive floor only. */
export async function waitForDashboardArkadeBalanceAtLeast(
  page: Page,
  minSats: number,
  timeout = ARKADE_MOCK_UI_TIMEOUT_MS,
): Promise<void> {
  await expect(async () => {
    expect(await readDashboardArkadeBalanceSats(page)).toBeGreaterThanOrEqual(minSats)
  }).toPass({ timeout })
}
