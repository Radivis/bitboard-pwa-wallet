/**
 * E2E-ARK-REG-07 — preconfirmed VTXO unilateral unroll with Proceed automatically enabled.
 *
 * Chained self-sends (40% + 30%) create intermediate virtual hosts with exitable outpoints that
 * are not leaf-selectable, then automatic unroll runs on all terminal leaf siblings.
 *
 * Run: `npm run test:e2e:arkade-regtest-reg07` from `frontend/`.
 */
import { test, expect } from '@playwright/test'
import { ensureOnChainBumperFunds, goToArkadeManagementPanel } from './helpers/arkade-management'
import { triggerArkadeRailSync } from './helpers/dashboard-arkade'
import { goToWalletTab } from './helpers/wallet-nav'
import {
  assertPreconfirmedVtxoCountAtLeast,
  preparePreconfirmedUnilateralExitScenario,
} from './helpers/arkade-regtest-scenarios'
import {
  assertIntermediateNodesShowExitableOutpointsButAreNotLeafSelection,
  runAutomaticUnilateralUnrollUntilBranchComplete,
  selectAllUnilateralExitLeafNodes,
  waitForBumperBalanceReady,
  REG07_BUMPER_FUNDING_SATS,
} from './helpers/arkade-unilateral-exit-reg07'
import { attachUnilateralExitDiagnosticsOnTestFailure } from './helpers/esplora-unilateral-exit-diagnostics'

const ARKADE_REGTEST_TIMEOUT_MS = 1_200_000

test.describe('Arkade REG-07 preconfirmed automation @arkade-reg07', () => {
  test.describe.configure({ timeout: ARKADE_REGTEST_TIMEOUT_MS })

  test.beforeEach(() => {
    test.skip(
      process.env.VITE_E2E_ARKADE_REGTEST !== 'true',
      'Run with VITE_E2E_ARKADE_REGTEST=true (npm run test:e2e:arkade-regtest-reg07).',
    )
  })

  test.afterEach(async ({ page }, testInfo) => {
    await attachUnilateralExitDiagnosticsOnTestFailure(page, testInfo)
  })

  test('E2E-ARK-REG-07 preconfirmed VTXO automatic unilateral unroll', async ({ page }) => {
    await preparePreconfirmedUnilateralExitScenario(page)
    const preconfirmedCount = await assertPreconfirmedVtxoCountAtLeast(page, 2)

    await goToWalletTab(page, 'Dashboard')
    await triggerArkadeRailSync(page, 120_000)
    await goToArkadeManagementPanel(page)
    await page.getByTestId('arkade-unilateral-exit-control').click()
    await expect(page.getByTestId('unilateral-exit-tree-graph')).toBeVisible({ timeout: 120_000 })
    await assertIntermediateNodesShowExitableOutpointsButAreNotLeafSelection(page, preconfirmedCount)

    const leafCount = await selectAllUnilateralExitLeafNodes(page)
    expect(leafCount).toBeGreaterThanOrEqual(1)
    const selectedOutpoints = page
      .locator('p')
      .filter({ hasText: /^Selected leaves$/ })
      .locator('..')
      .locator('ul > li')
    await expect(selectedOutpoints.first()).toBeVisible({ timeout: 60_000 })
    expect(await selectedOutpoints.count()).toBeGreaterThanOrEqual(2)

    await ensureOnChainBumperFunds(page, REG07_BUMPER_FUNDING_SATS)
    await waitForBumperBalanceReady(page)
    await runAutomaticUnilateralUnrollUntilBranchComplete(page)
  })
})
