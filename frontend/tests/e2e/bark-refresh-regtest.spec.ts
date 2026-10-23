/**
 * Bark refresh notice when a VTXO is inside the client expiry threshold.
 *
 * Run: `npm run test:e2e:bark-refresh-regtest` from `frontend/`.
 * That clean-start loads docker/captaind/captaind.refresh.toml (`vtxo_lifetime = 20`).
 * The regtest client treats a VTXO as due when 12 or fewer blocks remain.
 *
 * Contract: E2E-BARK-REG-06.
 */
import { test, expect } from '@playwright/test'
import { boardRegtestBarkWallet } from './helpers/bark-regtest-scenarios'
import {
  readDashboardBarkSpendableSats,
  restartCaptaind,
  triggerBarkRailSync,
} from './helpers/bark-regtest'
import { runDashboardSyncUntilIdle } from './helpers/dashboard-sync'
import { mineRegtestBlocks } from './helpers/regtest'
import { goToWalletTab } from './helpers/wallet-nav'

const BARK_REGTEST_TIMEOUT_MS = 600_000
const BLOCKS_TO_REACH_REFRESH_THRESHOLD = 16

test.describe('Bark refresh regtest @bark-refresh-regtest', () => {
  test.describe.configure({ mode: 'serial', timeout: BARK_REGTEST_TIMEOUT_MS })

  test.beforeEach(async () => {
    test.skip(
      process.env.VITE_E2E_BARK_REGTEST !== 'true',
      'Run with VITE_E2E_BARK_REGTEST=true (npm run test:e2e:bark-refresh-regtest).',
    )
    await restartCaptaind()
  })

  test('E2E-BARK-REG-06 refresh notice leaves spendable unchanged', async ({ page }) => {
    await boardRegtestBarkWallet(page)
    await goToWalletTab(page, 'Dashboard')
    const spendableBefore = await readDashboardBarkSpendableSats(page)
    const notice = page.getByTestId('dashboard-bark-refresh-notice')

    for (let mined = 0; mined < BLOCKS_TO_REACH_REFRESH_THRESHOLD; mined += 1) {
      await triggerBarkRailSync(page)
      if (await notice.isVisible()) break
      await mineRegtestBlocks(1)
      await runDashboardSyncUntilIdle(page)
    }

    await expect(notice).toBeVisible({ timeout: 30_000 })
    expect(await readDashboardBarkSpendableSats(page)).toBe(spendableBefore)
  })
})
