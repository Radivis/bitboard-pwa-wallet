/**
 * Arkade signer migration against live arkd (arkade-regtest), long-VTXO-expiry stack.
 *
 * Run: `npm run test:e2e:arkade-regtest-signer` from `frontend/`.
 *
 * Contract: E2E-ARK-REG-05 — see doc/features/arkade-regtest-contract.yaml
 */
import { test, expect } from '@playwright/test'
import { restartArkadeOperator } from './helpers/regtest'
import { prepareSignerMigrationScenario } from './helpers/arkade-regtest-scenarios'
import {
  triggerArkadeRailSync,
  waitForDashboardArkadeBalanceAtLeast,
} from './helpers/dashboard-arkade'
import { goToWalletTab } from './helpers/wallet-nav'

const ARKADE_SIGNER_REGTEST_TIMEOUT_MS = 600_000

test.describe('Arkade signer migration regtest @arkade-signer-regtest', () => {
  test.describe.configure({ mode: 'serial', timeout: ARKADE_SIGNER_REGTEST_TIMEOUT_MS })

  test.beforeEach(async () => {
    test.skip(
      process.env.VITE_E2E_ARKADE_REGTEST !== 'true',
      'Run with VITE_E2E_ARKADE_REGTEST=true (npm run test:e2e:arkade-regtest-signer).',
    )
    await restartArkadeOperator()
  })

  test('E2E-ARK-REG-05 cooperative signer migration clears banner and pending recovery', async ({
    page,
  }) => {
    const balanceBeforeMigrate = await prepareSignerMigrationScenario(page)

    await page.getByRole('button', { name: /Migrate funds/i }).click()
    await expect(page.getByRole('button', { name: 'Migrating…' })).toBeVisible({
      timeout: 15_000,
    })

    await expect(page.getByTestId('arkade-signer-migration-banner')).not.toBeVisible({
      timeout: 300_000,
    })

    await goToWalletTab(page, 'Dashboard')
    await triggerArkadeRailSync(page, 120_000)

    await expect(page.getByTestId('arkade-pending-recovery-banner')).not.toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByTestId('arkade-balance-pending-recovery')).not.toBeVisible({
      timeout: 30_000,
    })

    const minExpectedBalance = Math.max(1, balanceBeforeMigrate - Math.ceil(balanceBeforeMigrate * 0.05))
    await waitForDashboardArkadeBalanceAtLeast(page, minExpectedBalance, 180_000)
  })
})
