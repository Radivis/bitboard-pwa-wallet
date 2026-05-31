import { type Page, expect } from '@playwright/test'
import { openSettingsFeaturesTab, openSettingsMainTab } from './settings-waits'

/**
 * Turns on Settings → Features → UTXO selection. Call when already on Settings.
 * Returns to Main tab afterward.
 */
export async function ensureUtxoSelectionFeatureOn(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await openSettingsFeaturesTab(page)
  const utxoSelectionSwitch = page.getByRole('switch', {
    name: 'Enable manual UTXO selection on send review',
  })
  await utxoSelectionSwitch.scrollIntoViewIfNeeded()
  if (!(await utxoSelectionSwitch.isChecked())) {
    await utxoSelectionSwitch.click()
  }
  await openSettingsMainTab(page)
}

/**
 * Opens Settings and enables manual UTXO selection on send review.
 */
export async function enableUtxoSelectionFeature(page: Page): Promise<void> {
  await page.getByRole('link', { name: /^Settings$/i }).click()
  await page.waitForURL(/\/settings/)
  await openSettingsMainTab(page)
  await ensureUtxoSelectionFeatureOn(page)
}
