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

/** Networks that are only disabled during an in-flight switch (not feature-gated). */
const SETTINGS_NETWORK_SWITCH_IDLE_BUTTONS = ['Testnet', 'Signet', 'Lab'] as const

/**
 * After clicking a network on Settings, waits until the switch mutation finishes:
 * non–feature-gated network buttons become enabled again (no `disabled={loading}`).
 * Mainnet is excluded: it can stay aria-disabled until Mainnet access is enabled in Features.
 */
export async function waitForSettingsNetworkSwitchComplete(
  page: Page,
  timeout = 120_000,
): Promise<void> {
  for (const name of SETTINGS_NETWORK_SWITCH_IDLE_BUTTONS) {
    await expect(page.getByRole('button', { name, exact: true })).toBeEnabled({
      timeout,
    })
  }
}

/**
 * After Mainnet access is on, waits until no network switch is in progress and Mainnet is selectable.
 */
export async function waitForSettingsNetworkSwitchCompleteIncludingMainnet(
  page: Page,
  timeout = 120_000,
): Promise<void> {
  await waitForSettingsNetworkSwitchComplete(page, timeout)
  await expect(page.getByRole('button', { name: 'Mainnet', exact: true })).toBeEnabled({
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
