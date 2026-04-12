import { test, expect } from '@playwright/test'
import { LabOwnerType } from '@/lib/lab-owner-type'
import { importWalletViaUI, TEST_MNEMONIC, TEST_PASSWORD } from './helpers/wallet-setup'
import {
  switchToLab,
  resetLab,
  mineBlocksInLab,
  labEntityAddressTypeForCreationIndex,
  createTransactionInLab,
  createRandomTransactionsInLab,
  sendFromWallet,
  getLabState,
  getUtxoSumByOwner,
  findAddressForOwner,
} from './helpers/lab'
import { goToWalletTab } from './helpers/wallet-nav'
import { isCoinbase } from '@/lib/lab-operations'
import { WALLET_OWNER_PREFIX } from '@/lib/lab-utils'

const COINBASE_SATS = 5_000_000_000 // 50 BTC (default lab miner subsidy)

const isCi = !!process.env.CI

test.describe('Lab', { tag: '@lab' }, () => {
  /** Lab runs heavy WASM mining; serial avoids CPU/RAM contention on small CI runners. */
  if (isCi) {
    test.describe.configure({ mode: 'serial' })
  }

  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000)
    await importWalletViaUI(page, TEST_MNEMONIC, TEST_PASSWORD)
    await switchToLab(page)
    await resetLab(page)
  })

  test('mine to name', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })

    const state = await getLabState(page)
    expect(state.blocks).toHaveLength(1)
    const aliceSum = getUtxoSumByOwner(state, 'Alice')
    expect(aliceSum).toBe(COINBASE_SATS)
    expect(state.entities).toHaveLength(1)
    expect(state.entities![0].entityName).toBe('Alice')
  })

  test('mine to wallet', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.Wallet)

    const state = await getLabState(page)
    expect(state.blocks).toHaveLength(1)
    const walletOwnerObj = Object.values(state.addressToOwner ?? {}).find(
      (o): o is { kind: 'wallet'; walletId: number } =>
        typeof o === 'object' && o !== null && 'kind' in o && o.kind === 'wallet',
    )
    expect(walletOwnerObj).toBeDefined()
    const walletKey = `${WALLET_OWNER_PREFIX}${walletOwnerObj!.walletId}`
    const walletSum = getUtxoSumByOwner(state, walletKey)
    expect(walletSum).toBe(COINBASE_SATS)
  })

  test('random mine creates anonymous lab entity', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { randomAnonymous: true })

    const state = await getLabState(page)
    expect(state.blocks).toHaveLength(1)
    expect(state.entities).toHaveLength(1)
    const entity = state.entities![0]
    const displayName = entity.entityName ?? `Anonymous-${entity.labEntityId}`
    expect(displayName).toMatch(/^Anonymous-\d+$/)
    expect(getUtxoSumByOwner(state, displayName)).toBe(COINBASE_SATS)
  })

  test('creating lab transaction does not increase merged address count while unconfirmed', async ({
    page,
  }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Bob' })

    const stateBefore = await getLabState(page)
    const aliceAddress = findAddressForOwner(stateBefore, 'Alice')
    const bobAddress = findAddressForOwner(stateBefore, 'Bob')
    expect(aliceAddress).toBeDefined()
    expect(bobAddress).toBeDefined()
    const addressCountBefore = stateBefore.addresses.length

    await createTransactionInLab(page, aliceAddress!, bobAddress!, 10_000, 1)

    const stateAfterMempool = await getLabState(page)
    expect(stateAfterMempool.mempool).toHaveLength(1)
    expect(stateAfterMempool.addresses.length).toBe(addressCountBefore)
  })

  test('transactions page explains random generation requires entities', async ({ page }) => {
    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.getByRole('link', { name: 'Manage lab' }).click()
    await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({
      timeout: 15000,
    })
    await page.getByRole('navigation', { name: 'Lab' }).getByRole('link', { name: 'Transactions' }).click()
    await expect(page.getByText('Mining a block to a name enables random transactions.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Make random transaction' })).toBeDisabled()
  })

  test('creates random transactions between lab entities', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, {
      ownerName: 'Alice',
      labAddressType: labEntityAddressTypeForCreationIndex(1),
    })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, {
      ownerName: 'Bob',
      labAddressType: labEntityAddressTypeForCreationIndex(2),
    })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, {
      ownerName: 'Carol',
      labAddressType: labEntityAddressTypeForCreationIndex(3),
    })

    const randomTxCount = 16
    await createRandomTransactionsInLab(page, randomTxCount)

    const state = await getLabState(page)
    expect(state.mempool).toHaveLength(randomTxCount)
    const senderEntityIds = new Set(
      state.mempool.map((entry) =>
        entry.sender?.kind === 'lab_entity' ? entry.sender.labEntityId : null,
      ),
    )
    expect(senderEntityIds).toEqual(new Set([1, 2, 3]))

    expect(state.entities.find((e) => e.labEntityId === 1)?.addressType).toBe('segwit')
    expect(state.entities.find((e) => e.labEntityId === 2)?.addressType).toBe('taproot')
    expect(state.entities.find((e) => e.labEntityId === 3)?.addressType).toBe('segwit')
  })

  test('lab entity SegWit and Taproot interop transfers', async ({ page }) => {
    const segwitA = 'SegWit A'
    const segwitB = 'SegWit B'
    const taprootA = 'Taproot A'
    const taprootB = 'Taproot B'

    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: segwitA, labAddressType: 'segwit' })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: segwitB, labAddressType: 'segwit' })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: taprootA, labAddressType: 'taproot' })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: taprootB, labAddressType: 'taproot' })

    let state = await getLabState(page)
    expect(state.entities).toHaveLength(4)
    expect(state.entities!.find((e) => e.labEntityId === 1)?.addressType).toBe('segwit')
    expect(state.entities!.find((e) => e.labEntityId === 2)?.addressType).toBe('segwit')
    expect(state.entities!.find((e) => e.labEntityId === 3)?.addressType).toBe('taproot')
    expect(state.entities!.find((e) => e.labEntityId === 4)?.addressType).toBe('taproot')

    const addressForOwner = async (owner: string) => {
      const s = await getLabState(page)
      const a = findAddressForOwner(s, owner)
      expect(a).toBeDefined()
      return a!
    }

    await createTransactionInLab(page, await addressForOwner(segwitA), await addressForOwner(segwitB), 11_000, 1)
    expect((await getLabState(page)).mempool).toHaveLength(1)
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: segwitA, labAddressType: 'segwit' })
    expect((await getLabState(page)).mempool).toHaveLength(0)

    await createTransactionInLab(page, await addressForOwner(segwitA), await addressForOwner(taprootA), 13_000, 1)
    expect((await getLabState(page)).mempool).toHaveLength(1)
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: segwitA, labAddressType: 'segwit' })
    expect((await getLabState(page)).mempool).toHaveLength(0)

    await createTransactionInLab(page, await addressForOwner(taprootA), await addressForOwner(segwitA), 9_000, 1)
    expect((await getLabState(page)).mempool).toHaveLength(1)
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: taprootA, labAddressType: 'taproot' })
    expect((await getLabState(page)).mempool).toHaveLength(0)

    await createTransactionInLab(page, await addressForOwner(taprootA), await addressForOwner(taprootB), 14_000, 1)
    expect((await getLabState(page)).mempool).toHaveLength(1)
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: taprootA, labAddressType: 'taproot' })
    state = await getLabState(page)
    expect(state.mempool).toHaveLength(0)
    expect(
      state.transactions.filter((t) => {
        const d = state.txDetails.find((x) => x.txid === t.txid)
        return d != null && !isCoinbase(d)
      }),
    ).toHaveLength(4)
  })

  test('transfer name to name in lab', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Bob' })

    const stateBefore = await getLabState(page)
    const aliceAddress = findAddressForOwner(stateBefore, 'Alice')
    const bobAddress = findAddressForOwner(stateBefore, 'Bob')
    expect(aliceAddress).toBeDefined()
    expect(bobAddress).toBeDefined()

    await createTransactionInLab(page, aliceAddress!, bobAddress!, 10_000, 1)

    let state = await getLabState(page)
    expect(state.mempool).toHaveLength(1)

    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })

    state = await getLabState(page)
    expect(state.mempool).toHaveLength(0)
    const aliceSum = getUtxoSumByOwner(state, 'Alice')
    const bobSum = getUtxoSumByOwner(state, 'Bob')
    expect(bobSum).toBe(COINBASE_SATS + 10_000)
    expect(aliceSum).toBeGreaterThan(0)
  })

  test('self transfer marks only one change output', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })

    const stateBefore = await getLabState(page)
    const aliceAddress = findAddressForOwner(stateBefore, 'Alice')
    expect(aliceAddress).toBeDefined()

    await createTransactionInLab(page, aliceAddress!, aliceAddress!, 10_000, 1)
    const stateWithMempoolTx = await getLabState(page)
    const selfTransferTxid = stateWithMempoolTx.mempool[0]?.txid
    expect(selfTransferTxid).toBeDefined()
    const selfTransferMempoolEntry = stateWithMempoolTx.mempool.find(
      (entry) => entry.txid === selfTransferTxid,
    )
    expect(selfTransferMempoolEntry?.receiver).toEqual({ kind: 'lab_entity', labEntityId: 1 })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })

    const stateAfter = await getLabState(page)
    const minedSpendRecord = stateAfter.transactions.find(
      (tx) => tx.txid === selfTransferTxid,
    )
    expect(minedSpendRecord).toBeDefined()
    const minedSpendDetails = stateAfter.txDetails.find(
      (detail) => detail.txid === minedSpendRecord!.txid,
    )
    expect(minedSpendDetails).toBeDefined()
    const changeOutputCount = minedSpendDetails!.outputs.filter((output) => output.isChange).length
    expect(changeOutputCount).toBe(1)
    expect(minedSpendDetails!.outputs.some((output) => !output.isChange)).toBe(true)
    expect(minedSpendRecord?.receiver).toEqual({ kind: 'lab_entity', labEntityId: 1 })
  })

  test('conflicting transactions - higher fee rate wins', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Bob' })

    const stateBefore = await getLabState(page)
    const aliceAddress = findAddressForOwner(stateBefore, 'Alice')
    const bobAddress = findAddressForOwner(stateBefore, 'Bob')
    expect(aliceAddress).toBeDefined()
    expect(bobAddress).toBeDefined()

    await createTransactionInLab(page, aliceAddress!, bobAddress!, 1000, 1)

    // Wait for first tx to be in mempool before creating the conflicting second tx
    let state = await getLabState(page)
    expect(state.mempool).toHaveLength(1)

    await createTransactionInLab(page, aliceAddress!, bobAddress!, 800, 10)

    // Poll for both conflicting txs to appear (state propagation can be async)
    await expect
      .poll(
        async () => {
          const s = await getLabState(page)
          return s.mempool.length
        },
        { timeout: 10000 },
      )
      .toBe(2)

    state = await getLabState(page)
    expect(state.mempool).toHaveLength(2)

    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })

    state = await getLabState(page)
    expect(state.mempool).toHaveLength(0)
    expect(
      state.transactions.filter((t) => {
        const d = state.txDetails.find((x) => x.txid === t.txid)
        return d != null && !isCoinbase(d)
      }),
    ).toHaveLength(1)
    const aliceSum = getUtxoSumByOwner(state, 'Alice')
    const bobSum = getUtxoSumByOwner(state, 'Bob')
    expect(bobSum).toBe(COINBASE_SATS + 800)
    expect(aliceSum).toBeGreaterThan(0)
  })

  test('transfer name to wallet address in lab', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })

    const stateAfterMine = await getLabState(page)
    const aliceAddress = findAddressForOwner(stateAfterMine, 'Alice')
    expect(aliceAddress).toBeDefined()

    await goToWalletTab(page, 'Receive')
    await expect(page.getByRole('heading', { name: 'Receive Bitcoin' })).toBeVisible({
      timeout: 15000,
    })
    const addressEl = page.getByRole('main').locator('.font-mono').first()
    await expect(addressEl).toBeVisible({ timeout: 10000 })
    const walletAddress = (await addressEl.textContent())?.trim()
    expect(walletAddress).toMatch(/^bcrt1/)

    await createTransactionInLab(page, aliceAddress!, walletAddress!, 20_000, 1)

    let state = await getLabState(page)
    expect(state.mempool).toHaveLength(1)

    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })

    state = await getLabState(page)
    expect(state.mempool).toHaveLength(0)
    const walletOwnerObj = Object.values(state.addressToOwner ?? {}).find(
      (o): o is { kind: 'wallet'; walletId: number } =>
        typeof o === 'object' && o !== null && 'kind' in o && o.kind === 'wallet',
    )
    expect(walletOwnerObj).toBeDefined()
    const walletKey = `${WALLET_OWNER_PREFIX}${walletOwnerObj!.walletId}`
    const walletSum = getUtxoSumByOwner(state, walletKey)
    expect(walletSum).toBe(20_000)
  })

  test('transfer wallet to name in wallet', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.Wallet)
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })

    const stateBefore = await getLabState(page)
    const aliceAddress = findAddressForOwner(stateBefore, 'Alice')
    expect(aliceAddress).toBeDefined()

    await sendFromWallet(page, aliceAddress!, 15_000, 1)

    let state = await getLabState(page)
    expect(state.mempool).toHaveLength(1)

    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })

    state = await getLabState(page)
    expect(state.mempool).toHaveLength(0)
    const aliceSum = getUtxoSumByOwner(state, 'Alice')
    // Alice mined once for initial funding and again to confirm the transfer (two coinbases).
    expect(aliceSum).toBeGreaterThanOrEqual(2 * COINBASE_SATS + 14_000)
    expect(aliceSum).toBeLessThanOrEqual(2 * COINBASE_SATS + 20_000)
  })

  test('transfer wallet to wallet', async ({ page }) => {
    await mineBlocksInLab(page, 2, LabOwnerType.Wallet)

    await goToWalletTab(page, 'Receive')
    await expect(page.getByRole('heading', { name: 'Receive Bitcoin' })).toBeVisible({
      timeout: 15000,
    })
    const addressEl = page.getByRole('main').locator('.font-mono').first()
    await expect(addressEl).toBeVisible({ timeout: 10000 })
    const firstAddress = (await addressEl.textContent())?.trim()
    await page.getByRole('button', { name: 'Generate New Address' }).click()
    await expect(page.getByText('New address generated')).toBeVisible({ timeout: 5000 })
    const secondAddressEl = page.getByRole('main').locator('.font-mono').first()
    const secondAddress = (await secondAddressEl.textContent())?.trim()
    expect(firstAddress).not.toBe(secondAddress)

    await sendFromWallet(page, secondAddress!, 25_000, 1)

    let state = await getLabState(page)
    expect(state.mempool).toHaveLength(1)

    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })

    state = await getLabState(page)
    expect(state.mempool).toHaveLength(0)
    const walletOwnerEntry = Object.values(state.addressToOwner ?? {}).find(
      (o): o is { kind: 'wallet'; walletId: number } =>
        typeof o === 'object' && o !== null && 'kind' in o && o.kind === 'wallet',
    )
    expect(walletOwnerEntry).toBeDefined()
    const walletSum = getUtxoSumByOwner(
      state,
      `${WALLET_OWNER_PREFIX}${walletOwnerEntry!.walletId}`,
    )
    expect(walletSum).toBeGreaterThanOrEqual(2 * COINBASE_SATS - 500)
    expect(walletSum).toBeLessThanOrEqual(2 * COINBASE_SATS)
  })

  test('tx viewer links input outpoint to parent tx and highlights vout', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Bob' })

    const beforeSpend = await getLabState(page)
    const aliceAddress = findAddressForOwner(beforeSpend, 'Alice')
    const bobAddress = findAddressForOwner(beforeSpend, 'Bob')
    expect(aliceAddress).toBeDefined()
    expect(bobAddress).toBeDefined()

    await createTransactionInLab(page, aliceAddress!, bobAddress!, 10_000, 1)
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })

    const state = await getLabState(page)
    const spendDetail = state.txDetails?.find(
      (d) =>
        !isCoinbase(d) &&
        d.inputs.some(
          (i) =>
            i.prevTxid != null &&
            i.prevTxid !== '' &&
            i.prevVout != null &&
            i.prevVout !== undefined,
        ),
    )
    expect(spendDetail).toBeDefined()
    const inputWithPrev = spendDetail!.inputs.find(
      (i) =>
        i.prevTxid != null &&
        i.prevTxid !== '' &&
        i.prevVout != null &&
        i.prevVout !== undefined,
    )
    expect(inputWithPrev).toBeDefined()
    const parentTxid = inputWithPrev!.prevTxid!
    const vout = inputWithPrev!.prevVout!

    await page.goto(`/lab/tx/${spendDetail!.txid}`)
    await expect(page.getByRole('heading', { name: 'Transaction' })).toBeVisible({ timeout: 15000 })

    await page.getByRole('link', { name: new RegExp(`:\\s*${vout}`) }).first().click()

    await expect(page).toHaveURL(new RegExp(`/lab/tx/${parentTxid}`))
    await expect(page.url()).toMatch(/highlightVout/)

    const highlighted = page.getByTestId(`lab-tx-vout-${vout}`)
    await expect(highlighted).toBeVisible({ timeout: 10000 })
    await expect(highlighted).toHaveClass(/ring-2/)
  })

  test('block details routes and mempool card behavior', async ({ page }) => {
    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.getByRole('link', { name: 'Manage lab' }).click()
    await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({
      timeout: 15000,
    })

    await expect(page.getByText('Mempool', { exact: true })).toBeVisible()
    await expect(page.getByText('No confirmed transactions yet.')).toHaveCount(0)

    await page.getByRole('link', { name: 'current' }).click()
    await expect(page.getByRole('heading', { name: 'Current block template' })).toBeVisible()
    await expect(page.getByRole('main').getByText('Block Header', { exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByText('Contextual data', { exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByText('Transactions', { exact: true })).toBeVisible()

    await page.getByRole('navigation', { name: 'Lab' }).getByRole('link', { name: 'Blocks' }).click()
    await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible()

    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })

    await page.getByRole('link', { name: '0' }).click()
    await expect(page.getByRole('heading', { name: 'Block 0' })).toBeVisible()
    await expect(page.getByRole('main').getByText('Block Header', { exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByText('Contextual data', { exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByText('Transactions', { exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByText(/Mined by:.*Alice/)).toBeVisible()
    await expect(page.getByRole('main').getByText('Coinbase', { exact: true })).toBeVisible()
    const nonceValue = page
      .getByRole('main')
      .locator('p', { hasText: /^Nonce$/ })
      .locator('xpath=following-sibling::p[1]')
    await expect(nonceValue).toContainText(/^\d+$/)
    const targetValue = page
      .getByRole('main')
      .locator('p', { hasText: /^Target$/ })
      .locator('xpath=following-sibling::p[1]')
    await expect(targetValue).toContainText(/bits=2000ffff/i)
    const headerHashValue = page
      .getByRole('main')
      .locator('p', { hasText: /^Block header hash$/ })
      .locator('xpath=following-sibling::p[1]')
    await expect(headerHashValue).toContainText(/^00[0-9a-f]{62}$/i)
  })
})
