import { expect, type Page } from '@playwright/test'
import { mineRegtestBlocks } from './arkade-regtest'
import { confirmStartUnilateralExitIfShown } from './arkade-unilateral-exit-start-confirm'
import { isUnilateralExitBranchCompleteInPage } from './arkade-unilateral-exit-branch-complete'

const MANUAL_UNROLL_DEADLINE_MS = 900_000
const MAX_PROCEED_CLICKS = 24
/** Fail fast when step progress does not advance after this many single-block mines. */
const MAX_MINES_WITHOUT_PROGRESS = 30
/** Fail fast when confirmation wait does not advance the step index (duration labels tick). */
const MAX_MINES_WAITING_FOR_CONFIRMATION = 30
const PROCEED_STEP_TIMEOUT_MS = 180_000

async function isBranchComplete(page: Page): Promise<boolean> {
  return isUnilateralExitBranchCompleteInPage(page)
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

/** Prefer WASM-backed data attributes; ignore ticking wait-duration labels. */
async function readStepProgressSignature(page: Page): Promise<string> {
  const progress = page.getByTestId('unilateral-exit-step-progress')
  if (!(await progress.isVisible())) {
    return ''
  }
  const stepIndex = await progress.getAttribute('data-step-index')
  const totalSteps = await progress.getAttribute('data-total-steps')
  const phase = await progress.getAttribute('data-progress-phase')
  if (stepIndex != null && totalSteps != null) {
    return `step:${stepIndex}/${totalSteps}:${phase ?? 'unknown'}`
  }
  return (await readStepProgressText(page)).replace(
    /\s+— waiting for confirmation \(.*\)$/i,
    ' — waiting for confirmation',
  )
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
  await confirmStartUnilateralExitIfShown(page)

  const deadlineMs = Date.now() + PROCEED_STEP_TIMEOUT_MS
  while (Date.now() < deadlineMs) {
    await assertNoUnilateralExitErrorToast(page)

    if (await isBranchComplete(page)) {
      return
    }

    if (await page.getByText('Unroll step submitted.').isVisible()) {
      return
    }

    const waitingForConfirmation = await page
      .getByTestId('unilateral-exit-step-progress')
      .getByText(/waiting for confirmation/i)
      .isVisible()
    if (waitingForConfirmation) {
      return
    }

    if (await proceedButton.isEnabled()) {
      // Success toast auto-dismisses quickly; a re-enabled Proceed button without an error
      // toast means the WASM step returned successfully.
      return
    }

    await page.waitForTimeout(250)
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
  let lastProgressSignature = await readStepProgressSignature(page)
  let minesWithoutProgress = 0
  let minesWaitingForConfirmation = 0

  while (Date.now() < deadlineMs) {
    if (await isBranchComplete(page)) {
      return
    }

    await assertNoUnilateralExitErrorToast(page)

    if ((await proceedButton.isVisible()) && (await proceedButton.isEnabled())) {
      if (proceedClicks >= MAX_PROCEED_CLICKS) {
        throw new Error(
          `Exceeded ${MAX_PROCEED_CLICKS} Proceed clicks without branch complete (last progress: "${lastProgressSignature}")`,
        )
      }
      await clickProceedAndWaitForStep(page)
      proceedClicks += 1
      if (await isBranchComplete(page)) {
        return
      }
      lastProgressSignature = await readStepProgressSignature(page)
      minesWithoutProgress = 0
      minesWaitingForConfirmation = 0
      await mineRegtestBlocks(2)
      if (await isBranchComplete(page)) {
        return
      }
      continue
    }

    const automationOn = await page.getByTestId('unilateral-exit-proceed-automatically').isChecked()
    if (automationOn) {
      throw new Error(
        'Unilateral exit automation is enabled — disable it for the manual REG-04 loop',
      )
    }

    if (await isProceedMutationPending(page)) {
      await page.waitForTimeout(250)
      continue
    }

    const waitingForConfirmation = await page
      .getByTestId('unilateral-exit-step-progress')
      .getByText(/waiting for confirmation/i)
      .isVisible()

    if (waitingForConfirmation) {
      await mineRegtestBlocks(1)
      const progressSignature = await readStepProgressSignature(page)
      if (progressSignature === lastProgressSignature) {
        minesWaitingForConfirmation += 1
        if (minesWaitingForConfirmation >= MAX_MINES_WAITING_FOR_CONFIRMATION) {
          throw new Error(
            `Unilateral unroll stuck waiting for confirmation after ${minesWaitingForConfirmation} mined blocks. ` +
              `Last progress: "${progressSignature || '(empty)'}"`,
          )
        }
      } else {
        lastProgressSignature = progressSignature
        minesWaitingForConfirmation = 0
      }
      continue
    }

    await mineRegtestBlocks(1)
    const progressSignature = await readStepProgressSignature(page)
    if (progressSignature === lastProgressSignature) {
      minesWithoutProgress += 1
      if (minesWithoutProgress >= MAX_MINES_WITHOUT_PROGRESS) {
        throw new Error(
          `Unilateral unroll stuck after ${minesWithoutProgress} mined blocks without step progress change. ` +
            `Last progress: "${progressSignature || '(empty)'}"`,
        )
      }
    } else {
      lastProgressSignature = progressSignature
      minesWithoutProgress = 0
    }
  }

  throw new Error('Manual unilateral unroll timed out before branch complete')
}
