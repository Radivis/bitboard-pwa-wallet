import { type Page, expect } from '@playwright/test'
import type { LabState } from '@/workers/lab-api'

/** Switch to Lab network and SegWit (BIP84) address type. */
export async function switchToLabAndSegwit(page: Page): Promise<void> {
  await page.getByRole('link', { name: /settings/i }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await page.getByRole('button', { name: 'Lab' }).click()
  await expect(page.getByRole('link', { name: 'Manage lab' })).toBeVisible({
    timeout: 60000,
  })

  await page.getByRole('button', { name: 'SegWit (BIP84)' }).click()
  const changeButton = page.getByRole('button', { name: 'Change' })
  if (await changeButton.isVisible()) {
    await changeButton.click()
  }
  await expect(page.getByText(/Lab SegWit sub-wallet loaded/)).toBeVisible({
    timeout: 15000,
  })

  await page.getByRole('link', { name: /receive/i }).click()
  await expect(page.getByRole('heading', { name: 'Receive Bitcoin' })).toBeVisible({
    timeout: 15000,
  })
}

/** Reset the lab (navigate to /lab via client-side nav, click Reset, confirm). */
export async function resetLab(page: Page): Promise<void> {
  await page.getByRole('link', { name: /settings/i }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.getByRole('link', { name: 'Manage lab' }).click()
  await expect(page.getByRole('heading', { name: 'Lab' })).toBeVisible({
    timeout: 15000,
  })

  await page.getByRole('button', { name: 'Reset lab' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Reset lab' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByText('Blocks mined: 0')).toBeVisible({ timeout: 10000 })
}

export type MineOwnerType = 'name' | 'wallet'

export interface MineOptions {
  targetAddress?: string
  ownerName?: string
}

async function navigateToLab(page: Page): Promise<void> {
  const labHeading = page.getByRole('heading', { name: 'Lab' })
  if (await labHeading.isVisible()) return
  await page.getByRole('link', { name: /settings/i }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.getByRole('link', { name: 'Manage lab' }).click()
}

/** Mine blocks in the lab. */
export async function mineBlocksInLab(
  page: Page,
  count: number,
  ownerType: MineOwnerType,
  options?: MineOptions,
): Promise<void> {
  if (ownerType === 'wallet') {
    await page.getByRole('link', { name: /receive/i }).click()
    await expect(page.getByRole('heading', { name: 'Receive Bitcoin' })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByRole('main').locator('.font-mono').first()).toContainText(/bcrt1/, {
      timeout: 10000,
    })
  }

  await navigateToLab(page)
  await expect(page.getByRole('heading', { name: 'Lab' })).toBeVisible({
    timeout: 15000,
  })

  await page.getByLabel('Number of blocks').fill(String(count))
  await page.getByRole('button', { name: ownerType === 'name' ? 'Name' : 'Wallet' }).click()

  await expect(page.getByRole('button', { name: 'Mine blocks' })).toBeEnabled({
    timeout: 20000,
  })

  if (ownerType === 'name' && options?.targetAddress !== undefined) {
    await page.getByLabel(/Target address/).fill(options.targetAddress)
  }
  if (ownerType === 'name' && options?.ownerName !== undefined) {
    const ownerInput = page.locator('#owner-name')
    await expect(ownerInput).toBeVisible()
    await ownerInput.fill(options.ownerName)
    await expect(ownerInput).toHaveValue(options.ownerName)
  }

  await page.getByRole('button', { name: 'Mine blocks' }).click()
  await expect(page.getByRole('button', { name: 'Mine blocks' })).toBeEnabled({
    timeout: 30000,
  })
}

/** Create a transaction in the lab UI (name-owned addresses only). */
export async function createTransactionInLab(
  page: Page,
  fromAddress: string,
  toAddress: string,
  amountSats: number,
  feeRate: number,
): Promise<void> {
  await navigateToLab(page)
  await expect(page.getByRole('heading', { name: 'Lab' })).toBeVisible({
    timeout: 15000,
  })

  await page.getByRole('button', { name: 'Make transaction' }).click()
  await page.getByLabel('From address').fill(fromAddress)
  await page.getByLabel('To address').fill(toAddress)
  await page.getByLabel('Amount (sats)').fill(String(amountSats))
  await page.getByLabel('Fee rate (sat/vB)').fill(String(feeRate))
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText('Transaction added to mempool')).toBeVisible({
    timeout: 15000,
  })
}

/** Send from wallet via Send page (wallet-owned UTXOs). */
export async function sendFromWallet(
  page: Page,
  toAddress: string,
  amountSats: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future fee rate control
  _feeRate: number = 1,
): Promise<void> {
  await page.getByRole('link', { name: /send/i }).click()
  await expect(page.getByText('Send Bitcoin')).toBeVisible()

  await page.getByLabel('Recipient Address').fill(toAddress)
  await page.getByRole('button', { name: 'Switch to sats' }).click()
  const amountInput = page.getByLabel(/Amount/)
  await amountInput.fill(String(amountSats))
  await expect(amountInput).toHaveValue(String(amountSats))

  await expect(
    page.getByRole('button', { name: 'Review Transaction' }),
  ).toBeEnabled({ timeout: 30000 })
  await page.getByRole('button', { name: 'Review Transaction' }).click()

  await expect(page.getByText('Transaction Details')).toBeVisible({
    timeout: 60000,
  })
  await page.getByRole('button', { name: 'Confirm and Send' }).click()

  await expect(page.getByText('Transaction added to mempool')).toBeVisible({
    timeout: 30000,
  })
}

/** Get lab state via test hook. Navigates to lab first if needed. */
export async function getLabState(page: Page): Promise<LabState> {
  await navigateToLab(page)
  await expect(page.getByRole('heading', { name: 'Lab' })).toBeVisible({ timeout: 5000 })
  const state = await page.evaluate(async () => {
    const fn = (window as unknown as { __labGetState?: () => Promise<LabState> }).__labGetState
    if (!fn) throw new Error('__labGetState not available')
    return await fn()
  })
  return state
}

/** Sum UTXOs for a given owner (name or wallet:name). */
export function getUtxoSumByOwner(state: LabState, owner: string): number {
  const addressToOwner = state.addressToOwner ?? {}
  return (state.utxos ?? [])
    .filter((u) => addressToOwner[u.address] === owner)
    .reduce((sum, u) => sum + u.amountSats, 0)
}
