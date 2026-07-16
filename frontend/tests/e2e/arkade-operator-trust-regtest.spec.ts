/**
 * Arkade operator trust (digest mismatch) against live arkd (arkade-regtest).
 *
 * Run: `npm run test:e2e:arkade-regtest-operator-trust` from `frontend/`.
 *
 * Contract: E2E-ARK-REG-06 — see doc/features/arkade-regtest-contract.yaml
 */
import { test, expect, type Page } from '@playwright/test'
import { prepareOperatorTrustBaseline } from './helpers/arkade-regtest-scenarios'
import {
  applyRegtestOperatorConfigTrustMismatch,
  OPERATOR_TRUST_REGTEST_BASELINE,
  OPERATOR_TRUST_REGTEST_MISMATCH,
  restartArkadeOperator,
} from './helpers/regtest'
import {
  triggerArkadeRailSync,
} from './helpers/dashboard-arkade'
import { goToWalletTab } from './helpers/wallet-nav'

const ARKADE_OPERATOR_TRUST_REGTEST_TIMEOUT_MS = 600_000

async function readOperatorTrustStatusForE2e(page: Page) {
  return page.evaluate(async () => {
    const readStatus = window.__e2eGetOperatorTrustStatus
    if (readStatus == null) {
      throw new Error('__e2eGetOperatorTrustStatus unavailable (DEV + VITE_E2E_ARKADE_REGTEST required)')
    }
    return readStatus()
  })
}

async function expectArkadeOperatorSyncSucceeded(page: Page): Promise<void> {
  await expect(page.getByTestId('wallet-sync-error-banner-arkade')).not.toBeVisible({
    timeout: 5_000,
  })
}

function autonomousModeSwitch(page: Page) {
  return page
    .getByTestId('arkade-autonomous-mode-switch')
    .getByRole('switch', { name: 'Autonomous mode' })
}

function operatorConfigDiffTable(page: Page) {
  return page.getByTestId('arkade-operator-config-diff-table')
}

async function expectDiffRow(
  page: Page,
  fieldLabel: string,
  acceptedValue: string,
  pendingValue: string,
): Promise<void> {
  const row = operatorConfigDiffTable(page).locator('tr').filter({ hasText: fieldLabel })
  await expect(row).toBeVisible()
  await expect(row.getByRole('cell', { name: acceptedValue })).toBeVisible()
  await expect(row.getByRole('cell', { name: pendingValue })).toBeVisible()
}

test.describe('Arkade operator trust regtest @arkade-operator-trust-regtest', () => {
  test.describe.configure({ mode: 'serial', timeout: ARKADE_OPERATOR_TRUST_REGTEST_TIMEOUT_MS })

  test.beforeEach(async () => {
    test.skip(
      process.env.VITE_E2E_ARKADE_REGTEST !== 'true',
      'Run with VITE_E2E_ARKADE_REGTEST=true (npm run test:e2e:arkade-regtest-operator-trust).',
    )
    await restartArkadeOperator()
  })

  test('E2E-ARK-REG-06 operator trust review in autonomous mode then accept', async ({
    page,
  }) => {
    await prepareOperatorTrustBaseline(page)

    const baselineInfoResponse = await fetch('http://localhost:7070/v1/info')
    const baselineInfo = (await baselineInfoResponse.json()) as {
      digest: string
      sessionDuration: string
      unilateralExitDelay: string
      boardingExitDelay: string
    }
    const trustBeforeApply = await readOperatorTrustStatusForE2e(page)
    expect(trustBeforeApply.acceptedDigest).toBe(baselineInfo.digest)
    expect(baselineInfo.sessionDuration).toBe(
      String(OPERATOR_TRUST_REGTEST_BASELINE.sessionDuration),
    )
    expect(baselineInfo.unilateralExitDelay).toBe(
      String(OPERATOR_TRUST_REGTEST_BASELINE.unilateralExitDelay),
    )
    expect(baselineInfo.boardingExitDelay).toBe(
      String(OPERATOR_TRUST_REGTEST_BASELINE.boardingExitDelay),
    )

    await expect(
      page.getByRole('heading', { name: 'Operator configuration changed' }),
    ).not.toBeVisible()

    await applyRegtestOperatorConfigTrustMismatch()

    const mismatchInfoResponse = await fetch('http://localhost:7070/v1/info')
    const mismatchInfo = (await mismatchInfoResponse.json()) as { digest: string }
    expect(mismatchInfo.digest).not.toBe(baselineInfo.digest)

    await goToWalletTab(page, 'Dashboard')
    await triggerArkadeRailSync(page, 120_000)
    await expectArkadeOperatorSyncSucceeded(page)
    await goToWalletTab(page, 'Management')

    const trustStatusAfterSync = await readOperatorTrustStatusForE2e(page)
    expect(
      trustStatusAfterSync.operatorTrustPending,
      `operator trust not pending after sync: ${JSON.stringify(trustStatusAfterSync)}`,
    ).toBe(true)

    await expect(async () => {
      await expect(
        page.getByRole('heading', { name: 'Operator configuration changed' }),
      ).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 90_000 })

    const trustModal = page.getByRole('dialog')

    await trustModal
      .getByRole('button', { name: 'Review changes safely in autonomous mode' })
      .click()

    await expect(trustModal).not.toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('arkade-operator-trust-review-banner')).toBeVisible({
      timeout: 30_000,
    })
    await expect(autonomousModeSwitch(page)).toHaveAttribute('aria-checked', 'true', {
      timeout: 30_000,
    })

    await expect(operatorConfigDiffTable(page)).toBeVisible()
    await expect(operatorConfigDiffTable(page).getByRole('columnheader', { name: 'Setting' })).toBeVisible()
    await expect(
      operatorConfigDiffTable(page).getByRole('columnheader', { name: 'Current (trusted)' }),
    ).toBeVisible()
    await expect(
      operatorConfigDiffTable(page).getByRole('columnheader', { name: 'Proposed (ASP)' }),
    ).toBeVisible()

    await expectDiffRow(
      page,
      'Session duration (seconds)',
      String(OPERATOR_TRUST_REGTEST_BASELINE.sessionDuration),
      String(OPERATOR_TRUST_REGTEST_MISMATCH.sessionDuration),
    )
    await expectDiffRow(
      page,
      'Unilateral exit delay (blocks)',
      String(OPERATOR_TRUST_REGTEST_BASELINE.unilateralExitDelay),
      String(OPERATOR_TRUST_REGTEST_MISMATCH.unilateralExitDelay),
    )
    await expectDiffRow(
      page,
      'Boarding exit delay (blocks)',
      String(OPERATOR_TRUST_REGTEST_BASELINE.boardingExitDelay),
      String(OPERATOR_TRUST_REGTEST_MISMATCH.boardingExitDelay),
    )

    await page
      .getByTestId('arkade-operator-trust-review-banner')
      .getByRole('button', { name: 'Trust Arkade operator and accept changes' })
      .click()

    await expect(page.getByTestId('arkade-operator-trust-review-banner')).not.toBeVisible({
      timeout: 120_000,
    })
    await expect(autonomousModeSwitch(page)).toHaveAttribute('aria-checked', 'false', {
      timeout: 30_000,
    })
    await expect(
      page.getByRole('heading', { name: 'Operator configuration changed' }),
    ).not.toBeVisible()

    const trustStatusAfterAccept = await readOperatorTrustStatusForE2e(page)
    expect(trustStatusAfterAccept.operatorTrustPending).toBe(false)
    expect(trustStatusAfterAccept.pendingDigest).toBeUndefined()
    expect(trustStatusAfterAccept.acceptedDigest).toBe(mismatchInfo.digest)
  })
})
