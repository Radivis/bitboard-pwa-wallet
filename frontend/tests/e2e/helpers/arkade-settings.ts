import { type Page, expect } from '@playwright/test'
import {
  openSettingsFeaturesTab,
  openSettingsMainTab,
  waitForSettingsNetworkSwitchComplete,
  waitForSettingsNetworkModeButtonSelected,
} from './settings-waits'

export async function enableArkadeFeature(page: Page): Promise<void> {
  await page.getByRole('link', { name: /settings/i }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await openSettingsFeaturesTab(page)
  const arkadeSwitch = page.getByRole('switch', {
    name: 'Enable Arkade offchain layer',
  })
  await arkadeSwitch.scrollIntoViewIfNeeded()
  const checked = await arkadeSwitch.getAttribute('aria-checked')
  if (checked !== 'true') {
    await arkadeSwitch.click()
  }
  await openSettingsMainTab(page)
}

/** Lab → Signet with Arkade enabled runs Esplora sync plus Arkade session open; allow extra time. */
const ARKADE_SIGNET_SWITCH_TIMEOUT_MS = 240_000

export async function switchToSignet(page: Page): Promise<void> {
  await page.getByRole('link', { name: /settings/i }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.getByRole('button', { name: 'Signet' }).click()
  await waitForSettingsNetworkModeButtonSelected(page, 'Signet', ARKADE_SIGNET_SWITCH_TIMEOUT_MS)
  await waitForSettingsNetworkSwitchComplete(page, ARKADE_SIGNET_SWITCH_TIMEOUT_MS)
}
