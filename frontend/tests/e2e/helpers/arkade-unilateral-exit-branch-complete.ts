import { type Page } from '@playwright/test'

/**
 * Branch-complete releases the broadcast job to idle, so step-progress unmounts.
 * Prefer the durable leftover-children status, then in-job copy, then the success toast.
 */
export async function isUnilateralExitBranchCompleteInPage(page: Page): Promise<boolean> {
  if (await page.getByTestId('unilateral-exit-branch-complete').isVisible()) {
    return true
  }
  if (
    await page
      .getByTestId('unilateral-exit-step-progress')
      .getByText(/branch complete/i)
      .isVisible()
  ) {
    return true
  }
  return page.getByText('Unilateral exit branch complete.').isVisible()
}
