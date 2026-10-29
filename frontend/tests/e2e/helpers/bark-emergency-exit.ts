import { type Locator, type Page, expect } from '@playwright/test'
import { runDashboardSyncUntilIdle } from './dashboard-sync'
import { fundRegtestWalletReceiveAddress } from './regtest'
import { goToWalletTab } from './wallet-nav'

const EXIT_START_FUND_SATS = 100_000

type EmergencyExitAction = {
  label: string
  buttonTestId: string
  success: Locator
}

export async function openEmergencyExitPage(page: Page): Promise<void> {
  await goToWalletTab(page, 'Management')
  await page.getByTestId('bark-emergency-exit-link').click()
  await expect(page.getByRole('heading', { name: 'Bark emergency exit' })).toBeVisible({
    timeout: 30_000,
  })
}

/** Clicks one emergency-exit control and fails with the error toast text instead of a timeout. */
export async function clickEmergencyExitAction(
  page: Page,
  action: EmergencyExitAction,
): Promise<void> {
  const notes: string[] = []
  const onConsole = (message: { type: () => string; text: () => string }) => {
    const type = message.type()
    if (type === 'error' || type === 'warning') notes.push(`${type}: ${message.text()}`)
  }
  page.on('console', onConsole)
  const errorToast = page.locator('[data-sonner-toast][data-type="error"]')
  const errorsBefore = await errorToast.count()
  await page.getByTestId(action.buttonTestId).click()
  const failed = errorToast.nth(errorsBefore)
  try {
    await expect(action.success.or(failed).first()).toBeVisible({ timeout: 120_000 })
  } catch (err) {
    throw new Error(
      `${action.label} showed neither its result nor an error. Console: ${notes.join(' | ') || '(none)'}`,
      { cause: err },
    )
  } finally {
    page.off('console', onConsole)
  }
  if (await failed.isVisible()) {
    const message = (await failed.innerText()).replace(/\s+/g, ' ').trim()
    throw new Error(`${action.label} failed: ${message}`)
  }
}

/** Acknowledge the loss-of-funds and fee risks, then confirm. Start runs only after that. */
export async function confirmEmergencyExitStart(page: Page): Promise<void> {
  await expect(page.getByTestId('bark-emergency-exit-start-confirm-modal')).toBeVisible()
  await page.getByTestId('bark-emergency-exit-start-ack').check()
  await clickEmergencyExitAction(page, {
    label: 'Emergency exit start',
    buttonTestId: 'bark-emergency-exit-start-confirm',
    success: page.getByText('Emergency exit started.'),
  })
}

/** Starts an exit of every spendable coin and does not progress it. */
export async function startEmergencyExitOfWholeWallet(page: Page): Promise<void> {
  await reviewWholeWalletExit(page)
  if (await page.getByTestId('bark-emergency-exit-start').isDisabled()) {
    await fundConfirmedCoinsForExitStart(page)
    await reviewWholeWalletExit(page)
  }
  await expect(page.getByTestId('bark-emergency-exit-start')).toBeEnabled()
  await page.getByTestId('bark-emergency-exit-start').click()
  await confirmEmergencyExitStart(page)
}

/** Cancels every live exit that still offers Cancel. */
export async function cancelEmergencyExits(page: Page): Promise<void> {
  await openEmergencyExitPage(page)
  const cancelButtons = page.locator('[data-testid^="bark-emergency-exit-cancel-"]')
  await expect(cancelButtons.first()).toBeVisible({ timeout: 30_000 })
  while ((await cancelButtons.count()) > 0) {
    const testId = await cancelButtons.first().getAttribute('data-testid')
    if (testId == null) {
      throw new Error('Emergency exit cancel button has no test id')
    }
    await clickEmergencyExitAction(page, {
      label: 'Emergency exit cancel',
      buttonTestId: testId,
      success: page.getByText('Emergency exit canceled.'),
    })
    await expect(page.getByTestId(testId)).toHaveCount(0)
  }
}

async function reviewWholeWalletExit(page: Page): Promise<void> {
  await openEmergencyExitPage(page)
  await expect(page.locator('[data-testid^="bark-emergency-exit-vtxo-"]').first()).toBeVisible({
    timeout: 60_000,
  })
  await page.getByTestId('bark-emergency-exit-whole-wallet').check()
  await clickEmergencyExitAction(page, {
    label: 'Emergency exit review',
    buttonTestId: 'bark-emergency-exit-review',
    success: page.getByTestId('bark-emergency-exit-fee-review'),
  })
}

async function fundConfirmedCoinsForExitStart(page: Page): Promise<void> {
  await goToWalletTab(page, 'Receive')
  const addressEl = page
    .locator('[data-infomode-id="receive-receiving-address-card"]')
    .locator('.font-mono')
  await expect(addressEl).toHaveText(/bcrt1/)
  const receiveAddress = (await addressEl.textContent())?.trim() ?? ''
  await fundRegtestWalletReceiveAddress(receiveAddress, EXIT_START_FUND_SATS)
  await goToWalletTab(page, 'Dashboard')
  await runDashboardSyncUntilIdle(page)
}
