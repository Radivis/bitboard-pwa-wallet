/**
 * Arkade core flows against live arkd (arkade-regtest).
 *
 * Run: `npm run test:e2e:arkade-regtest` from `frontend/`.
 * Contracts: E2E-ARK-REG-01 … E2E-ARK-REG-04 — see doc/features/arkade-regtest-contract.yaml
 */
import { test, expect } from '@playwright/test'
import {
  ARKADE_REGTEST_UNILATERAL_EXIT_DELAY_BLOCKS,
  mineRegtestBlocks,
} from './helpers/arkade-regtest'
import { restartArkadeOperator } from './helpers/regtest'
import {
  ensureOnChainBumperFunds,
  goToArkadeManagementPanel,
} from './helpers/arkade-management'
import {
  prepareCollaborativeExitScenario,
  prepareRecoverableVtxoScenario,
  prepareUnilateralUnrollScenario,
  prepareVtxoRenewalScenario,
} from './helpers/arkade-regtest-scenarios'
import { triggerArkadeRailSync, waitForDashboardArkadeBalanceAtLeast } from './helpers/dashboard-arkade'
import { goToWalletTab } from './helpers/wallet-nav'

const ARKADE_REGTEST_TIMEOUT_MS = 600_000

test.describe('Arkade core flows regtest @arkade-regtest', () => {
  // Serial: one shared regtest stack; abort remaining tests when setup fails early.
  test.describe.configure({ mode: 'serial', timeout: ARKADE_REGTEST_TIMEOUT_MS })

  test.beforeEach(async () => {
    test.skip(
      process.env.VITE_E2E_ARKADE_REGTEST !== 'true',
      'Run with VITE_E2E_ARKADE_REGTEST=true (npm run test:e2e:arkade-regtest).',
    )
    // Each test (and each retry) uses a fresh wallet; restart the shared operator so no stuck
    // intent or accumulated round state from a previous test can poison this one.
    await restartArkadeOperator()
  })

  test('E2E-ARK-REG-01 recoverable VTXO recovery', async ({ page }) => {
    await prepareRecoverableVtxoScenario(page)
    await page.getByRole('button', { name: 'Recover now' }).click()
    await expect(page.getByRole('button', { name: 'Recovering…' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByTestId('arkade-recoverable-vtxo-banner')).not.toBeVisible({
      timeout: 180_000,
    })
    await goToWalletTab(page, 'Dashboard')
    await triggerArkadeRailSync(page)
    await waitForDashboardArkadeBalanceAtLeast(page, 1, 120_000)
  })

  test('E2E-ARK-REG-02 VTXO renewal', async ({ page }) => {
    await prepareVtxoRenewalScenario(page)
    await page.getByRole('button', { name: 'Renew VTXOs now' }).click()
    await expect(
      page.getByText(/VTXOs renewed|No expiring VTXOs to renew/i),
    ).toBeVisible({ timeout: 120_000 })
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
    await ensureOnChainBumperFunds(page, 100_000)
    await goToArkadeManagementPanel(page)
    await page.getByRole('button', { name: 'Unilateral exit' }).click()
    await expect(page.getByRole('heading', { name: 'Unilateral exit' })).toBeVisible()
    const firstCandidate = page.locator('input[name="arkade-exit-vtxo"]').first()
    await expect(firstCandidate).toBeVisible({ timeout: 120_000 })
    await firstCandidate.check()
    await page.getByRole('button', { name: 'Start unroll' }).click()
    await expect(page.getByRole('button', { name: 'Complete exit' })).toBeVisible({
      timeout: 300_000,
    })
    await mineRegtestBlocks(ARKADE_REGTEST_UNILATERAL_EXIT_DELAY_BLOCKS)
    await page.getByLabel('Destination address').fill(await readOnChainReceiveAddress(page))
    await page.getByRole('button', { name: 'Complete exit' }).click()
    await expect(page.getByRole('button', { name: 'Completing…' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('heading', { name: 'Unilateral exit' })).not.toBeVisible({
      timeout: 180_000,
    })
  })
})

async function readOnChainReceiveAddress(page: import('@playwright/test').Page): Promise<string> {
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
