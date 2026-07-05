/**
 * E2E-ARK-REG-04 only — full unilateral unroll against a freshly cleaned long-expiry stack.
 *
 * Run: `npm run test:e2e:arkade-regtest-reg04` from `frontend/`.
 *
 * Unlike the serial exit-flows suite, this spec does not restart arkd between attempts: the npm
 * script wipes volumes and boots a clean stack first, which is enough for an isolated run and avoids
 * restoring poisoned sweep/batch state from a prior session.
 */
import { test, expect, type Page } from '@playwright/test'
import {
  ARKADE_REGTEST_UNILATERAL_EXIT_DELAY_BLOCKS,
  mineRegtestBlocks,
} from './helpers/arkade-regtest'
import { ensureOnChainBumperFunds, goToArkadeManagementPanel } from './helpers/arkade-management'
import { prepareUnilateralUnrollScenario } from './helpers/arkade-regtest-scenarios'
import { goToWalletTab } from './helpers/wallet-nav'

const ARKADE_REGTEST_TIMEOUT_MS = 1_200_000

test.describe('Arkade REG-04 unilateral unroll @arkade-reg04', () => {
  test.describe.configure({ timeout: ARKADE_REGTEST_TIMEOUT_MS })

  test.beforeEach(() => {
    test.skip(
      process.env.VITE_E2E_ARKADE_REGTEST !== 'true',
      'Run with VITE_E2E_ARKADE_REGTEST=true (npm run test:e2e:arkade-regtest-reg04).',
    )
  })

  test('E2E-ARK-REG-04 full unilateral unroll', async ({ page }) => {
    await prepareUnilateralUnrollScenario(page)
    const onChainReceiveAddress = await readOnChainReceiveAddress(page)
    await goToArkadeManagementPanel(page)
    await page.getByRole('button', { name: 'Start unilateral exit' }).click()
    await expect(page.getByRole('heading', { name: 'Start unilateral exit' })).toBeVisible()
    await ensureOnChainBumperFunds(page, 100_000)
    const firstCandidate = page.locator('input[name="arkade-exit-vtxo"]').first()
    await expect(firstCandidate).toBeVisible({ timeout: 120_000 })
    await firstCandidate.check()
    await expect(page.getByRole('button', { name: 'Start unroll' })).toBeEnabled({
      timeout: 60_000,
    })
    await page.getByRole('button', { name: 'Start unroll' }).click()
    const unrollError = page.getByTestId('arkade-unroll-error')
    await expect(async () => {
      if (!(await page.getByRole('heading', { name: 'Start unilateral exit' }).isVisible())) {
        return
      }
      if (await unrollError.isVisible()) {
        throw new Error((await unrollError.textContent())?.trim() ?? 'Unroll failed')
      }
      throw new Error('Unroll still in progress')
    }).toPass({ timeout: 300_000 })
    await expect(page.getByText(/Unroll complete/i)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('arkade-complete-unilateral-exit')).toBeVisible({
      timeout: 120_000,
    })
    await page.getByTestId('arkade-complete-unilateral-exit').click()
    await expect(page.getByRole('heading', { name: 'Complete unilateral exit' })).toBeVisible()
    await page.locator('input[type="checkbox"]').first().check()
    await mineRegtestBlocks(ARKADE_REGTEST_UNILATERAL_EXIT_DELAY_BLOCKS + 5)
    await page.getByLabel('Destination address').fill(onChainReceiveAddress)
    await page.getByRole('button', { name: 'Complete exit' }).click()
    await expect(page.getByRole('button', { name: 'Completing…' })).toBeVisible({
      timeout: 15_000,
    })
    const completeError = page.getByTestId('arkade-complete-error')
    await expect(async () => {
      if (!(await page.getByRole('heading', { name: 'Complete unilateral exit' }).isVisible())) {
        return
      }
      if (await completeError.isVisible()) {
        throw new Error((await completeError.textContent())?.trim() ?? 'Complete exit failed')
      }
      throw new Error('Complete exit still in progress')
    }).toPass({ timeout: 300_000 })
  })
})

async function readOnChainReceiveAddress(page: Page): Promise<string> {
  await goToWalletTab(page, 'Receive')
  const addressEl = page
    .locator('[data-infomode-id="receive-receiving-address-card"]')
    .locator('.font-mono')
  await expect(addressEl).toBeVisible({ timeout: 15_000 })
  const address = (await addressEl.textContent())?.trim() ?? ''
  if (!address.startsWith('bcrt1')) {
    throw new Error(`Expected regtest on-chain address, got: ${address}`)
  }
  return address
}
