import { type Page, expect } from '@playwright/test'
import type { LabState } from '@/workers/lab-api'
import { labEntityOwnerKey } from '@/lib/lab-entity-keys'
import { lookupLabAddressOwner, WALLET_OWNER_PREFIX } from '@/lib/lab-utils'
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
  /** Lab-entity mode with empty name and target: creates `Anonymous-{id}` wallet. */
  randomAnonymous?: boolean
}

/** Create a lab entity from Control (required before mining to a lab entity). */
export async function createLabEntityViaControl(page: Page, ownerName?: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Lab' }).getByRole('link', { name: 'Control' }).click()
  await expect(page.getByRole('heading', { name: 'Control' })).toBeVisible({ timeout: 15000 })
  const nameInput = page.getByLabel(/Name \(optional\)/)
  await nameInput.clear()
  if (ownerName) {
    await nameInput.fill(ownerName)
  }
  await page.getByRole('button', { name: 'Create lab entity' }).click()
  await expect(page.getByText('Lab entity created')).toBeVisible({ timeout: 15000 })
  await page.getByRole('navigation', { name: 'Lab' }).getByRole('link', { name: 'Blocks' }).click()
  await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({ timeout: 15000 })
}

function labOwnerMatchesDisplayKey(state: LabState, o: ReturnType<typeof lookupLabAddressOwner>, key: string): boolean {
  if (o == null) return false
  if (o.kind === 'wallet') {
    return `${WALLET_OWNER_PREFIX}${o.walletId}` === key
  }
  const entity = state.entities?.find((e) => e.labEntityId === o.labEntityId)
  const display = entity ? labEntityOwnerKey(entity) : `Anonymous-${o.labEntityId}`
  return display === key
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

  if (ownerType === 'name') {
    if (options?.randomAnonymous) {
      await createLabEntityViaControl(page)
    } else if (options?.ownerName !== undefined) {
      await createLabEntityViaControl(page, options.ownerName.trim() || undefined)
    }
  }

  await page.getByLabel('Number of blocks').fill(String(count))
  await page.getByRole('button', { name: ownerType === 'name' ? 'Lab entity' : 'Wallet' }).click()

  await expect(page.getByRole('button', { name: 'Mine blocks' })).toBeEnabled({
    timeout: 20000,
  })

  if (ownerType === 'name') {
    const select = page.locator('#lab-entity-mine-select')
    await expect(select).toBeVisible()
    if (options?.ownerName?.trim()) {
      await select.selectOption({ label: options.ownerName.trim() })
    } else if (options?.randomAnonymous) {
      await select.selectOption({ index: 0 })
    }
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
          const anon = st.entities?.find((e) => e.entityName == null)
          if (!anon) return 0
          const ownerKey = anon.entityName ?? `Anonymous-${anon.labEntityId}`
          return getUtxoSumByOwner(st, ownerKey)
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
            const o = lookupLabAddressOwner(u.address, map)
            return o != null && o.kind === 'wallet'
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

/** Sum UTXOs for a given owner (entity display key or wallet:id). */
export function getUtxoSumByOwner(state: LabState, owner: string): number {
  const addressToOwner = state.addressToOwner ?? {}
  return (state.utxos ?? [])
    .filter((u) =>
      labOwnerMatchesDisplayKey(state, lookupLabAddressOwner(u.address, addressToOwner), owner),
    )
    .reduce((sum, u) => sum + u.amountSats, 0)
}

/** Resolve an address for a display owner (checks UTXOs first — always present after mining). */
export function findAddressForOwner(state: LabState, owner: string): string | undefined {
  const map = state.addressToOwner ?? {}
  const fromUtxo = state.utxos?.find((u) =>
    labOwnerMatchesDisplayKey(state, lookupLabAddressOwner(u.address, map), owner),
  )?.address
  if (fromUtxo) return fromUtxo
  return state.addresses?.find((a) =>
    labOwnerMatchesDisplayKey(state, lookupLabAddressOwner(a.address, map), owner),
  )?.address
}
