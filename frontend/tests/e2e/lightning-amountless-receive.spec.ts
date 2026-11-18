import { test, expect } from '@playwright/test'
import { createWalletViaUI } from './helpers/wallet-setup'
import { goToWalletTab } from './helpers/wallet-nav'
import { clickDrawerNavLink } from './helpers/drawer-nav'
import {
  openSettingsFeaturesTab,
  waitForSettingsNetworkModeButtonSelected,
  waitForSettingsNetworkSwitchComplete,
} from './helpers/settings-waits'
import {
  designOnOffButton,
  designOnOffGroup,
  designOnOffIsOn,
} from './helpers/design-on-off-switch'

const E2E_NWC_CONNECTION_STRING = 'nostr+walletconnect://e2e-mock'
const E2E_NWC_LABEL = 'E2E Amountless Wallet'
const AMOUNTLESS_BOLT11 = 'lnbc1e2einvoiceamountless'

test.describe('Lightning amountless receive @nwc', () => {
  test('creates an amountless invoice when the amount is left empty', async ({ page }) => {
    test.skip(
      process.env.VITE_E2E_NWC_MOCK !== 'true',
      'Run with VITE_E2E_NWC_MOCK=true (npm run test:e2e:nwc).',
    )
    test.setTimeout(120_000)

    await createWalletViaUI(page)

    await clickDrawerNavLink(page, 'Settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.getByRole('button', { name: 'Signet' }).click()
    await waitForSettingsNetworkSwitchComplete(page)
    await waitForSettingsNetworkModeButtonSelected(page, 'Signet')

    await openSettingsFeaturesTab(page)
    const lightningToggle = designOnOffGroup(page, 'Enable Lightning Network')
    if (!(await designOnOffIsOn(lightningToggle))) {
      await designOnOffButton(lightningToggle, 'On').click()
      await expect(designOnOffButton(lightningToggle, 'On')).toHaveAttribute('aria-pressed', 'true')
    }

    await goToWalletTab(page, 'Management')
    await expect(page.getByRole('heading', { name: 'Management' })).toBeVisible()
    await page.getByRole('button', { name: 'Connect Lightning Wallet' }).click()
    await page.getByLabel('NWC Connection String').fill(E2E_NWC_CONNECTION_STRING)
    await page.getByRole('button', { name: 'Test Connection' }).click()
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
      timeout: 15_000,
    })
    await page.locator('#ln-wallet-label').fill(E2E_NWC_LABEL)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(E2E_NWC_LABEL)).toBeVisible()

    await goToWalletTab(page, 'Receive')
    await page.getByRole('group', { name: 'Receive rail' }).getByRole('button', { name: 'Lightning' }).click()

    await expect(page.getByLabel(/amount/i)).toHaveValue('')
    await expect(page.getByText(/must be specified by payer/i)).toBeVisible()

    await page.getByLabel(/description/i).fill('Coffee tip')
    await page.getByRole('button', { name: 'Create Invoice' }).click()

    await expect(page.getByText('Amountless invoice created')).toBeVisible()
    await expect(page.getByText('Amount set by payer')).toBeVisible()
    await expect(page.getByText(AMOUNTLESS_BOLT11)).toBeVisible()
    await expect(page.getByText('Coffee tip')).toBeVisible()
  })
})
