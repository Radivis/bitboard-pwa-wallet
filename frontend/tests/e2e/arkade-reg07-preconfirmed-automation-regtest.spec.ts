/**
 * E2E-ARK-REG-07 — preconfirmed VTXO unilateral unroll with Proceed automatically enabled.
 *
 * Run: `npm run test:e2e:arkade-regtest-reg07` from `frontend/`.
 */
import { test, expect } from '@playwright/test'
import { ensureOnChainBumperFunds, goToArkadeManagementPanel } from './helpers/arkade-management'
import {
  assertPreconfirmedVtxoVisibleOnViewer,
  preparePreconfirmedUnilateralExitScenario,
} from './helpers/arkade-regtest-scenarios'
import {
  runAutomaticUnilateralUnrollUntilBranchComplete,
  selectAllUnilateralExitLeafNodes,
  REG07_BUMPER_FUNDING_SATS,
} from './helpers/arkade-unilateral-exit-reg07'

const ARKADE_REGTEST_TIMEOUT_MS = 1_200_000

test.describe('Arkade REG-07 preconfirmed automation @arkade-reg07', () => {
  test.describe.configure({ timeout: ARKADE_REGTEST_TIMEOUT_MS })

  test.beforeEach(() => {
    test.skip(
      process.env.VITE_E2E_ARKADE_REGTEST !== 'true',
      'Run with VITE_E2E_ARKADE_REGTEST=true (npm run test:e2e:arkade-regtest-reg07).',
    )
  })

  test('E2E-ARK-REG-07 preconfirmed VTXO automatic unilateral unroll', async ({ page }) => {
    await preparePreconfirmedUnilateralExitScenario(page)
    await assertPreconfirmedVtxoVisibleOnViewer(page, 2)

    await goToArkadeManagementPanel(page)
    await page.getByTestId('arkade-unilateral-exit-control').click()
    await expect(page.getByTestId('unilateral-exit-tree-graph')).toBeVisible({ timeout: 120_000 })
    await selectAllUnilateralExitLeafNodes(page)
    await expect(
      page.locator('p').filter({ hasText: /^Selected leaves$/ }).locator('..').locator('ul > li'),
    ).toHaveCount(2, { timeout: 60_000 })
    await ensureOnChainBumperFunds(page, REG07_BUMPER_FUNDING_SATS)
    await runAutomaticUnilateralUnrollUntilBranchComplete(page)
  })
})
