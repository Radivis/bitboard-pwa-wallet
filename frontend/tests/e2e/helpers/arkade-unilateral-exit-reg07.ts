import { expect, type Page } from '@playwright/test'
import { ensureOnChainBumperFunds } from './arkade-management'
import { mineRegtestBlocks } from './arkade-regtest'

const AUTOMATIC_UNROLL_DEADLINE_MS = 900_000
const MAX_MINES_WITHOUT_PROGRESS = 60
/** Two sibling preconfirmed outpoints need more bumper headroom than a single-leaf REG-04 run. */
const REG07_BUMPER_FUNDING_SATS = 500_000

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

async function batchFeeShowsInsufficientBumper(page: Page): Promise<boolean> {
  const batchFee = page.getByTestId('unilateral-exit-batch-fee')
  if (!(await batchFee.isVisible())) {
    return false
  }
  const batchFeeText = (await batchFee.textContent()) ?? ''
  return /bumper/i.test(batchFeeText) && /insufficient/i.test(batchFeeText)
}

async function waitForBumperFundingGateToClear(page: Page, timeout = 120_000): Promise<void> {
  await expect(async () => {
    if (await batchFeeShowsInsufficientBumper(page)) {
      const batchFeeText = (await page.getByTestId('unilateral-exit-batch-fee').textContent()) ?? ''
      throw new Error(`Bumper still insufficient: ${batchFeeText}`)
    }
  }).toPass({ timeout })
}

async function topUpBumperAndRefreshBatchEstimate(page: Page): Promise<void> {
  await mineRegtestBlocks(2)
  await ensureOnChainBumperFunds(page, REG07_BUMPER_FUNDING_SATS)
  await waitForBumperFundingGateToClear(page)
  await page.getByRole('button', { name: /Medium/i }).click()
  await waitForBumperFundingGateToClear(page)
}

async function isAutomationPaused(page: Page): Promise<boolean> {
  return page.getByTestId('unilateral-exit-automation-paused').isVisible()
}

/** Returns true when automation was paused and we attempted recovery. */
async function recoverFromAutomationPauseIfNeeded(page: Page): Promise<boolean> {
  if (!(await isAutomationPaused(page))) {
    return false
  }

  const paused = page.getByTestId('unilateral-exit-automation-paused')
  const pauseText = ((await paused.textContent()) ?? '').trim()
  const broadcastRetryable = /sendrawtransaction|code.:.-26/i.test(pauseText)
  if (pauseText && !/insufficient bumper/i.test(pauseText) && !broadcastRetryable) {
    throw new Error(pauseText || 'Automatic unilateral exit paused')
  }

  await topUpBumperAndRefreshBatchEstimate(page)
  await expect(paused).not.toBeVisible({ timeout: 60_000 })
  return true
}

async function assertNoAutomationOrExitError(page: Page): Promise<void> {
  if (await isAutomationPaused(page)) {
    throw new Error(
      ((await page.getByTestId('unilateral-exit-automation-paused').textContent()) ?? '').trim() ||
        'Automatic unilateral exit paused',
    )
  }

  const errorToast = page
    .locator('[data-sonner-toast][data-type="error"]')
    .filter({ hasText: /unilateral exit|unroll|client|failed|not eligible/i })
    .filter({ hasNotText: /paused/i })
  if (await errorToast.count()) {
    throw new Error((await errorToast.first().textContent())?.trim() ?? 'Unilateral exit failed')
  }
}

/** Select every leaf node on the unilateral exit tree graph for a multi-VTXO batch. */
export async function selectAllUnilateralExitLeafNodes(page: Page): Promise<void> {
  const leafNodes = page.locator('[data-testid^="unilateral-exit-leaf-node-"]')
  await expect(leafNodes.first()).toBeVisible({ timeout: 120_000 })
  const leafCount = await leafNodes.count()
  if (leafCount === 0) {
    throw new Error('No leaf nodes visible on unilateral exit tree graph')
  }

  for (let index = 0; index < leafCount; index += 1) {
    await leafNodes.nth(index).click()
    const leafSelectSwitch = page.getByTestId('unilateral-exit-leaf-select-switch')
    if (!(await leafSelectSwitch.isChecked())) {
      await leafSelectSwitch.click()
    }
    await expect(leafSelectSwitch).toBeChecked()
  }
}

async function ensureAutomaticUnilateralExitMode(page: Page): Promise<void> {
  const autoSwitch = page.getByTestId('unilateral-exit-proceed-automatically')
  await expect(autoSwitch).toBeVisible({ timeout: 60_000 })
  if (!(await autoSwitch.isChecked())) {
    await autoSwitch.click()
  }
  await expect(autoSwitch).toBeChecked()
  await topUpBumperAndRefreshBatchEstimate(page)

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
  let lastProgressText = await readStepProgressText(page)
  let minesWithoutProgress = 0

  while (Date.now() < deadlineMs) {
    const recoveredFromPause = await recoverFromAutomationPauseIfNeeded(page)
    if (recoveredFromPause) {
      minesWithoutProgress = 0
      lastProgressText = await readStepProgressText(page)
    } else if (await batchFeeShowsInsufficientBumper(page)) {
      await topUpBumperAndRefreshBatchEstimate(page)
      minesWithoutProgress = 0
      lastProgressText = await readStepProgressText(page)
    }

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

    if (progressText === lastProgressText) {
      minesWithoutProgress += 1
      if (minesWithoutProgress >= MAX_MINES_WITHOUT_PROGRESS) {
        throw new Error(
          `Automatic unilateral unroll stuck after ${minesWithoutProgress} mined blocks without step progress change. ` +
            `Last progress: "${progressText || '(empty)'}"`,
        )
      }
    } else {
      lastProgressText = progressText
      minesWithoutProgress = 0
    }

    await mineRegtestBlocks(2)
  }

  throw new Error(
    `Automatic unilateral unroll timed out before branch complete (last progress: "${await readStepProgressText(page)}", sawAutomationProgress: ${sawProceedingAutomatically})`,
  )
}

export { REG07_BUMPER_FUNDING_SATS }
