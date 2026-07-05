/**
 * Arkade exit flows against live arkd (arkade-regtest), long-VTXO-expiry stack.
 *
 * Run: `npm run test:e2e:arkade-regtest-longexpiry` from `frontend/`.
 *
 * Collaborative exit (REG-03) and full unilateral unroll (REG-04) need a VTXO that stays LIVE
 * (settled, unexpired, unswept) across a multi-step on-chain flow. The recovery/renewal suite runs
 * against a deliberately short VTXO-tree expiry (`.env.regtest`, ARKD_VTXO_TREE_EXPIRY=40). The
 * long-expiry npm script boots the same stack with ARKD_VTXO_TREE_EXPIRY=200.
 *
 * Contracts: E2E-ARK-REG-03 / E2E-ARK-REG-04 — see doc/features/arkade-regtest-contract.yaml
 */
import { test, expect, type Page } from '@playwright/test'
import {
  ARKADE_REGTEST_UNILATERAL_EXIT_DELAY_BLOCKS,
  mineRegtestBlocks,
} from './helpers/arkade-regtest'
import { restartArkadeOperator } from './helpers/regtest'
import { ensureOnChainBumperFunds, goToArkadeManagementPanel } from './helpers/arkade-management'
import {
  prepareCollaborativeExitScenario,
  prepareUnilateralUnrollScenario,
} from './helpers/arkade-regtest-scenarios'
import { goToWalletTab } from './helpers/wallet-nav'

const ARKADE_REGTEST_TIMEOUT_MS = 600_000

test.describe('Arkade exit flows regtest @arkade-exit-regtest', () => {
  // Serial: one shared regtest stack; abort remaining tests when setup fails early.
  test.describe.configure({ mode: 'serial', timeout: ARKADE_REGTEST_TIMEOUT_MS })

  test.beforeEach(async () => {
    test.skip(
      process.env.VITE_E2E_ARKADE_REGTEST !== 'true',
      'Run with VITE_E2E_ARKADE_REGTEST=true (npm run test:e2e:arkade-regtest-longexpiry).',
    )
    // Each test (and each retry) uses a fresh wallet; restart the shared operator so no stuck
    // intent or accumulated round state from a previous test can poison this one.
    await restartArkadeOperator()
  })

  test('E2E-ARK-REG-03 collaborative exit', async ({ page }) => {
    await prepareCollaborativeExitScenario(page)
    await page.getByRole('button', { name: 'Collaborative exit' }).click()
    await expect(page.getByRole('heading', { name: 'Collaborative exit' })).toBeVisible()
    await page.getByRole('button', { name: 'Use current receive address' }).click()
    await page.getByLabel('Amount (sats, optional)').fill('50000')
    await page.getByRole('button', { name: 'Confirm exit' }).click()
    await expect(page.getByRole('button', { name: 'Exiting…' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText(/Collaborative exit started/i)).toBeVisible({
      timeout: 180_000,
    })
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
    await page.getByRole('textbox', { name: 'Destination address' }).fill(onChainReceiveAddress)
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
