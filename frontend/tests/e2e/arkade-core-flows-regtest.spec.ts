/**
 * Arkade core flows against live arkd (arkade-regtest), short-VTXO-expiry stack.
 *
 * Run: `npm run test:e2e:arkade-regtest` from `frontend/`.
 *
 * Recovery (REG-01) and renewal (REG-02) rely on the deliberately short VTXO-tree expiry
 * (`.env.regtest`, ARKD_VTXO_TREE_EXPIRY=40) so VTXOs expire/become recoverable quickly. The
 * exit flows that instead need a long-lived VTXO (collaborative exit, unilateral unroll) live in
 * `arkade-exit-flows-regtest.spec.ts` and run against a long-expiry stack.
 *
 * Contracts: E2E-ARK-REG-01 / E2E-ARK-REG-02 — see doc/features/arkade-regtest-contract.yaml
 */
import { test, expect } from '@playwright/test'
import { restartArkadeOperator } from './helpers/regtest'
import {
  prepareRecoverableVtxoScenario,
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
})
