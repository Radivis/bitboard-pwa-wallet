import { type Page, expect } from '@playwright/test'
import { clickDrawerNavLink } from './drawer-nav'
import { designOnOffGroup, turnDesignOnOffOn } from './design-on-off-switch'
import { openSettingsFeaturesTab, openSettingsMainTab } from './settings-waits'

/**
 * Turns on Settings → Features → SegWit addresses. Call when already on Settings (Main tab).
 * Returns to Main so network and address controls are available.
 */
export async function ensureSegwitAddressesFeatureOn(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await openSettingsFeaturesTab(page)
  await turnDesignOnOffOn(designOnOffGroup(page, 'Enable SegWit address options and labels'))
  await openSettingsMainTab(page)
}

/**
 * Opens Settings and enables SegWit address options (pickers and badges).
 */
export async function enableSegwitAddressesFeature(page: Page): Promise<void> {
  await clickDrawerNavLink(page, 'Settings')
  await openSettingsMainTab(page)
  await ensureSegwitAddressesFeatureOn(page)
}
