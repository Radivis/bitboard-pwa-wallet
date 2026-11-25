import { type Page, expect } from '@playwright/test'
import { clickDrawerNavLink } from './drawer-nav'
import { designOnOffButton, designOnOffGroup, designOnOffIsOn } from './design-on-off-switch'
import {
  openSettingsFeaturesTab,
  openSettingsMainTab,
  settingsNetworkButton,
  waitForSettingsNetworkSwitchComplete,
  waitForSettingsNetworkModeButtonSelected,
} from './settings-waits'

export async function enableArkadeFeature(page: Page): Promise<void> {
  await clickDrawerNavLink(page, 'Settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await openSettingsFeaturesTab(page)
  const arkadeSwitch = designOnOffGroup(page, 'Enable Arkade offchain layer')
  await arkadeSwitch.scrollIntoViewIfNeeded()
  if (!(await designOnOffIsOn(arkadeSwitch))) {
    await designOnOffButton(arkadeSwitch, 'On').click()
    await expect(page.getByRole('heading', { name: 'Enable Arkade', level: 2 })).toBeVisible()
    await page.getByRole('checkbox', {
      name: /I understand Arkade is new/i,
    }).click()
    await page.getByRole('button', { name: 'Enable Arkade' }).click()
    await expect(page.getByRole('heading', { name: 'Enable Arkade', level: 2 })).not.toBeVisible()
  }
  await openSettingsMainTab(page)
}

/** Mock ASP E2E: Mutinynet switch + mocked operator session (not live Mutinynet). */
const ARKADE_MUTINYNET_SWITCH_TIMEOUT_MS = process.env.CI ? 90_000 : 60_000

export async function switchToMutinynet(page: Page): Promise<void> {
  await clickDrawerNavLink(page, 'Settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await settingsNetworkButton(page, 'Mutinynet').click()
  await waitForSettingsNetworkModeButtonSelected(
    page,
    'Mutinynet',
    ARKADE_MUTINYNET_SWITCH_TIMEOUT_MS,
  )
  await waitForSettingsNetworkSwitchComplete(page, ARKADE_MUTINYNET_SWITCH_TIMEOUT_MS)
}
