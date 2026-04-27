import { expect, type Page } from '@playwright/test'

/**
 * Waits until Sonner’s full-scan loading line is gone (`toast.loading('Scanning blockchain…')`
 * in {@link syncActiveWalletAndUpdateState}).
 *
 * - If the toast never appears, this returns as soon as Playwright confirms no match (fast).
 * - If it appears, waits up to `timeoutMs` for it to disappear (success → "Wallet synced", or error → dismiss).
 */
export async function waitForFullScanLoadingToastGone(
  page: Page,
  timeoutMs: number,
): Promise<void> {
  await expect(
    page.getByText(/Scanning blockchain/).first(),
  ).not.toBeVisible({ timeout: timeoutMs })
}
