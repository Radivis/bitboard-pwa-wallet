import { type Locator, type Page } from '@playwright/test'

export function designOnOffGroup(page: Page, name: string): Locator {
  return page.getByRole('group', { name })
}

export function designOnOffButton(group: Locator, option: 'On' | 'Off'): Locator {
  return group.getByRole('button', { name: option, exact: true })
}

export async function designOnOffIsOn(group: Locator): Promise<boolean> {
  return (await designOnOffButton(group, 'On').getAttribute('aria-pressed')) === 'true'
}

/** Selects On when that option is not already pressed. */
export async function turnDesignOnOffOn(group: Locator): Promise<void> {
  await group.scrollIntoViewIfNeeded()
  if (!(await designOnOffIsOn(group))) {
    await designOnOffButton(group, 'On').click()
  }
}

/** Selects Off when that option is not already pressed. */
export async function turnDesignOnOffOff(group: Locator): Promise<void> {
  await group.scrollIntoViewIfNeeded()
  if (await designOnOffIsOn(group)) {
    await designOnOffButton(group, 'Off').click()
  }
}
