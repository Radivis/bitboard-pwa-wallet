import { expect, type Page } from '@playwright/test'

/**
 * Opens the header menu and follows a top-level section link.
 * A modal overlay (for example the unlock dialog during a lock redirect) sits above the
 * drawer and steals the click, then the route change unmounts the menu.
 */
export async function clickDrawerNavLink(page: Page, name: string | RegExp): Promise<void> {
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Menu' }).click()
  const menu = page.getByRole('dialog', { name: 'Menu' })
  await menu.getByRole('link', { name }).click()
  await expect(page.getByTestId('design-side-drawer-backdrop')).toHaveCount(0)
}
