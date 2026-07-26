import { expect, type Page } from '@playwright/test'
import { mineRegtestBlocks } from './arkade-regtest'

const AUTOMATIC_UNROLL_DEADLINE_MS = 900_000

async function isBranchComplete(page: Page): Promise<boolean> {
  if (await page.getByTestId('unilateral-exit-step-progress').getByText(/branch complete/i).isVisible()) {
    return true
  }
  return page.getByText('Unilateral exit branch complete.').isVisible()
}

async function readStepProgressText(page: Page): Promise<string> {
  const progress = page.getByTestId('unilateral-exit-step-progress')
  if (!(await progress.isVisible())) {
    return ''
  }
  return (await progress.textContent())?.trim() ?? ''
}

async function assertNoAutomationOrExitError(page: Page): Promise<void> {
  const paused = page.getByTestId('unilateral-exit-automation-paused')
  if (await paused.isVisible()) {
    throw new Error((await paused.textContent())?.trim() ?? 'Automatic unilateral exit paused')
  }

  const errorToast = page
    .locator('[data-sonner-toast][data-type="error"]')
    .filter({ hasText: /unilateral exit|unroll|automatic|client|failed|not eligible/i })
  if (await errorToast.count()) {
    throw new Error((await errorToast.first().textContent())?.trim() ?? 'Unilateral exit failed')
  }
}

async function ensureAutomaticUnilateralExitMode(page: Page): Promise<void> {
  const autoSwitch = page.getByTestId('unilateral-exit-proceed-automatically')
  await expect(autoSwitch).toBeVisible({ timeout: 60_000 })
  if (!(await autoSwitch.isChecked())) {
    await autoSwitch.click()
  }
  await expect(autoSwitch).toBeChecked()

  const mediumFeeButton = page.getByRole('button', { name: /Medium/i })
  await expect(async () => {
    await mediumFeeButton.click()
    await expect(page.getByTestId('unilateral-exit-batch-fee')).toBeVisible({ timeout: 5_000 })
    const batchFeeText = (await page.getByTestId('unilateral-exit-batch-fee').textContent()) ?? ''
    if (/bumper/i.test(batchFeeText) && /insufficient/i.test(batchFeeText)) {
      throw new Error(`Bumper still insufficient after funding: ${batchFeeText}`)
    }
  }).toPass({ timeout: 120_000 })

  const startButton = page.getByTestId('unilateral-exit-proceed')
  await expect(startButton).toBeEnabled({ timeout: 120_000 })
}

/**
 * Enable Proceed automatically, click Start unroll once, mine while the background runner and WASM
 * advance each virtual step until branch complete.
 */
export async function runAutomaticUnilateralUnrollUntilBranchComplete(page: Page): Promise<void> {
  await ensureAutomaticUnilateralExitMode(page)

  const startButton = page.getByTestId('unilateral-exit-proceed')
  await startButton.click()

  const deadlineMs = Date.now() + AUTOMATIC_UNROLL_DEADLINE_MS
  let sawProceedingAutomatically = false

  while (Date.now() < deadlineMs) {
    await assertNoAutomationOrExitError(page)

    if (await isBranchComplete(page)) {
      return
    }

    const progressText = await readStepProgressText(page)
    if (/proceeding automatically|waiting for confirmation/i.test(progressText)) {
      sawProceedingAutomatically = true
    }

    if ((await startButton.isVisible()) && (await startButton.isEnabled())) {
      throw new Error(
        'Manual Start/Proceed re-enabled during automation — runner should advance steps without extra clicks',
      )
    }

    await mineRegtestBlocks(1)
  }

  throw new Error(
    `Automatic unilateral unroll timed out before branch complete (last progress: "${await readStepProgressText(page)}", sawAutomationProgress: ${sawProceedingAutomatically})`,
  )
}
