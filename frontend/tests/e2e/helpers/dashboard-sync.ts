import { expect, type Page } from '@playwright/test'

const isCi = !!process.env.CI

/** Extra headroom on CI: runners are slower and Playwright may use two workers. */
const SYNC_FINISH_TIMEOUT_MS = isCi ? 90_000 : 60_000

function syncControlTimeoutMs(override?: number): number {
  if (override !== undefined) return override
  return SYNC_FINISH_TIMEOUT_MS
}

/**
 * The dashboard Sync control is visible whenever the dashboard is shown, but it is
 * disabled while `walletStatus === 'syncing'` (e.g. after a network switch).
 * Call this before clicking Sync so the test does not spin until timeout.
 */
export async function waitForDashboardSyncButtonEnabled(
  page: Page,
  /** Defaults to CI-aware syncControlTimeoutMs (same as post-Sync idle on CI) unless overridden. */
  timeout = syncControlTimeoutMs(),
): Promise<void> {
  // Use exact: true to avoid matching "Syncing..." (which contains "Sync")
  const syncButton = page.getByRole('button', { name: 'Sync', exact: true })
  await expect(syncButton).toBeVisible({ timeout })
  await expect(syncButton).toBeEnabled({ timeout })
}

/**
 * Runs one full manual sync: enabled Sync → Syncing… → Sync again, then ensures
 * the button is enabled (idle) before returning.
 */
export async function runDashboardSyncUntilIdle(page: Page): Promise<void> {
  // Use exact: true to avoid matching "Syncing..." (which contains "Sync")
  const syncButton = page.getByRole('button', { name: 'Sync', exact: true })
  await waitForDashboardSyncButtonEnabled(page)
  await syncButton.click()
  // Use .first() to handle case where ImportInitialSyncErrorBanner's Retry
  // button also shows "Syncing..." simultaneously with the main Sync button.
  await expect(
    page.getByRole('button', { name: 'Syncing...' }).first(),
  ).toBeVisible({
    timeout: 10_000,
  })
  await expect(syncButton).toBeVisible({ timeout: SYNC_FINISH_TIMEOUT_MS })
  await expect(syncButton).toBeEnabled({ timeout: SYNC_FINISH_TIMEOUT_MS })
}
