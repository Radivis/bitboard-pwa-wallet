import { test, expect } from '@playwright/test'
import { importWalletViaUI, TEST_MNEMONIC, TEST_PASSWORD } from './helpers/wallet-setup'
import {
  switchToLabAndSegwit,
  resetLab,
  mineBlocksInLab,
  createTransactionInLab,
  sendFromWallet,
  getLabState,
  getUtxoSumByOwner,
} from './helpers/lab'
import { WALLET_OWNER_PREFIX } from '@/lib/lab-utils'

const COINBASE_SATS = 5_000_000_000 // 50 BTC (LAB_COINBASE_SUBSIDY in crypto)

test.describe('Lab', { tag: '@lab' }, () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000)
    await importWalletViaUI(page, TEST_MNEMONIC, TEST_PASSWORD)
    await switchToLabAndSegwit(page)
    await resetLab(page)
  })

  test('mine to name', async ({ page }) => {
    await mineBlocksInLab(page, 1, 'name', { ownerName: 'Alice' })

    const state = await getLabState(page)
    expect(state.blocks).toHaveLength(1)
    const aliceSum = getUtxoSumByOwner(state, 'Alice')
    expect(aliceSum).toBe(COINBASE_SATS)
  })

  test('mine to wallet', async ({ page }) => {
    await mineBlocksInLab(page, 1, 'wallet')

    const state = await getLabState(page)
    expect(state.blocks).toHaveLength(1)
    const walletOwner = Object.values(state.addressToOwner ?? {}).find((o) =>
      o.startsWith(WALLET_OWNER_PREFIX),
    )
    expect(walletOwner).toBeDefined()
    const walletSum = getUtxoSumByOwner(state, walletOwner!)
    expect(walletSum).toBe(COINBASE_SATS)
  })

  test('transfer name to name in lab', async ({ page }) => {
    await mineBlocksInLab(page, 1, 'name', { ownerName: 'Alice' })
    await mineBlocksInLab(page, 1, 'name', { ownerName: 'Bob' })

    const stateBefore = await getLabState(page)
    const addressToOwner = stateBefore.addressToOwner ?? {}
    const aliceAddress =
      stateBefore.addresses.find((a) => addressToOwner[a.address] === 'Alice')?.address ??
      stateBefore.utxos.find((u) => addressToOwner[u.address] === 'Alice')?.address
    const bobAddress =
      stateBefore.addresses.find((a) => addressToOwner[a.address] === 'Bob')?.address ??
      stateBefore.utxos.find((u) => addressToOwner[u.address] === 'Bob')?.address
    expect(aliceAddress).toBeDefined()
    expect(bobAddress).toBeDefined()

    await createTransactionInLab(page, aliceAddress!, bobAddress!, 10_000, 1)

    let state = await getLabState(page)
    expect(state.mempool).toHaveLength(1)

    await mineBlocksInLab(page, 1, 'name', { ownerName: 'Alice' })

    state = await getLabState(page)
    expect(state.mempool).toHaveLength(0)
    const aliceSum = getUtxoSumByOwner(state, 'Alice')
    const bobSum = getUtxoSumByOwner(state, 'Bob')
    expect(bobSum).toBe(COINBASE_SATS + 10_000)
    expect(aliceSum).toBeGreaterThan(0)
  })

  test('conflicting transactions - higher fee wins', async ({ page }) => {
    await mineBlocksInLab(page, 1, 'name', { ownerName: 'Alice' })
    await mineBlocksInLab(page, 1, 'name', { ownerName: 'Bob' })

    const stateBefore = await getLabState(page)
    const addressToOwner = stateBefore.addressToOwner ?? {}
    const aliceAddress = stateBefore.addresses.find((a) => addressToOwner[a.address] === 'Alice')
      ?.address
    const bobAddress = stateBefore.addresses.find((a) => addressToOwner[a.address] === 'Bob')
      ?.address
    expect(aliceAddress).toBeDefined()
    expect(bobAddress).toBeDefined()

    await createTransactionInLab(page, aliceAddress!, bobAddress!, 1000, 1)

    // Wait for first tx to be in mempool before creating the conflicting second tx
    let state = await getLabState(page)
    expect(state.mempool).toHaveLength(1)

    await createTransactionInLab(page, aliceAddress!, bobAddress!, 1000, 10)

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

    await mineBlocksInLab(page, 1, 'name', { ownerName: 'Alice' })

    state = await getLabState(page)
    expect(state.mempool).toHaveLength(0)
    expect(state.transactions).toHaveLength(1)
    const aliceSum = getUtxoSumByOwner(state, 'Alice')
    const bobSum = getUtxoSumByOwner(state, 'Bob')
    expect(bobSum).toBe(COINBASE_SATS + 1000)
    expect(aliceSum).toBeGreaterThan(0)
  })

  test('transfer name to wallet address in lab', async ({ page }) => {
    await mineBlocksInLab(page, 1, 'name', { ownerName: 'Alice' })

    const stateAfterMine = await getLabState(page)
    const aliceAddress = stateAfterMine.addresses.find(
      (a) => (stateAfterMine.addressToOwner ?? {})[a.address] === 'Alice',
    )?.address
    expect(aliceAddress).toBeDefined()

    await page.getByRole('link', { name: /receive/i }).click()
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

    await mineBlocksInLab(page, 1, 'name', { ownerName: 'Alice' })

    state = await getLabState(page)
    expect(state.mempool).toHaveLength(0)
    const walletOwner = Object.values(state.addressToOwner ?? {}).find((o) =>
      o.startsWith(WALLET_OWNER_PREFIX),
    )
    const walletSum = getUtxoSumByOwner(state, walletOwner!)
    expect(walletSum).toBe(20_000)
  })

  test('transfer wallet to name in wallet', async ({ page }) => {
    await mineBlocksInLab(page, 1, 'wallet')
    await mineBlocksInLab(page, 1, 'name', { ownerName: 'Alice' })

    const stateBefore = await getLabState(page)
    const aliceAddress = stateBefore.addresses.find(
      (a) => (stateBefore.addressToOwner ?? {})[a.address] === 'Alice',
    )?.address
    expect(aliceAddress).toBeDefined()

    await sendFromWallet(page, aliceAddress!, 15_000, 1)

    let state = await getLabState(page)
    expect(state.mempool).toHaveLength(1)

    await mineBlocksInLab(page, 1, 'name')

    state = await getLabState(page)
    expect(state.mempool).toHaveLength(0)
    const aliceSum = getUtxoSumByOwner(state, 'Alice')
    expect(aliceSum).toBe(COINBASE_SATS + 15_000)
  })

  test('transfer wallet to wallet', async ({ page }) => {
    await mineBlocksInLab(page, 2, 'wallet')

    await page.getByRole('link', { name: /receive/i }).click()
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

    await mineBlocksInLab(page, 1, 'name')

    state = await getLabState(page)
    expect(state.mempool).toHaveLength(0)
    const walletOwner = Object.values(state.addressToOwner ?? {}).find((o) =>
      o.startsWith(WALLET_OWNER_PREFIX),
    )
    const walletSum = getUtxoSumByOwner(state, walletOwner!)
    expect(walletSum).toBeGreaterThanOrEqual(2 * COINBASE_SATS - 25_000 - 500)
    expect(walletSum).toBeLessThanOrEqual(2 * COINBASE_SATS - 25_000)
  })
})
