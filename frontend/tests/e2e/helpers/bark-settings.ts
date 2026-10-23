import { type Page, expect } from '@playwright/test'
import { openSettingsFeaturesTab, openSettingsMainTab } from './settings-waits'

export async function enableBarkFeature(page: Page): Promise<void> {
  await page.getByRole('link', { name: /settings/i }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await openSettingsFeaturesTab(page)
  const barkSwitch = page.getByRole('switch', { name: 'Enable Bark rail' })
  await barkSwitch.scrollIntoViewIfNeeded()
  const checked = await barkSwitch.getAttribute('aria-checked')
  if (checked !== 'true') {
    await barkSwitch.click()
    await expect(page.getByRole('heading', { name: 'Enable Bark', level: 2 })).toBeVisible()
    await page.getByRole('checkbox', {
      name: /I understand Bark is new/i,
    }).click()
    await page.getByRole('button', { name: 'Enable Bark' }).click()
    await expect(page.getByRole('heading', { name: 'Enable Bark', level: 2 })).not.toBeVisible()
  }
  await openSettingsMainTab(page)
}
