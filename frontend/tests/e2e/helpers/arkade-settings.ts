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
    await expect(page.getByRole('heading', { name: 'Enable Arkade', level: 2 })).toBeVisible()
    await page.getByRole('checkbox', {
      name: /I understand Arkade is new/i,
    }).click()
    await page.getByRole('button', { name: 'Enable Arkade' }).click()
    await expect(page.getByRole('heading', { name: 'Enable Arkade', level: 2 })).not.toBeVisible()
  }
  await openSettingsMainTab(page)
}

/** Mock ASP E2E: signet switch + mocked operator session (not live Mutinynet). */
const ARKADE_SIGNET_SWITCH_TIMEOUT_MS = process.env.CI ? 90_000 : 60_000

export async function switchToSignet(page: Page): Promise<void> {
  await page.getByRole('link', { name: /settings/i }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.getByRole('button', { name: 'Signet' }).click()
  await waitForSettingsNetworkModeButtonSelected(page, 'Signet', ARKADE_SIGNET_SWITCH_TIMEOUT_MS)
  await waitForSettingsNetworkSwitchComplete(page, ARKADE_SIGNET_SWITCH_TIMEOUT_MS)
}
