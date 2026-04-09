import { type Page, expect } from '@playwright/test'
import type { LabState } from '@/workers/lab-api'
import { WALLET_OWNER_PREFIX } from '@/lib/lab-utils'
import { goToWalletTab } from './wallet-nav'
import { waitForSettingsAddressTypeSwitchComplete } from './settings-waits'

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
  await waitForSettingsAddressTypeSwitchComplete(page)

  await goToWalletTab(page, 'Receive')
  await expect(page.getByRole('heading', { name: 'Receive Bitcoin' })).toBeVisible({
    timeout: 15000,
  })
}

/** Reset the lab (navigate to /lab via client-side nav, click Reset, confirm). */
export async function resetLab(page: Page): Promise<void> {
  await page.getByRole('link', { name: /settings/i }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.getByRole('link', { name: 'Manage lab' }).click()
  await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({
    timeout: 15000,
  })

  await page.getByRole('navigation', { name: 'Lab' }).getByRole('link', { name: 'Control' }).click()
  await expect(page.getByRole('heading', { name: 'Control' })).toBeVisible({
    timeout: 15000,
  })

  await page.getByRole('button', { name: 'Reset lab' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Reset lab' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()

  await page.getByRole('navigation', { name: 'Lab' }).getByRole('link', { name: 'Blocks' }).click()
  await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(/Chain height \(blocks mined\): 0/)).toBeVisible({
    timeout: 10000,
  })
}

export type MineOwnerType = 'name' | 'wallet'

export interface MineOptions {
  targetAddress?: string
  ownerName?: string
  /** Lab-entity mode with empty name and target: creates `Anonymous-{uuid}` wallet. */
  randomAnonymous?: boolean
}

async function navigateToLab(page: Page): Promise<void> {
  const blocksHeading = page.getByRole('heading', { name: 'Blocks' })
  if (await blocksHeading.isVisible()) return
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
    await goToWalletTab(page, 'Receive')
    await expect(page.getByRole('heading', { name: 'Receive Bitcoin' })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByRole('main').locator('.font-mono').first()).toContainText(/bcrt1/, {
      timeout: 10000,
    })
  }

  await navigateToLab(page)
  await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({
    timeout: 15000,
  })

  await page.getByLabel('Number of blocks').fill(String(count))
  await page.getByRole('button', { name: ownerType === 'name' ? 'Lab entity' : 'Wallet' }).click()

  await expect(page.getByRole('button', { name: 'Mine blocks' })).toBeEnabled({
    timeout: 20000,
  })

  if (ownerType === 'name' && options?.targetAddress !== undefined) {
    await page.getByLabel(/Target address/).fill(options.targetAddress)
  }
  if (ownerType === 'name' && options?.ownerName !== undefined) {
    const ownerInput = page.locator('#owner-name')
    await expect(ownerInput).toBeVisible()
    await ownerInput.clear()
    await ownerInput.pressSequentially(options.ownerName, { delay: 40 })
    await expect(ownerInput).toHaveValue(options.ownerName)
  }
  if (ownerType === 'name' && options?.ownerName === undefined) {
    const ownerInput = page.locator('#owner-name')
    if (await ownerInput.isVisible()) {
      await ownerInput.clear()
      await expect(ownerInput).toHaveValue('')
    }
  }
  if (ownerType === 'name' && options?.randomAnonymous) {
    const targetInput = page.locator('#target-address')
    await targetInput.clear()
    await expect(targetInput).toHaveValue('')
  }

  await page.getByRole('button', { name: 'Mine blocks' }).click()
  await expect(page.getByRole('button', { name: 'Mine blocks' })).toBeEnabled({
    timeout: 30000,
  })

  if (ownerType === 'name' && options?.ownerName?.trim()) {
    const owner = options.ownerName.trim()
    await expect
      .poll(
        async () => {
          const st = await getLabState(page)
          return getUtxoSumByOwner(st, owner)
        },
        { timeout: 20000, message: `Expected lab UTXOs for owner "${owner}" after mining` },
      )
      .toBeGreaterThan(0)
  }
  if (ownerType === 'name' && options?.randomAnonymous) {
    await expect
      .poll(
        async () => {
          const st = await getLabState(page)
          const anon = st.entities?.find((e) => e.entityName.startsWith('Anonymous-'))
          if (!anon) return 0
          return getUtxoSumByOwner(st, anon.entityName)
        },
        { timeout: 20000, message: 'Expected anonymous lab entity UTXOs after random mine' },
      )
      .toBeGreaterThan(0)
  }
  if (ownerType === 'wallet') {
    await expect
      .poll(
        async () => {
          const st = await getLabState(page)
          const map = st.addressToOwner ?? {}
          return (st.utxos ?? []).some((u) => {
            const o = map[u.address]
            return typeof o === 'string' && o.startsWith(WALLET_OWNER_PREFIX)
          })
        },
        { timeout: 20000, message: 'Expected wallet-owned lab UTXOs after mining' },
      )
      .toBe(true)
  }
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
  await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({
    timeout: 15000,
  })

  await page.getByRole('navigation', { name: 'Lab' }).getByRole('link', { name: 'Transactions' }).click()
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible({
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

/** Create random lab-entity transactions from Transactions tab. */
export async function createRandomTransactionsInLab(
  page: Page,
  count: number,
): Promise<void> {
  await navigateToLab(page)
  await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({
    timeout: 15000,
  })

  await page.getByRole('navigation', { name: 'Lab' }).getByRole('link', { name: 'Transactions' }).click()
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible({
    timeout: 15000,
  })

  await page.getByLabel('Number of random transactions').fill(String(count))
  await page.getByRole('button', { name: 'Make random transaction' }).click()

  await expect(page.getByText(`Created ${count} random transaction(s)`)).toBeVisible({
    timeout: 30000,
  })
}

/** Send from wallet via Send page (wallet-owned UTXOs). */
export async function sendFromWallet(
  page: Page,
  toAddress: string,
  amountSats: number,
  _feeRate: number = 1,
): Promise<void> {
  await goToWalletTab(page, 'Send')
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
  await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({ timeout: 5000 })
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

/** Resolve an address for a display owner (checks UTXOs first — always present after mining). */
export function findAddressForOwner(state: LabState, owner: string): string | undefined {
  const map = state.addressToOwner ?? {}
  const fromUtxo = state.utxos?.find((u) => map[u.address] === owner)?.address
  if (fromUtxo) return fromUtxo
  return state.addresses?.find((a) => map[a.address] === owner)?.address
}
