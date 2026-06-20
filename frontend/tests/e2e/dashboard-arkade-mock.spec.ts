/**
 * Dashboard Arkade contract E2E with mocked Ark operator (ASP).
 *
 * Run: `npm run test:e2e:arkade` from `frontend/` (sets VITE_E2E_ARKADE_MOCK=true).
 * Contracts: E2E-ARK-MOCK-01 … E2E-ARK-MOCK-04 — see
 * doc/features/dashboard-arkade-contract.yaml
 */
import { test, expect, type Page } from '@playwright/test'
import {
  createWalletViaUI,
  expectNoInitialWalletSyncErrorToast,
  TEST_PASSWORD,
} from './helpers/wallet-setup'
import { goToWalletTab } from './helpers/wallet-nav'
import { enableArkadeFeature, switchToSignet } from './helpers/arkade-settings'
import {
  E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
  E2E_ARKADE_MOCK_INCOMING_TXID,
  E2E_ARKADE_MOCK_RECEIVE_INCOMING_SATS,
  E2E_ARKADE_MOCK_RECEIVE_INCOMING_TXID,
} from '@/lib/arkade/e2e/arkade-operator-mock-state'
import { simulateArkadeIncomingPayment } from './helpers/arkade-mock-control'
import {
  buildArkadeMockPartitionId,
  installArkadeMockIsolation,
} from './helpers/arkade-mock-isolation'
import {
  goToReceiveArkadeMode,
  readDashboardArkadeBalanceSats,
  readReceiveArkadeAddress,
  waitForArkadeActivityLoaded,
  waitForArkadeBalanceCard,
  waitForArkadeMockDashboardBalance,
  waitForDashboardArkadeBalanceSats,
  waitForReceiveArkadeAddressReady,
  waitForArkadeWorkerReadyAfterUnlock,
  waitForDashboardArkadeSessionAfterUnlock,
} from './helpers/dashboard-arkade'

const ARKADE_MOCK_TEST_TIMEOUT_MS = process.env.CI ? 120_000 : 90_000
const POST_UNLOCK_ARKADE_TIMEOUT_MS = ARKADE_MOCK_TEST_TIMEOUT_MS * 2

async function lockWalletFromManagementAndUnlock(page: Page) {
  await goToWalletTab(page, 'Management')
  await page.getByRole('button', { name: 'Lock Wallet' }).click()
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Unlock wallet and go to previous page' }).click()
  await expect(page.getByRole('heading', { name: 'Unlock Wallet' })).toBeVisible({
    timeout: 15_000,
  })
  await page.getByLabel('Bitboard app password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Unlock' }).click()
  // Password input stays in the DOM while "Unlocking wallet…" runs; wait for return to Management.
  await expect(page.getByRole('button', { name: 'Lock Wallet' })).toBeVisible({ timeout: 90_000 })
}

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

    await waitForArkadeMockDashboardBalance(page)
    const arkadeSats = await readDashboardArkadeBalanceSats(page)
    expect(arkadeSats).toBe(E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS)
  })

  test('E2E-ARK-MOCK-02 shows fixture incoming payment in activity feed', async ({ page }) => {
    await createWalletViaUI(page)
    await enableArkadeFeature(page)
    await switchToSignet(page)
    await goToWalletTab(page, 'Dashboard')

    await waitForArkadeMockDashboardBalance(page)
    await waitForArkadeActivityLoaded(page)
    await expect(page.getByTestId(`arkade-payment-${E2E_ARKADE_MOCK_INCOMING_TXID}`)).toBeVisible()
  })

  test('E2E-ARK-MOCK-03 receive round-trip preserves Arkade balance display', async ({ page }) => {
    await createWalletViaUI(page)
    await enableArkadeFeature(page)
    await switchToSignet(page)
    await goToWalletTab(page, 'Dashboard')

    await waitForArkadeMockDashboardBalance(page)
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

  test('E2E-ARK-MOCK-04 simulated receive updates dashboard balance and activity', async ({
    page,
  }, testInfo) => {
    const partitionId = buildArkadeMockPartitionId(testInfo)
    const expectedTotalSats =
      E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS + E2E_ARKADE_MOCK_RECEIVE_INCOMING_SATS

    await createWalletViaUI(page)
    await enableArkadeFeature(page)
    await switchToSignet(page)
    await goToWalletTab(page, 'Dashboard')

    await waitForArkadeMockDashboardBalance(page)

    await goToReceiveArkadeMode(page)
    await waitForReceiveArkadeAddressReady(page)

    await simulateArkadeIncomingPayment(page, partitionId, {
      txid: E2E_ARKADE_MOCK_RECEIVE_INCOMING_TXID,
      amountSats: E2E_ARKADE_MOCK_RECEIVE_INCOMING_SATS,
      timestamp: 1_700_000_100,
    })

    await goToWalletTab(page, 'Dashboard')
    await waitForDashboardArkadeBalanceSats(page, expectedTotalSats)
    await waitForArkadeActivityLoaded(page)
    await expect(
      page.getByTestId(`arkade-payment-${E2E_ARKADE_MOCK_RECEIVE_INCOMING_TXID}`),
    ).toBeVisible()
  })

  test('ARK-RCV-02 receive address stable across lock and unlock', async ({ page }) => {
    test.setTimeout(ARKADE_MOCK_TEST_TIMEOUT_MS * 4)
    await createWalletViaUI(page)
    await enableArkadeFeature(page)
    await switchToSignet(page)

    await goToReceiveArkadeMode(page)
    const addressBeforeLock = await readReceiveArkadeAddress(page)

    await lockWalletFromManagementAndUnlock(page)
    await waitForDashboardArkadeSessionAfterUnlock(page, POST_UNLOCK_ARKADE_TIMEOUT_MS)
    await goToReceiveArkadeMode(page)
    await expect(async () => {
      expect(await readReceiveArkadeAddress(page)).toBe(addressBeforeLock)
    }).toPass({ timeout: POST_UNLOCK_ARKADE_TIMEOUT_MS })
  })

  test('ARK-RCV-04 generate new address persists across lock and unlock', async ({ page }) => {
    test.setTimeout(ARKADE_MOCK_TEST_TIMEOUT_MS * 4)
    await createWalletViaUI(page)
    await enableArkadeFeature(page)
    await switchToSignet(page)

    await goToReceiveArkadeMode(page)
    const initialAddress = await readReceiveArkadeAddress(page)

    await page.getByRole('button', { name: 'Generate New Address' }).click()
    await expect(async () => {
      const nextAddress = await readReceiveArkadeAddress(page)
      expect(nextAddress).not.toBe(initialAddress)
    }).toPass({ timeout: 15_000 })
    const revealedAddress = await readReceiveArkadeAddress(page)
    let wasmBeforeLock: { offchainNextDerivationIndex: number; peekAddress: string }
    await expect(async () => {
      wasmBeforeLock = await page.evaluate(() =>
        window.__E2E_ARKADE__!.readReceiveDebugSnapshot(),
      )
      const persistedBeforeLock = await page.evaluate(() =>
        window.__E2E_ARKADE__!.readPersistedReceiveDebugSnapshot(),
      )
      expect(wasmBeforeLock.peekAddress).toBe(revealedAddress)
      expect(persistedBeforeLock.offchainNextDerivationIndex).toBe(
        wasmBeforeLock.offchainNextDerivationIndex,
      )
    }).toPass({ timeout: 15_000 })

    await lockWalletFromManagementAndUnlock(page)
    await waitForArkadeWorkerReadyAfterUnlock(page, POST_UNLOCK_ARKADE_TIMEOUT_MS)
    await goToReceiveArkadeMode(page)
    await waitForReceiveArkadeAddressReady(page, POST_UNLOCK_ARKADE_TIMEOUT_MS)

    await expect(async () => {
      const uiAddress = await readReceiveArkadeAddress(page)
      const persistedAfterUnlock = await page.evaluate(() =>
        window.__E2E_ARKADE__!.readPersistedReceiveDebugSnapshot(),
      )
      const wasmAfterUnlock = await page.evaluate(() =>
        window.__E2E_ARKADE__!.readReceiveDebugSnapshot(),
      )
      expect(uiAddress).toBe(revealedAddress)
      expect(wasmAfterUnlock.peekAddress).toBe(revealedAddress)
      expect(persistedAfterUnlock.offchainNextDerivationIndex).toBe(
        wasmBeforeLock!.offchainNextDerivationIndex,
      )
      expect(wasmAfterUnlock.offchainNextDerivationIndex).toBe(
        wasmBeforeLock!.offchainNextDerivationIndex,
      )
    }).toPass({ timeout: POST_UNLOCK_ARKADE_TIMEOUT_MS })
  })
})
