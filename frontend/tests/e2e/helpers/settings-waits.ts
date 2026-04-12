import { type Page, expect } from '@playwright/test'

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
  await expect(page.getByRole('button', { name: networkButtonName })).toHaveAttribute(
    'data-variant',
    'default',
    { timeout },
  )
}
