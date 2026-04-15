/**
 * Manual lab-entity transactions on `/lab/transactions`: case-1 min output clamp (546 sats) and
 * case-2 Change-and-fees modal (same semantics as wallet lab Send).
 *
 * Run: `npm run test:e2e -- --grep @lab` or
 * `npx playwright test tests/e2e/lab-manual-transactions-dust.spec.ts`
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
  goToLabTransactionsPage,
  expectManualLabEntityTransactionInMempool,
  clickLabDustChoiceManualLabEntityTx,
  createLabEntityViaControl,
} from './helpers/lab'

test.describe('Lab manual transactions dust UX', { tag: '@lab' }, () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240_000)
    await importWalletViaUI(page, TEST_MNEMONIC, TEST_PASSWORD)
    await switchToLab(page)
    await resetLab(page)
  })

  test('case-1 clamps sub-546 amount', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Bob' })

    const state = await getLabState(page)
    const aliceAddress = findAddressForOwner(state, 'Alice')
    const bobAddress = findAddressForOwner(state, 'Bob')
    expect(aliceAddress).toBeDefined()
    expect(bobAddress).toBeDefined()

    await goToLabTransactionsPage(page)
    await page.getByRole('button', { name: 'Make transaction' }).click()
    await page.getByLabel('From address').fill(aliceAddress!)
    await page.getByLabel('To address').fill(bobAddress!)
    await page.getByLabel('Amount (sats)').fill('200')
    await page.getByLabel('Fee rate (sat/vB)').fill('1')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(
      page.getByText(/minimum output size \(546 sats\)/i).first(),
    ).toBeVisible({ timeout: 60000 })
    await expectManualLabEntityTransactionInMempool(page)
  })

  /**
   * Bob funds Alice with exactly 1100 sats (Alice never mined — only this UTXO). Manual send 800
   * triggers case-2; keep exact drains Alice to Bob net of fees.
   */
  test('case-2 keep exact after manual send from 1100-sat UTXO', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Bob' })
    await createLabEntityViaControl(page, { ownerName: 'Alice' })
    await page.getByRole('navigation', { name: 'Lab' }).getByRole('link', { name: 'Blocks' }).click()
    await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({ timeout: 15000 })

    let state = await getLabState(page)
    const aliceAddress = findAddressForOwner(state, 'Alice')
    const bobAddress = findAddressForOwner(state, 'Bob')
    expect(aliceAddress).toBeDefined()
    expect(bobAddress).toBeDefined()

    await createTransactionInLab(page, bobAddress!, aliceAddress!, 1100, 1)
    await expect
      .poll(
        async () => (await getLabState(page)).mempool.length,
        { timeout: 15000 },
      )
      .toBe(1)

    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Bob' })
    state = await getLabState(page)
    expect(getUtxoSumByOwner(state, 'Alice')).toBe(1100)

    await goToLabTransactionsPage(page)
    await page.getByRole('button', { name: 'Make transaction' }).click()
    await page.getByLabel('From address').fill(aliceAddress!)
    await page.getByLabel('To address').fill(bobAddress!)
    await page.getByLabel('Amount (sats)').fill('800')
    await page.getByLabel('Fee rate (sat/vB)').fill('1')
    await page.getByRole('button', { name: 'Send' }).click()

    await clickLabDustChoiceManualLabEntityTx(page, 'keepExact')
    await expectManualLabEntityTransactionInMempool(page)
  })

  /** Same funding as keep-exact; user chooses change-free max (bump) instead. */
  test('case-2 increase to change-free max', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Bob' })
    await createLabEntityViaControl(page, { ownerName: 'Alice' })
    await page.getByRole('navigation', { name: 'Lab' }).getByRole('link', { name: 'Blocks' }).click()
    await expect(page.getByRole('heading', { name: 'Blocks' })).toBeVisible({ timeout: 15000 })

    let state = await getLabState(page)
    const aliceAddress = findAddressForOwner(state, 'Alice')
    const bobAddress = findAddressForOwner(state, 'Bob')
    expect(aliceAddress).toBeDefined()
    expect(bobAddress).toBeDefined()

    await createTransactionInLab(page, bobAddress!, aliceAddress!, 1100, 1)
    await expect
      .poll(
        async () => (await getLabState(page)).mempool.length,
        { timeout: 15000 },
      )
      .toBe(1)

    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Bob' })
    state = await getLabState(page)
    expect(getUtxoSumByOwner(state, 'Alice')).toBe(1100)

    await goToLabTransactionsPage(page)
    await page.getByRole('button', { name: 'Make transaction' }).click()
    await page.getByLabel('From address').fill(aliceAddress!)
    await page.getByLabel('To address').fill(bobAddress!)
    await page.getByLabel('Amount (sats)').fill('800')
    await page.getByLabel('Fee rate (sat/vB)').fill('1')
    await page.getByRole('button', { name: 'Send' }).click()

    await clickLabDustChoiceManualLabEntityTx(page, 'increaseToChangeFreeMax')
    await expectManualLabEntityTransactionInMempool(page)
  })
})
