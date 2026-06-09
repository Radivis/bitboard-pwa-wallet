/**
 * Arkade Infomode E2E — tap explainer zones when Arkade mock is active.
 *
 * Run: `npm run test:e2e:arkade` from `frontend/`.
 */
import { test, expect } from '@playwright/test'
import { createWalletViaUI, expectNoInitialWalletSyncErrorToast } from './helpers/wallet-setup'
import { goToWalletTab } from './helpers/wallet-nav'
import { enableArkadeFeature, switchToSignet } from './helpers/arkade-settings'
import {
  buildArkadeMockPartitionId,
  installArkadeMockIsolation,
} from './helpers/arkade-mock-isolation'
import {
  expectArkadeBalanceNotEmptySession,
  waitForArkadeWasmSessionReady,
} from './helpers/dashboard-arkade'

const ARKADE_INFOMODE_TEST_TIMEOUT_MS = process.env.CI ? 120_000 : 90_000

test.describe('Arkade Infomode @arkade', () => {
  test.describe.configure({ timeout: ARKADE_INFOMODE_TEST_TIMEOUT_MS })

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

  test('dashboard and management Arkade infomode popups link to Library', async ({ page }) => {
    await createWalletViaUI(page)
    await expectNoInitialWalletSyncErrorToast(page)

    await enableArkadeFeature(page)
    await switchToSignet(page)
    await waitForArkadeWasmSessionReady(page)

    await goToWalletTab(page, 'Dashboard')
    await expectArkadeBalanceNotEmptySession(page)

    const infomodeDialog = page.getByRole('dialog', { name: 'Infomode explanation' })

    await page.getByRole('button', { name: 'Turn on infomode' }).click()
    await expect(page.getByText('Infomode on')).toBeVisible()

    await page.locator('[data-infomode-id="arkade-dashboard-balance"]').click()
    await expect(infomodeDialog).toBeVisible()
    await expect(infomodeDialog.getByRole('heading', { name: 'Arkade balance' })).toBeVisible()
    await expect(
      infomodeDialog.getByRole('link', { name: 'Arkade in Bitboard Wallet' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Close explanation' }).click()

    await goToWalletTab(page, 'Management')
    await page.locator('[data-infomode-id="arkade-management-panel"]').click()
    await expect(infomodeDialog).toBeVisible()
    await expect(infomodeDialog.getByRole('heading', { name: 'Arkade balance' })).toBeVisible()
    await expect(
      infomodeDialog.getByRole('link', { name: 'What is a VTXO?' }),
    ).toBeVisible()
  })
})
