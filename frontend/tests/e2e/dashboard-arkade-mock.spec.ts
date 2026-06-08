/**
 * Dashboard Arkade contract E2E with mocked Ark operator (ASP).
 *
 * Run: `npm run test:e2e:arkade` from `frontend/` (sets VITE_E2E_ARKADE_MOCK=true).
 * Contracts: E2E-ARK-MOCK-01, E2E-ARK-MOCK-02, E2E-ARK-MOCK-03 — see
 * doc/features/dashboard-arkade-contract.yaml
 */
import { test, expect } from '@playwright/test'
import { createWalletViaUI, expectNoInitialWalletSyncErrorToast } from './helpers/wallet-setup'
import { goToWalletTab } from './helpers/wallet-nav'
import { enableArkadeFeature, switchToSignet } from './helpers/arkade-settings'
import {
  E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
  E2E_ARKADE_MOCK_INCOMING_TXID,
} from '@/lib/arkade/e2e/arkade-operator-mock-state'
import {
  buildArkadeMockPartitionId,
  installArkadeMockIsolation,
} from './helpers/arkade-mock-isolation'
import {
  expectArkadeBalanceNotEmptySession,
  goToReceiveArkadeMode,
  readDashboardArkadeBalanceSats,
  waitForArkadeActivityLoaded,
  waitForArkadeBalanceCard,
} from './helpers/dashboard-arkade'

const ARKADE_MOCK_TEST_TIMEOUT_MS = process.env.CI ? 120_000 : 90_000

test.describe('Dashboard Arkade mock ASP @arkade', () => {
  test.describe.configure({ timeout: ARKADE_MOCK_TEST_TIMEOUT_MS })

  test.beforeEach(async ({ page, context }, testInfo) => {
    test.skip(
      process.env.VITE_E2E_ARKADE_MOCK !== 'true',
      'Run with VITE_E2E_ARKADE_MOCK=true (npm run test:e2e:arkade).',
    )
    await installArkadeMockIsolation(
      context,
      page,
      buildArkadeMockPartitionId(testInfo),
    )
  })

  test('E2E-ARK-MOCK-01 shows Arkade balance card after unlock on signet', async ({ page }) => {
    await createWalletViaUI(page)
    await expectNoInitialWalletSyncErrorToast(page)

    await enableArkadeFeature(page)
    await switchToSignet(page)

    await goToWalletTab(page, 'Dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    await expectArkadeBalanceNotEmptySession(page)
    const arkadeSats = await readDashboardArkadeBalanceSats(page)
    expect(arkadeSats).toBe(E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS)
  })

  test('E2E-ARK-MOCK-02 shows fixture incoming payment in activity feed', async ({ page }) => {
    await createWalletViaUI(page)
    await enableArkadeFeature(page)
    await switchToSignet(page)
    await goToWalletTab(page, 'Dashboard')

    await expectArkadeBalanceNotEmptySession(page)
    expect(await readDashboardArkadeBalanceSats(page)).toBe(E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS)
    await waitForArkadeActivityLoaded(page)
    await expect(page.getByTestId(`arkade-payment-${E2E_ARKADE_MOCK_INCOMING_TXID}`)).toBeVisible()
  })

  test('E2E-ARK-MOCK-03 receive round-trip preserves Arkade balance display', async ({ page }) => {
    await createWalletViaUI(page)
    await enableArkadeFeature(page)
    await switchToSignet(page)
    await goToWalletTab(page, 'Dashboard')

    await expectArkadeBalanceNotEmptySession(page)
    const beforeSats = await readDashboardArkadeBalanceSats(page)

    await goToReceiveArkadeMode(page)
    await goToWalletTab(page, 'Dashboard')

    await waitForArkadeBalanceCard(page)
    await expect(page.getByTestId('dashboard-arkade-session-empty')).not.toBeVisible({
      timeout: 15_000,
    })
    const afterSats = await readDashboardArkadeBalanceSats(page)
    expect(afterSats).toBe(beforeSats)
  })
})
