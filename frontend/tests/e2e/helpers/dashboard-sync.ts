import { expect, type Page } from '@playwright/test'

const isCi = !!process.env.CI

/** Extra headroom on CI: runners are slower and Playwright may use two workers. */
const SYNC_FINISH_TIMEOUT_MS = isCi ? 90_000 : 60_000

function syncControlTimeoutMs(override?: number): number {
  if (override !== undefined) return override
  return SYNC_FINISH_TIMEOUT_MS
}

const ONCHAIN_SYNC_BUTTON = 'Sync on-chain'
const LIGHTNING_SYNC_BUTTON = 'Sync Lightning'

/**
 * The on-chain rail sync control is visible on the dashboard balance card but disabled
 * while that rail's `syncPhase === 'syncing'` (e.g. after a network switch).
 * Lightning and Arkade have separate controls (`Sync Lightning`, `Sync Arkade`).
 */
export async function waitForOnchainRailSyncButtonEnabled(
  page: Page,
  /** Defaults to CI-aware syncControlTimeoutMs (same as post-Sync idle on CI) unless overridden. */
  timeout = syncControlTimeoutMs(),
): Promise<void> {
  const syncButton = page.getByTestId('rail-sync-onchain')
  await expect(syncButton).toBeVisible({ timeout })
  await expect(syncButton).toBeEnabled({ timeout })
}

/** @deprecated Use waitForOnchainRailSyncButtonEnabled */
export async function waitForDashboardSyncButtonEnabled(
  page: Page,
  timeout = syncControlTimeoutMs(),
): Promise<void> {
  await waitForOnchainRailSyncButtonEnabled(page, timeout)
}

/**
 * Runs one full manual on-chain sync: enabled Sync on-chain → Syncing… → idle again.
 * Does not trigger Lightning or Arkade sync controls.
 */
export async function runDashboardSyncUntilIdle(page: Page): Promise<void> {
  const syncButton = page.getByTestId('rail-sync-onchain')
  await waitForOnchainRailSyncButtonEnabled(page)
  await syncButton.click()
  await expect(syncButton).toHaveText(/Syncing/i, { timeout: 10_000 })
  await expect(syncButton).toHaveText(ONCHAIN_SYNC_BUTTON, {
    timeout: SYNC_FINISH_TIMEOUT_MS,
  })
  await expect(syncButton).toBeEnabled({ timeout: SYNC_FINISH_TIMEOUT_MS })
}

/** Runs manual Lightning sync on the dashboard (NWC history + balances). */
export async function runLightningRailSyncUntilIdle(page: Page): Promise<void> {
  const syncButton = page.getByTestId('rail-sync-lightning')
  await expect(syncButton).toBeVisible({ timeout: syncControlTimeoutMs() })
  await expect(syncButton).toBeEnabled({ timeout: syncControlTimeoutMs() })
  await syncButton.click()
  await expect(syncButton).toHaveText(/Syncing/i, { timeout: 10_000 })
  await expect(syncButton).toHaveText(LIGHTNING_SYNC_BUTTON, {
    timeout: SYNC_FINISH_TIMEOUT_MS,
  })
  await expect(syncButton).toBeEnabled({ timeout: SYNC_FINISH_TIMEOUT_MS })
}
