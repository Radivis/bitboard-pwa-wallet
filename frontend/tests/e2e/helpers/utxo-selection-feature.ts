import { type Page, expect } from '@playwright/test'
import { clickDrawerNavLink } from './drawer-nav'
import { designOnOffGroup, turnDesignOnOffOn } from './design-on-off-switch'
import { openSettingsFeaturesTab, openSettingsMainTab } from './settings-waits'

/**
 * Turns on Settings → Features → UTXO selection. Call when already on Settings.
 * Returns to Main tab afterward.
 */
export async function ensureUtxoSelectionFeatureOn(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await openSettingsFeaturesTab(page)
  await turnDesignOnOffOn(
    designOnOffGroup(page, 'Enable manual UTXO selection on send review'),
  )
  await openSettingsMainTab(page)
}

/**
 * Opens Settings and enables manual UTXO selection on send review.
 */
export async function enableUtxoSelectionFeature(page: Page): Promise<void> {
  await clickDrawerNavLink(page, 'Settings')
  await openSettingsMainTab(page)
  await ensureUtxoSelectionFeatureOn(page)
}
