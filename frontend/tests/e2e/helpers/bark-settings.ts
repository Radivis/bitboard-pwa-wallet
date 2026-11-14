import { type Page, expect } from '@playwright/test'
import { clickDrawerNavLink } from './drawer-nav'
import { designOnOffButton, designOnOffGroup, designOnOffIsOn } from './design-on-off-switch'
import { openSettingsFeaturesTab, openSettingsMainTab } from './settings-waits'

export async function enableBarkFeature(page: Page): Promise<void> {
  await clickDrawerNavLink(page, 'Settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await openSettingsFeaturesTab(page)
  const barkSwitch = designOnOffGroup(page, 'Enable Bark rail')
  await barkSwitch.scrollIntoViewIfNeeded()
  if (!(await designOnOffIsOn(barkSwitch))) {
    await designOnOffButton(barkSwitch, 'On').click()
    await expect(page.getByRole('heading', { name: 'Enable Bark', level: 2 })).toBeVisible()
    await page.getByRole('checkbox', {
      name: /I understand Bark is new/i,
    }).click()
    await page.getByRole('button', { name: 'Enable Bark' }).click()
    await expect(page.getByRole('heading', { name: 'Enable Bark', level: 2 })).not.toBeVisible()
  }
  await openSettingsMainTab(page)
}
