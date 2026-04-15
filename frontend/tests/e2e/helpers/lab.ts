import { type Page, expect } from '@playwright/test'
import { AddressType } from '@/lib/wallet-domain-types'
import { LabOwnerType } from '@/lib/lab-owner-type'
import type { LabState } from '@/workers/lab-api'
import { labEntityOwnerKey } from '@/lib/lab-entity-keys'
import { lookupLabAddressOwner, WALLET_OWNER_PREFIX } from '@/lib/lab-utils'
import { goToWalletTab } from './wallet-nav'
import { waitForSettingsNetworkSwitchComplete } from './settings-waits'
import { enableSegwitAddressesFeature } from './segwit-addresses-feature'

/** Switch to Lab network without changing address type (default is Taproot). */
export async function switchToLab(page: Page): Promise<void> {
  await page.getByRole('link', { name: /settings/i }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await page.getByRole('button', { name: 'Lab' }).click()
  await expect(page.getByRole('link', { name: 'Manage lab' })).toBeVisible({
    timeout: 60000,
  })

  await waitForSettingsNetworkSwitchComplete(page)

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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True when a lab entity with this display name already exists (create would reject as duplicate). */
function labStateHasNamedEntity(state: LabState, trimmedName: string): boolean {
  if (trimmedName === '') return false
  return (state.entities ?? []).some((e) => e.entityName === trimmedName)
}

export type MineOwnerType = LabOwnerType

export type LabEntityAddressType = AddressType

export interface MineOptions {
  targetAddress?: string
  ownerName?: string
  /** Lab-entity mode with empty name and target: creates `Anonymous-{id}` wallet. */
  randomAnonymous?: boolean
  /** BIP84 vs BIP86 for the lab entity row created before this mine (defaults to SegWit). */
  labAddressType?: LabEntityAddressType
}

/**
 * Odd index → SegWit, even → Taproot (1-based creation order within a test).
 */
export function labEntityAddressTypeForCreationIndex(index1Based: number): LabEntityAddressType {
  return index1Based % 2 === 1 ? AddressType.SegWit : AddressType.Taproot
}

/** Create a lab entity from Control (required before mining to a lab entity). */
export async function createLabEntityViaControl(
  page: Page,
  options?: { ownerName?: string; addressType?: LabEntityAddressType },
): Promise<void> {
  const addressType = options?.addressType ?? AddressType.SegWit

  /** Native SegWit (BIP84) lab entities need the SegWit addresses feature so the Control switch exists. */
  if (addressType === AddressType.SegWit) {
    await enableSegwitAddressesFeature(page)
    await page.getByRole('link', { name: 'Manage lab' }).click()
    await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({
      timeout: 15000,
    })
  }

  await page.getByRole('navigation', { name: 'Lab' }).getByRole('link', { name: 'Control' }).click()
  await expect(page.getByRole('heading', { name: 'Control' })).toBeVisible({ timeout: 15000 })

  const taprootAddressTypeSwitch = page.getByRole('switch', {
    name: /Use Taproot address type/,
  })
  if (addressType === AddressType.SegWit) {
    await taprootAddressTypeSwitch.setChecked(false)
  } else {
    if (await taprootAddressTypeSwitch.isVisible()) {
      await taprootAddressTypeSwitch.setChecked(true)
    }
  }
  const nameInput = page.getByLabel(/Name \(optional\)/)
  await nameInput.clear()
  if (options?.ownerName) {
    await nameInput.fill(options.ownerName)
  }
  await page.getByRole('button', { name: 'Create lab entity' }).click()
  await expect(page.getByText('Lab entity created').first()).toBeVisible({ timeout: 15000 })
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
  if (ownerType === LabOwnerType.Wallet) {
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

  if (ownerType === LabOwnerType.LabEntity) {
    if (options?.randomAnonymous) {
      await createLabEntityViaControl(page, {
        addressType: options.labAddressType ?? AddressType.SegWit,
      })
    } else if (options?.ownerName !== undefined) {
      const trimmedOwner = options.ownerName.trim()
      const stateBeforeCreate = await getLabState(page)
      if (!labStateHasNamedEntity(stateBeforeCreate, trimmedOwner)) {
        await createLabEntityViaControl(page, {
          ownerName: trimmedOwner || undefined,
          addressType: options.labAddressType,
        })
      }
    }
  }

  await page.getByLabel('Number of blocks').fill(String(count))
  await page.getByRole('button', {
    name: ownerType === LabOwnerType.LabEntity ? 'Lab entity' : 'Wallet',
  }).click()

  await expect(page.getByRole('button', { name: 'Mine blocks' })).toBeEnabled({
    timeout: 20000,
  })

  if (ownerType === LabOwnerType.LabEntity) {
    const select = page.locator('#lab-entity-mine-select')
    await expect(select).toBeVisible()
    if (options?.ownerName?.trim()) {
      const name = options.ownerName.trim()
      const optionLabel = await select
        .locator('option')
        .filter({ hasText: new RegExp(`^${escapeRegExp(name)} ·`) })
        .first()
        .innerText()
      await select.selectOption({ label: optionLabel.trim() })
    } else if (options?.randomAnonymous) {
      await select.selectOption({ index: 0 })
    }
  }

  await page.getByRole('button', { name: 'Mine blocks' }).click()
  await expect(page.getByRole('button', { name: 'Mine blocks' })).toBeEnabled({
    timeout: 30000,
  })

  if (ownerType === LabOwnerType.LabEntity && options?.ownerName?.trim()) {
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
  if (ownerType === LabOwnerType.LabEntity && options?.randomAnonymous) {
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
  if (ownerType === LabOwnerType.Wallet) {
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
/** Lab → Transactions tab (heading must be visible). */
export async function goToLabTransactionsPage(page: Page): Promise<void> {
  await navigateToLab(page)
  await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({
    timeout: 15000,
  })
  await page.getByRole('navigation', { name: 'Lab' }).getByRole('link', { name: 'Transactions' }).click()
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible({
    timeout: 15000,
  })
}

/** After manual lab-entity Send (no wallet Review step): toast + mempool length. */
export async function expectManualLabEntityTransactionInMempool(page: Page): Promise<void> {
  await expect(page.getByText('Transaction added to mempool').first()).toBeVisible({
    timeout: 60000,
  })
  await expect
    .poll(
      async () => (await getLabState(page)).mempool.length,
      { timeout: 60000 },
    )
    .toBeGreaterThan(0)
}

/**
 * Case-2 dust modal on `/lab/transactions` manual send (no Transaction Details step after bump).
 */
export async function clickLabDustChoiceManualLabEntityTx(
  page: Page,
  choice: LabDustChoice,
): Promise<void> {
  await expectLabChangeAndFeesModal(page)
  if (choice === 'keepExact') {
    await page.getByRole('button', { name: /Keep exact amount/ }).click()
  } else {
    await page.getByRole('button', { name: /Increase to change-free max/ }).click()
  }
}

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

  await expect(page.getByText('Transaction added to mempool').first()).toBeVisible({
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

/** Lab Send: fill recipient + amount in sats (does not click Review). */
export async function goToLabSendCompose(
  page: Page,
  toAddress: string,
  amountSats: number,
): Promise<void> {
  await goToWalletTab(page, 'Send')
  await expect(page.getByText('Send Bitcoin')).toBeVisible()

  await page.getByLabel('Recipient Address').fill(toAddress)
  const switchToSatsBtn = page.getByRole('button', { name: 'Switch to sats' })
  if (await switchToSatsBtn.isVisible().catch(() => false)) {
    await switchToSatsBtn.click()
  }
  const amountInput = page.getByLabel(/Amount/)
  await amountInput.fill(String(amountSats))
  await expect(amountInput).toHaveValue(String(amountSats))
}

/** Clicks Review Transaction (must be enabled). */
export async function clickLabReviewTransaction(page: Page): Promise<void> {
  await expect(
    page.getByRole('button', { name: 'Review Transaction' }),
  ).toBeEnabled({ timeout: 30000 })
  await page.getByRole('button', { name: 'Review Transaction' }).click()
}

/** Case-1 (sub–dust-floor): toast + amount shown as 546 sats (compose or Transaction Details). */
export async function expectLabCase1MinDustClampUi(page: Page): Promise<void> {
  await expect(
    page.getByText(/minimum output size \(546 sats\)/i).first(),
  ).toBeVisible({ timeout: 30000 })
  await expect
    .poll(
      async () => {
        if (await page.getByText('Transaction Details').first().isVisible().catch(() => false)) {
          const mainText = (await page.getByRole('main').textContent()) ?? ''
          return /\b546\s*sats\b/i.test(mainText)
        }
        const input = page.locator('#send-amount')
        if (await input.isVisible().catch(() => false)) {
          return (await input.inputValue()) === '546'
        }
        return false
      },
      { timeout: 60000 },
    )
    .toBe(true)
}

/**
 * After Review with a sub-dust amount, the UI may continue with Change-and-fees (case 2)
 * or skip to Transaction Details. Cancel the modal or press Back so the compose step stays usable.
 */
export async function dismissLabDustModalOrBackFromReview(page: Page): Promise<void> {
  const changeFeesHeading = page.getByRole('heading', { name: 'Change and fees' })
  const transactionDetails = page.getByText('Transaction Details')

  const which = await Promise.race([
    changeFeesHeading.waitFor({ state: 'visible', timeout: 90000 }).then(() => 'modal' as const),
    transactionDetails.waitFor({ state: 'visible', timeout: 90000 }).then(() => 'details' as const),
  ])

  if (which === 'modal') {
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(changeFeesHeading).not.toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Send Bitcoin')).toBeVisible({ timeout: 15000 })
    return
  }

  await expect(transactionDetails).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByText('Send Bitcoin')).toBeVisible({ timeout: 15000 })
}

export async function expectLabChangeAndFeesModal(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Change and fees' })).toBeVisible({
    timeout: 90000,
  })
}

export type LabDustChoice = 'keepExact' | 'increaseToChangeFreeMax'

export async function clickLabDustChoice(
  page: Page,
  choice: LabDustChoice,
): Promise<void> {
  await expectLabChangeAndFeesModal(page)
  if (choice === 'keepExact') {
    await page.getByRole('button', { name: /Keep exact amount/ }).click()
  } else {
    await page.getByRole('button', { name: /Increase to change-free max/ }).click()
    // Bump must apply changeFreeMaxSats to the store before Confirm;
    // otherwise the lab send uses the pre-bump amount and the bump build can fail (insufficient funds).
    await expect(page.getByRole('main')).not.toContainText('(800 sats)', { timeout: 20000 })
    await expect(page.getByText('Transaction Details').first()).toBeVisible({ timeout: 15000 })
  }
}

/**
 * Lab step-2 review: confirm send and wait until the new tx appears in the lab mempool.
 * Do not rely on the success toast alone — an earlier “Transaction added to mempool” from
 * funding (createTransactionInLab) can remain visible and would mask a failed lab send.
 * Avoid reading lab state before click: getLabState navigates away from Review.
 *
 * Wait for “Adding to mempool” before the first getLabState poll: all lab work is serialized
 * through runLabOp; polling mempool too early can enqueue `labOpLoadChainFromDatabase`
 * ahead of the send pipeline and block confirmation for the full poll timeout.
 */
export async function confirmLabSendAndWaitForMempool(page: Page): Promise<void> {
  await expect(page.getByText('Transaction Details')).toBeVisible({ timeout: 90000 })
  await page.getByRole('button', { name: 'Confirm and Send' }).click()

  const loading = page.getByText(/Adding to mempool/i).first()
  await loading.waitFor({ state: 'visible', timeout: 60000 })
  await loading.waitFor({ state: 'hidden', timeout: 120000 }).catch(() => undefined)

  const failedAfterSend = page.getByText(/Lab send failed/i).last()
  if (await failedAfterSend.isVisible().catch(() => false)) {
    throw new Error((await failedAfterSend.textContent()) ?? 'Lab send failed')
  }

  await expect
    .poll(
      async () => (await getLabState(page)).mempool.length,
      { timeout: 60000 },
    )
    .toBeGreaterThan(0)
}

/** Wallet owner key (`wallet:id`) for [getUtxoSumByOwner](getUtxoSumByOwner). */
export function getWalletOwnerKey(state: LabState): string {
  const walletOwnerObj = Object.values(state.addressToOwner ?? {}).find(
    (o): o is { kind: 'wallet'; walletId: number } =>
      typeof o === 'object' && o !== null && 'kind' in o && o.kind === 'wallet',
  )
  if (walletOwnerObj == null) {
    throw new Error('No wallet owner in lab state')
  }
  return `${WALLET_OWNER_PREFIX}${walletOwnerObj.walletId}`
}

/** Get lab state via test hook. Navigates to lab first if needed (no `page.goto`: avoids interrupting in-flight mine UI). */
export async function getLabState(page: Page): Promise<LabState> {
  await navigateToLab(page)
  await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({ timeout: 20000 })
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

/** Resolve an address for a display owner (UTXOs, then known addresses, then any `addressToOwner` key). */
export function findAddressForOwner(state: LabState, owner: string): string | undefined {
  const map = state.addressToOwner ?? {}
  const fromUtxo = state.utxos?.find((u) =>
    labOwnerMatchesDisplayKey(state, lookupLabAddressOwner(u.address, map), owner),
  )?.address
  if (fromUtxo) return fromUtxo
  const fromAddresses = state.addresses?.find((a) =>
    labOwnerMatchesDisplayKey(state, lookupLabAddressOwner(a.address, map), owner),
  )?.address
  if (fromAddresses) return fromAddresses
  for (const addr of Object.keys(map)) {
    if (labOwnerMatchesDisplayKey(state, lookupLabAddressOwner(addr, map), owner)) {
      return addr
    }
  }
  return undefined
}
