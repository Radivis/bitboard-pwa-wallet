import type { Page } from '@playwright/test'

/** Opens the header menu and follows a top-level section link. */
export async function clickDrawerNavLink(page: Page, name: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name }).click()
}
