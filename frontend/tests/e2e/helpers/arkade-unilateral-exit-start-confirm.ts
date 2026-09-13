import { expect, type Page } from '@playwright/test'

/** Acknowledge the first-start risk modal when starting unilateral exit. No-op if absent. */
export async function confirmStartUnilateralExitIfShown(page: Page): Promise<void> {
  const modal = page.getByTestId('unilateral-exit-start-confirm-modal')
  if (!(await modal.isVisible())) {
    return
  }

  await page.getByTestId('unilateral-exit-start-ack').check()
  await page.getByTestId('unilateral-exit-start-confirm').click()
  await expect(modal).not.toBeVisible({ timeout: 15_000 })
}
