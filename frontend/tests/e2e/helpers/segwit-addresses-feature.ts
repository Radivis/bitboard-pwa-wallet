import { type Page, expect } from '@playwright/test'

/**
 * Turns on Settings → Features → SegWit addresses. Call when already on the Settings page.
 */
export async function ensureSegwitAddressesFeatureOn(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  const segwitFeatureSwitch = page.getByRole('switch', {
    name: 'Enable SegWit address options and labels',
  })
  await segwitFeatureSwitch.scrollIntoViewIfNeeded()
  if (!(await segwitFeatureSwitch.isChecked())) {
    await segwitFeatureSwitch.click()
  }
}

/**
 * Opens Settings and enables SegWit address options (pickers and badges).
 */
export async function enableSegwitAddressesFeature(page: Page): Promise<void> {
  await page.getByRole('link', { name: /settings/i }).click()
  await ensureSegwitAddressesFeatureOn(page)
}
