import { expect, type Page } from '@playwright/test'
import { mineRegtestBlocks } from './arkade-regtest'

const MANUAL_UNROLL_DEADLINE_MS = 900_000
const MAX_PROCEED_CLICKS = 24
/** Fail fast when step progress does not advance after this many single-block mines. */
const MAX_MINES_WITHOUT_PROGRESS = 30
const PROCEED_STEP_TIMEOUT_MS = 180_000

async function isBranchComplete(page: Page): Promise<boolean> {
  return page.getByTestId('unilateral-exit-step-progress').getByText(/branch complete/i).isVisible()
}

async function ensureManualUnilateralExitMode(page: Page): Promise<void> {
  const autoSwitch = page.getByTestId('unilateral-exit-proceed-automatically')
  if ((await autoSwitch.count()) > 0 && (await autoSwitch.isChecked())) {
    await autoSwitch.click()
    await expect(autoSwitch).not.toBeChecked()
  }
}

async function readStepProgressText(page: Page): Promise<string> {
  const progress = page.getByTestId('unilateral-exit-step-progress')
  if (!(await progress.isVisible())) {
    return ''
  }
  return (await progress.textContent())?.trim() ?? ''
}

async function assertNoUnilateralExitErrorToast(page: Page): Promise<void> {
  const errorToast = page
    .locator('[data-sonner-toast][data-type="error"]')
    .filter({ hasText: /unroll|client|failed/i })
  if (await errorToast.count()) {
    throw new Error((await errorToast.first().textContent())?.trim() ?? 'Unilateral exit failed')
  }
}

async function isProceedMutationPending(page: Page): Promise<boolean> {
  const proceedButton = proceedButtonLocator(page)
  if (!(await proceedButton.isVisible())) {
    return false
  }
  return proceedButton.locator('.animate-spin').isVisible()
}

async function clickProceedAndWaitForStep(page: Page): Promise<void> {
  const proceedButton = page.getByTestId('unilateral-exit-proceed')
  await proceedButton.click()

  const deadlineMs = Date.now() + PROCEED_STEP_TIMEOUT_MS
  while (Date.now() < deadlineMs) {
    await assertNoUnilateralExitErrorToast(page)

    if (await page.getByText('Unroll step submitted.').isVisible()) {
      return
    }

    if (await proceedButton.isEnabled()) {
      // Success toast auto-dismisses quickly; a re-enabled Proceed button without an error
      // toast means the WASM step returned successfully.
      return
    }

    await mineRegtestBlocks(1)
  }

  throw new Error('Proceed step timed out waiting for confirmation')
}

function proceedButtonLocator(page: Page) {
  return page.getByTestId('unilateral-exit-proceed')
}

async function refreshBatchEstimateAfterBumperFunding(page: Page): Promise<void> {
  const mediumFeeButton = page.getByRole('button', { name: /Medium/i })
  await mediumFeeButton.click()
  await expect(page.getByTestId('unilateral-exit-batch-fee')).toBeVisible({ timeout: 60_000 })
  await expect(proceedButtonLocator(page)).toBeEnabled({ timeout: 120_000 })
}

/**
 * Step-based unilateral unroll: click Proceed for each virtual-tree step, mine while WASM waits
 * for 1-conf, repeat until branch complete.
 */
export async function runManualUnilateralUnrollUntilBranchComplete(page: Page): Promise<void> {
  await ensureManualUnilateralExitMode(page)
  await refreshBatchEstimateAfterBumperFunding(page)

  const proceedButton = proceedButtonLocator(page)
  await expect(proceedButton).toBeVisible({ timeout: 120_000 })
  await expect(proceedButton).toBeEnabled({ timeout: 120_000 })

  const deadlineMs = Date.now() + MANUAL_UNROLL_DEADLINE_MS
  let proceedClicks = 0
  let lastProgressText = await readStepProgressText(page)
  let minesWithoutProgress = 0

  while (Date.now() < deadlineMs) {
    if (await isBranchComplete(page)) {
      return
    }

    await assertNoUnilateralExitErrorToast(page)

    if ((await proceedButton.isVisible()) && (await proceedButton.isEnabled())) {
      if (proceedClicks >= MAX_PROCEED_CLICKS) {
        throw new Error(
          `Exceeded ${MAX_PROCEED_CLICKS} Proceed clicks without branch complete (last progress: "${lastProgressText}")`,
        )
      }
      await clickProceedAndWaitForStep(page)
      proceedClicks += 1
      lastProgressText = await readStepProgressText(page)
      minesWithoutProgress = 0
      await mineRegtestBlocks(2)
      continue
    }

    const automationOn = await page.getByTestId('unilateral-exit-proceed-automatically').isChecked()
    if (automationOn) {
      throw new Error(
        'Unilateral exit automation is enabled — disable it for the manual REG-04 loop',
      )
    }

    const waitingForConfirmation = await page
      .getByTestId('unilateral-exit-step-progress')
      .getByText(/waiting for confirmation/i)
      .isVisible()

    if ((await isProceedMutationPending(page)) || waitingForConfirmation) {
      await mineRegtestBlocks(1)
      continue
    }

    await mineRegtestBlocks(1)
    const progressText = await readStepProgressText(page)
    if (progressText === lastProgressText) {
      minesWithoutProgress += 1
      if (minesWithoutProgress >= MAX_MINES_WITHOUT_PROGRESS) {
        throw new Error(
          `Unilateral unroll stuck after ${minesWithoutProgress} mined blocks without step progress change. ` +
            `Last progress: "${progressText || '(empty)'}"`,
        )
      }
    } else {
      lastProgressText = progressText
      minesWithoutProgress = 0
    }
  }

  throw new Error('Manual unilateral unroll timed out before branch complete')
}
