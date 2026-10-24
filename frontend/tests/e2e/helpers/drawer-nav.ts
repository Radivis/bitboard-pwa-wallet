import { expect, type Page } from '@playwright/test'

/** Opens the header menu and follows a top-level section link. */
export async function clickDrawerNavLink(page: Page, name: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Menu' }).click()
  const menu = page.getByRole('dialog', { name: 'Menu' })
  await menu.getByRole('link', { name }).click()
  await expect(page.getByTestId('design-side-drawer-backdrop')).toHaveCount(0)
}
