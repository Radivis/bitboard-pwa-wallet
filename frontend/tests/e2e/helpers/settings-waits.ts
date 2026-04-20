import { type Page, expect } from '@playwright/test'

/** Settings subsection bar (Main / Security / Features / About). */
export async function openSettingsMainTab(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('link', { name: 'Main' })
    .click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
}

export async function openSettingsFeaturesTab(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('link', { name: 'Features' })
    .click()
  await expect(page.getByRole('heading', { name: 'Features' })).toBeVisible()
}

/**
 * After clicking a network on Settings, waits until the switch mutation finishes:
 * network mode buttons become enabled again (inline phase text is gone).
 * Uses Testnet (not Mainnet) because Mainnet can stay aria-disabled when Mainnet access is off.
 */
export async function waitForSettingsNetworkSwitchComplete(
  page: Page,
  timeout = 120_000,
): Promise<void> {
  await expect(page.getByRole('button', { name: 'Testnet' })).toBeEnabled({
    timeout,
  })
}

/**
 * After confirming an address type change on Settings, waits until the switch finishes.
 */
export async function waitForSettingsAddressTypeSwitchComplete(
  page: Page,
  timeout = 60_000,
): Promise<void> {
  await expect(page.getByRole('button', { name: 'Taproot (BIP86)' })).toBeEnabled({
    timeout,
  })
}

/** Network button uses `data-variant="default"` when that mode is active. */
export async function waitForSettingsNetworkModeButtonSelected(
  page: Page,
  networkButtonName: string,
  timeout = 120_000,
): Promise<void> {
  await expect(
    page.getByRole('button', { name: networkButtonName, exact: true }),
  ).toHaveAttribute('data-variant', 'default', { timeout })
}
