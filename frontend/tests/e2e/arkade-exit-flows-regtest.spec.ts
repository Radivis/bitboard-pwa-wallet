/**
 * Arkade exit flows against live arkd (arkade-regtest), long-VTXO-expiry stack.
 *
 * Run: `npm run test:e2e:arkade-regtest-longexpiry` from `frontend/`.
 *
 * Collaborative exit (REG-03) needs a VTXO that stays LIVE (settled, unexpired, unswept) across a
 * multi-step on-chain flow. The recovery/renewal suite runs against a deliberately short VTXO-tree
 * expiry (`.env.regtest`, ARKD_VTXO_TREE_EXPIRY=40) so VTXOs expire/sweep quickly — the opposite of
 * what this test needs. The long-expiry npm script boots the same stack with a large
 * ARKD_VTXO_TREE_EXPIRY so the flow can complete.
 *
 * REG-04 (full unilateral unroll) lives in `arkade-reg04-unilateral-unroll-regtest.spec.ts` until
 * complete-exit coin selection is fixed; run `npm run test:e2e:arkade-regtest-reg04` for that case.
 *
 * Contract: E2E-ARK-REG-03 — see doc/features/arkade-regtest-contract.yaml
 */
import { test, expect } from '@playwright/test'
import { restartArkadeOperator } from './helpers/regtest'
import { prepareCollaborativeExitScenario } from './helpers/arkade-regtest-scenarios'

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
})
