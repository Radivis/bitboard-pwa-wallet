import { expect, type Page } from '@playwright/test'

const isCi = !!process.env.CI

/** Extra headroom on CI: runners are slower and Playwright may use two workers. */
const SYNC_FINISH_TIMEOUT_MS = isCi ? 90_000 : 60_000

/**
 * The dashboard Sync control is visible whenever the dashboard is shown, but it is
 * disabled while `walletStatus === 'syncing'` (e.g. after a network switch).
 * Call this before clicking Sync so the test does not spin until timeout.
 */
export async function waitForDashboardSyncButtonEnabled(
  page: Page,
  timeout = 60_000,
): Promise<void> {
  const syncButton = page.getByRole('button', { name: 'Sync' })
  await expect(syncButton).toBeVisible({ timeout })
  await expect(syncButton).toBeEnabled({ timeout })
}

/**
 * Runs one full manual sync: enabled Sync → Syncing… → Sync again, then ensures
 * the button is enabled (idle) before returning.
 */
export async function runDashboardSyncUntilIdle(page: Page): Promise<void> {
  const syncButton = page.getByRole('button', { name: 'Sync' })
  await waitForDashboardSyncButtonEnabled(page)
  await syncButton.click()
  await expect(page.getByRole('button', { name: 'Syncing...' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(syncButton).toBeVisible({ timeout: SYNC_FINISH_TIMEOUT_MS })
  await expect(syncButton).toBeEnabled({ timeout: SYNC_FINISH_TIMEOUT_MS })
}
