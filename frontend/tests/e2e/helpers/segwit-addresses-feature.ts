import { type Page, expect } from '@playwright/test'
import { openSettingsFeaturesTab, openSettingsMainTab } from './settings-waits'

/**
 * Turns on Settings → Features → SegWit addresses. Call when already on Settings (Main tab).
 * Returns to Main so network and address controls are available.
 */
export async function ensureSegwitAddressesFeatureOn(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await openSettingsFeaturesTab(page)
  const segwitFeatureSwitch = page.getByRole('switch', {
    name: 'Enable SegWit address options and labels',
  })
  await segwitFeatureSwitch.scrollIntoViewIfNeeded()
  if (!(await segwitFeatureSwitch.isChecked())) {
    await segwitFeatureSwitch.click()
  }
  await openSettingsMainTab(page)
}

/**
 * Opens Settings and enables SegWit address options (pickers and badges).
 */
export async function enableSegwitAddressesFeature(page: Page): Promise<void> {
  await page.getByRole('link', { name: /settings/i }).click()
  await ensureSegwitAddressesFeatureOn(page)
}
