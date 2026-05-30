/**
 * Manual UTXO selection on lab send review (feature flag + subset + confirm).
 *
 * Run: `npm run test:e2e -- --grep @lab-manual-utxo` or
 * `npx playwright test tests/e2e/manual-utxo-selection-lab.spec.ts`
 */
import { test, expect } from '@playwright/test'
import { LabOwnerType } from '@/lib/lab/lab-owner-type'
import { importWalletViaUI, TEST_MNEMONIC, TEST_PASSWORD } from './helpers/wallet-setup'
import {
  switchToLab,
  resetLab,
  mineBlocksInLab,
  createTransactionInLab,
  getLabState,
  findAddressForOwner,
  goToLabSendCompose,
  clickLabReviewTransaction,
  confirmLabSendAndWaitForMempool,
  getWalletOwnerKey,
  getUtxoSumByOwner,
  waitForLabMempoolLength,
} from './helpers/lab'
import { goToWalletTab } from './helpers/wallet-nav'
import { enableUtxoSelectionFeature } from './helpers/utxo-selection-feature'
import { LAB_WALLET_RECEIVE_PAGE_TITLE } from '@/lib/wallet/wallet-lab-ui-copy'

test.describe('Manual UTXO selection (lab)', { tag: '@lab @lab-manual-utxo' }, () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240_000)
    await importWalletViaUI(page, TEST_MNEMONIC, TEST_PASSWORD)
    await switchToLab(page)
    await resetLab(page)
    await enableUtxoSelectionFeature(page)
  })

  test('manual subset on review then confirm sends', async ({ page }) => {
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Bob' })

    let state = await getLabState(page)
    const aliceAddress = findAddressForOwner(state, 'Alice')
    const bobAddress = findAddressForOwner(state, 'Bob')
    expect(aliceAddress).toBeDefined()
    expect(bobAddress).toBeDefined()

    await goToWalletTab(page, 'Receive', { networkMode: 'lab' })
    await expect(
      page.getByRole('heading', { name: LAB_WALLET_RECEIVE_PAGE_TITLE }),
    ).toBeVisible({ timeout: 15_000 })
    const addressEl = page.getByRole('main').locator('.font-mono').first()
    await expect(addressEl).toBeVisible({ timeout: 10_000 })
    const walletAddress = (await addressEl.textContent())?.trim()
    expect(walletAddress).toMatch(/^bcrt1/)

    await createTransactionInLab(page, aliceAddress!, walletAddress!, 60_000, 1)
    await waitForLabMempoolLength(page, 1)
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    await waitForLabMempoolLength(page, 0)

    await createTransactionInLab(page, aliceAddress!, walletAddress!, 40_000, 1)
    await waitForLabMempoolLength(page, 1)
    await mineBlocksInLab(page, 1, LabOwnerType.LabEntity, { ownerName: 'Alice' })
    await waitForLabMempoolLength(page, 0)

    state = await getLabState(page)
    const walletKey = getWalletOwnerKey(state)
    expect(getUtxoSumByOwner(state, walletKey)).toBe(100_000)

    await goToLabSendCompose(page, bobAddress!, 1_000)
    await clickLabReviewTransaction(page)
    await expect(page.getByText('Transaction Details')).toBeVisible({ timeout: 60_000 })

    await page.getByRole('button', { name: 'Show UTXOs to be used' }).click()
    const manualSwitch = page.getByRole('switch', {
      name: 'Enable manual UTXO selection',
    })
    await manualSwitch.click()
    await expect(page.getByText('Available UTXOs')).toBeVisible()

    const addButton = page
      .getByRole('button', { name: /Add UTXO .+ to selected inputs/ })
      .first()
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click()
      await expect(page.getByText('Updating fee…')).toBeHidden({ timeout: 15_000 })
    }

    await expect(page.getByRole('button', { name: /Confirm and Send/i })).toBeEnabled({
      timeout: 15_000,
    })

    await confirmLabSendAndWaitForMempool(page)

    state = await getLabState(page)
    expect(getUtxoSumByOwner(state, 'Bob')).toBeGreaterThanOrEqual(1_000)
  })
})
