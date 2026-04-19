import { type Locator, type Page, expect } from '@playwright/test'
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

  await page
    .getByRole('button', { name: 'Lab', exact: true })
    .click()
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

  await page.getByRole('navigation', { name: 'Lab', exact: true }).getByRole('link', { name: 'Control' }).click()
  await expect(page.getByRole('heading', { name: 'Control' })).toBeVisible({
    timeout: 15000,
  })

  await page.getByRole('button', { name: 'Reset lab' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Reset lab' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()

  await page.getByRole('navigation', { name: 'Lab', exact: true }).getByRole('link', { name: 'Blocks' }).click()
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

  await page.getByRole('navigation', { name: 'Lab', exact: true }).getByRole('link', { name: 'Control' }).click()
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
  await page.getByRole('navigation', { name: 'Lab', exact: true }).getByRole('link', { name: 'Blocks' }).click()
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
  await page.getByRole('navigation', { name: 'Lab', exact: true }).getByRole('link', { name: 'Transactions' }).click()
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible({
    timeout: 15000,
  })
}

/** Poll until `__labGetState` reports the expected mempool size (toast can win the race). */
export async function waitForLabMempoolLength(page: Page, expectedLength: number): Promise<void> {
  await expect
    .poll(
      async () => (await getLabState(page)).mempool.length,
      {
        timeout: 60_000,
        intervals: [50, 100, 200, 400],
        message: `Expected lab mempool.length === ${expectedLength}`,
      },
    )
    .toBe(expectedLength)
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

/** Parse the amount cell in a lab tx output row (`/lab/tx/$txid` Outputs card). */
async function parseLabTxOutputRowSats(row: Locator): Promise<number> {
  // `BitcoinAmountDisplay` uses `.tabular-nums` on both the numeric span and the unit control; use the first (amount).
  const amountText = await row.locator('.tabular-nums').first().textContent()
  if (amountText == null) {
    throw new Error('missing amount in lab tx output row')
  }
  const digits = amountText.replace(/\D/g, '')
  return parseInt(digits, 10)
}

/** Bitcoin txids are hex; URLs and router params may differ in case — match worker lookups. */
function normalizeLabTxid(txid: string): string {
  return txid.trim().toLowerCase()
}

/**
 * Poll DEV `window.__labGetTransaction` until the worker returns the tx (same path as the page).
 * Avoid relying on the "Transaction" heading alone — hooks and data can lag a frame or two.
 */
async function waitForLabTxViewerLoaded(page: Page, txid: string): Promise<void> {
  const normalTxId = normalizeLabTxid(txid)
  await expect
    .poll(
      async () => {
        return await page.evaluate(async (id) => {
          const w = (window as unknown as {
            __labGetTransaction?: (tid: string) => Promise<unknown | null>
          }).__labGetTransaction
          if (!w) {
            return 'no-hook' as const
          }
          const d = await w(id)
          return d != null ? ('ready' as const) : ('not-found' as const)
        }, normalTxId)
      },
      {
        timeout: 60000,
        intervals: [250],
        message: `lab tx viewer: getTransaction(${normalTxId.slice(0, 8)}…) did not become readable (DEV hook + worker)`,
      },
    )
    .toBe('ready')

  await expect(page.getByRole('heading', { name: 'Transaction' })).toBeVisible({
    timeout: 30000,
  })
}

/**
 * Open `/lab/tx/$txid` and wait until the transaction viewer has loaded.
 * Uses DEV `window.__e2eNavigateToLabTx` (client-side navigation) so we do not full-reload
 * the app immediately after a mempool write — `page.goto` can reload before OPFS-backed lab
 * SQLite has flushed, and `__labGetState` would then miss the tx indefinitely.
 */
export async function openLabMempoolTxInViewer(page: Page, txid: string): Promise<void> {
  const normalTxId = normalizeLabTxid(txid)
  await page.evaluate(async (id) => {
    const nav = (window as unknown as {
      __e2eNavigateToLabTx?: (t: string) => Promise<void>
    }).__e2eNavigateToLabTx
    if (!nav) {
      throw new Error(
        '__e2eNavigateToLabTx not available (DEV only — Playwright E2E must run against Vite dev)',
      )
    }
    await nav(id)
  }, normalTxId)
  await waitForLabTxViewerLoaded(page, normalTxId)
}

/** Open `/lab/tx/$txid` for the last mempool entry (most recently added). */
export async function openLatestLabMempoolTxInViewer(page: Page): Promise<string> {
  const state = await getLabState(page)
  expect(state.mempool.length).toBeGreaterThan(0)
  const txid = state.mempool[state.mempool.length - 1]!.txid
  await openLabMempoolTxInViewer(page, txid)
  return txid
}

/** Read all output amounts in vout order from the lab transaction viewer. */
export async function readLabTxOutputAmountsSatsFromViewer(page: Page): Promise<number[]> {
  const out: number[] = []
  for (let i = 0; i < 32; i++) {
    const row = page.getByTestId(`lab-tx-vout-${i}`)
    if ((await row.count()) === 0) {
      break
    }
    out.push(await parseLabTxOutputRowSats(row))
  }
  return out
}

/**
 * Assert each output row matches `expectedSats[i]` (same order as the tx viewer).
 * Parses digits from the numeric span in `BitcoinAmountDisplay` (not the unit control).
 */
export async function expectLabTxOutputAmountsSats(
  page: Page,
  expectedSats: number[],
): Promise<void> {
  for (let i = 0; i < expectedSats.length; i++) {
    const row = page.getByTestId(`lab-tx-vout-${i}`)
    await expect(row).toBeVisible()
    const n = await parseLabTxOutputRowSats(row)
    expect(n).toBe(expectedSats[i])
  }
}

/**
 * After a tx lands in the mempool, open its viewer and assert UI outputs match
 * the lab worker's `getTransaction` (same source as `/lab/tx/$txid`; mempool txs are
 * not in `LabState.txDetails`). Requires `window.__labGetTransaction` (DEV lab route).
 *
 * Reads expected outputs **after** navigation: a full reload must see the same SQLite
 * state; polling in {@link waitForLabTxViewerLoaded} avoids racing Vite/dev hooks.
 */
export async function expectLatestMempoolTxOutputsMatchLabStateAndViewer(
  page: Page,
): Promise<void> {
  const state = await getLabState(page)
  expect(state.mempool.length).toBeGreaterThan(0)
  const txid = state.mempool[state.mempool.length - 1]!.txid
  const normalTxId = normalizeLabTxid(txid)

  await openLabMempoolTxInViewer(page, normalTxId)

  const expectedSats = await page.evaluate(async (id) => {
    const win = window as unknown as {
      __labGetTransaction?: (tid: string) => Promise<{
        outputs: { amountSats: number }[]
      } | null>
    }
    if (!win.__labGetTransaction) {
      throw new Error(
        '__labGetTransaction is not available (open /lab in a DEV build for E2E)',
      )
    }
    const fetchedTx = await win.__labGetTransaction(id)
    if (fetchedTx == null) {
      throw new Error(`getTransaction returned null for ${id}`)
    }
    return fetchedTx.outputs.map((o) => o.amountSats)
  }, normalTxId)

  await expectLabTxOutputAmountsSats(page, expectedSats)
}

/** Chains {@link expectManualLabEntityTransactionInMempool} and output inspection. */
export async function expectManualLabEntityTransactionInMempoolAndInspectOutputs(
  page: Page,
): Promise<void> {
  await expectManualLabEntityTransactionInMempool(page)
  await expectLatestMempoolTxOutputsMatchLabStateAndViewer(page)
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

  await page.getByRole('navigation', { name: 'Lab', exact: true }).getByRole('link', { name: 'Transactions' }).click()
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

  await page.getByRole('navigation', { name: 'Lab', exact: true }).getByRole('link', { name: 'Transactions' }).click()
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
  await page.getByLabel('Unit for amount entry').selectOption('sat')
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
  const unitSelect = page.getByLabel('Unit for amount entry')
  if (await unitSelect.isVisible().catch(() => false)) {
    await unitSelect.selectOption('sat')
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

/**
 * 546 sats is surfaced as a literal "546" in sat mode, but `BitcoinAmountDisplay` may use the
 * wallet default unit (often BTC), producing `0.00000546` where `\b546\b` does not match.
 */
function textReflects546DustClamp(text: string): boolean {
  if (/\b546\b/.test(text)) return true
  if (text.includes('0.00000546')) return true
  return false
}

/**
 * Case-1 (sub–dust-floor): toast or review banner, then compose / Transaction Details / case-2 modal
 * shows the clamped amount (any display unit).
 */
export async function expectLabCase1MinDustClampUi(page: Page): Promise<void> {
  await expect(
    page.getByText(/Amount was below the minimum/i).filter({ hasText: /546/ }).first(),
  ).toBeVisible({ timeout: 30000 })

  await expect
    .poll(
      async () => {
        const bodyText = (await page.locator('body').textContent()) ?? ''
        if (!textReflects546DustClamp(bodyText)) return false

        const transactionDetails = await page
          .getByText('Transaction Details')
          .first()
          .isVisible()
          .catch(() => false)
        if (transactionDetails) {
          return textReflects546DustClamp((await page.getByRole('main').textContent()) ?? '')
        }

        const changeFeesHeading = page.getByRole('heading', { name: 'Change and fees' })
        if (await changeFeesHeading.isVisible().catch(() => false)) {
          const dialog = page
            .getByRole('dialog')
            .filter({ has: changeFeesHeading })
            .first()
          const dialogText = (await dialog.textContent().catch(() => null)) ?? ''
          return textReflects546DustClamp(dialogText)
        }

        const input = page.locator('#send-amount')
        if (await input.isVisible().catch(() => false)) {
          return (await input.inputValue()) === '546'
        }

        return false
      },
      {
        timeout: 60_000,
        intervals: [100, 250, 400],
        message:
          'Expected 546 dust clamp in Transaction Details, Change-and-fees dialog, or compose (#send-amount)',
      },
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
