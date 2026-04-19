/**
 * Lab dust UX: case-1 min output clamp (546 sats) and case-2 Change-and-fees modal.
 *
 * We fund the wallet with **1100** sats in one lab payment (enough for change-free bump vs a 1000
 * coin) while keeping ~800-sat sends in the dust-change regime so the case-2 modal appears.
 *
 * Run: `npm run test:e2e -- --grep @lab` or
 * `npx playwright test tests/e2e/lab-dust-send.spec.ts`
 */
import { test, expect } from '@playwright/test'
import { LabOwnerType } from '@/lib/lab-owner-type'
import { importWalletViaUI, TEST_MNEMONIC, TEST_PASSWORD } from './helpers/wallet-setup'
import {
  switchToLab,
  resetLab,
  mineBlocksInLab,
  createTransactionInLab,
  getLabState,
  getUtxoSumByOwner,
  findAddressForOwner,
  goToLabSendCompose,
  clickLabReviewTransaction,
  expectLabCase1MinDustClampUi,
  dismissLabDustModalOrBackFromReview,
  expectLabChangeAndFeesModal,
  clickLabDustChoice,
  confirmLabSendAndWaitForMempool,
  getWalletOwnerKey,
  waitForLabMempoolLength,
} from './helpers/lab'
import { goToWalletTab } from './helpers/wallet-nav'

test.describe('Lab dust send modal', { tag: '@lab' }, () => {
  /** Serial: lab mining + WASM are heavy; avoids navigation races under load. */
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240_000)
    await importWalletViaUI(page, TEST_MNEMONIC, TEST_PASSWORD)
    await switchToLab(page)
    await resetLab(page)
  })

  /**
   * Fund wallet with 1100 sats. Send 200 → case-1 raises to 546 (toast + red banner or review).
   * If case-2 also opens on that Review, cancel so we can enter 800. Then 800 → modal → bump;
   * mine; wallet empty; Bob’s lab UTXOs increase meaningfully (change-free max net of fees).
   */
  test('dust case-1 clamp then case-2 bump empties wallet', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Bob' })

    let state = await getLabState(page)
    const aliceAddress = findAddressForOwner(state, 'Alice')
    const bobAddress = findAddressForOwner(state, 'Bob')
    expect(aliceAddress).toBeDefined()
    expect(bobAddress).toBeDefined()

    await goToWalletTab(page, 'Receive')
    await expect(page.getByRole('heading', { name: 'Receive Bitcoin' })).toBeVisible({
      timeout: 15000,
    })
    const addressEl = page.getByRole('main').locator('.font-mono').first()
    await expect(addressEl).toBeVisible({ timeout: 10000 })
    const walletAddress = (await addressEl.textContent())?.trim()
    expect(walletAddress).toMatch(/^bcrt1/)

    await createTransactionInLab(page, aliceAddress!, walletAddress!, 1100, 1)
    await waitForLabMempoolLength(page, 1)

    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    await waitForLabMempoolLength(page, 0)

    state = await getLabState(page)
    const walletKey = getWalletOwnerKey(state)
    expect(getUtxoSumByOwner(state, walletKey)).toBe(1100)
    const bobBefore = getUtxoSumByOwner(state, 'Bob')

    await goToLabSendCompose(page, bobAddress!, 200)
    await clickLabReviewTransaction(page)
    await expectLabCase1MinDustClampUi(page)
    await dismissLabDustModalOrBackFromReview(page)

    await goToLabSendCompose(page, bobAddress!, 800)
    await clickLabReviewTransaction(page)
    await expectLabChangeAndFeesModal(page)
    await clickLabDustChoice(page, 'increaseToChangeFreeMax')

    await confirmLabSendAndWaitForMempool(page)

    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    state = await getLabState(page)
    expect(state.mempool).toHaveLength(0)

    expect(getUtxoSumByOwner(state, walletKey)).toBe(0)
    const bobAfter = getUtxoSumByOwner(state, 'Bob')
    expect(bobAfter).toBeGreaterThan(bobBefore)
    expect(bobAfter - bobBefore).toBeGreaterThanOrEqual(850)
  })

  /**
   * Fund wallet with 1100 sats. Send 800 → Change and fees → keep exact;
   * mine; wallet empty (no change output); Bob +800 vs pre-send balance.
   */
  test('dust case-2 keep exact sends 800 to Bob and drains wallet', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Bob' })

    let state = await getLabState(page)
    const aliceAddress = findAddressForOwner(state, 'Alice')
    const bobAddress = findAddressForOwner(state, 'Bob')
    expect(aliceAddress).toBeDefined()
    expect(bobAddress).toBeDefined()

    await goToWalletTab(page, 'Receive')
    await expect(page.getByRole('heading', { name: 'Receive Bitcoin' })).toBeVisible({
      timeout: 15000,
    })
    const addressEl = page.getByRole('main').locator('.font-mono').first()
    await expect(addressEl).toBeVisible({ timeout: 10000 })
    const walletAddress = (await addressEl.textContent())?.trim()
    expect(walletAddress).toMatch(/^bcrt1/)

    await createTransactionInLab(page, aliceAddress!, walletAddress!, 1100, 1)
    await waitForLabMempoolLength(page, 1)

    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    await waitForLabMempoolLength(page, 0)

    state = await getLabState(page)
    const walletKey = getWalletOwnerKey(state)
    expect(getUtxoSumByOwner(state, walletKey)).toBe(1100)
    const bobBefore = getUtxoSumByOwner(state, 'Bob')

    await goToLabSendCompose(page, bobAddress!, 800)
    await clickLabReviewTransaction(page)
    await expectLabChangeAndFeesModal(page)
    await clickLabDustChoice(page, 'keepExact')
    await confirmLabSendAndWaitForMempool(page)

    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    state = await getLabState(page)
    expect(state.mempool).toHaveLength(0)

    expect(getUtxoSumByOwner(state, walletKey)).toBe(0)
    expect(getUtxoSumByOwner(state, 'Bob') - bobBefore).toBe(800)
  })
})
