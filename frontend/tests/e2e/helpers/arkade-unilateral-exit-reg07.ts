import { expect, type Page } from '@playwright/test'
import { ensureOnChainBumperFunds } from './arkade-management'
import { formatUnilateralExitFailure } from './esplora-unilateral-exit-diagnostics'
import { mineRegtestBlocks } from './arkade-regtest'
import { confirmStartUnilateralExitIfShown } from './arkade-unilateral-exit-start-confirm'

/** Inner loop budget; must stay below the Playwright per-test timeout. */
const AUTOMATIC_UNROLL_DEADLINE_MS = 240_000
/** ~40 blocks without a step change (2 blocks per iteration). */
const MAX_MINES_WITHOUT_PROGRESS = 20
/** Advancing-phase cycles before recovery (500ms tail sleep per loop iteration). */
const ADVANCING_STUCK_RECOVERY_CYCLES = 24
const MAX_AUTOMATION_RECOVERY_ATTEMPTS = 5
/** Chained 5-step unroll spends far more bumper than the batch estimate suggests (large parent vsizes). */
const REG07_BUMPER_FUNDING_SATS = 10_000_000
const MIN_BUMPER_BALANCE_SATS = 50_000
/** Transient regtest indexer lag; mine and resume. Treat RPC -25/-26 as retryable when rebroadcasting or bumper is depleted. */
const RETRYABLE_INDEXER_ERROR_PATTERN =
  /code.:.-26|code.:.-25|txn-already-in-mempool|outspends|failed to get transaction|error sending request|request failed/i

function isRetryableIndexerError(message: string): boolean {
  return RETRYABLE_INDEXER_ERROR_PATTERN.test(message)
}

function isRecoverableAutomationPause(message: string): boolean {
  return (
    /insufficient bumper/i.test(message) ||
    isRetryableIndexerError(message) ||
    /sendrawtransaction RPC error.*-25|sendrawtransaction RPC error.*-26|code.:.-25|code.:.-26/i.test(
      message,
    ) ||
    /bad-txns-inputs-missingorspent/i.test(message) ||
    /insufficient fee, rejecting replacement/i.test(message)
  )
}

async function failUnilateralExit(page: Page, message: string): Promise<never> {
  throw new Error(await formatUnilateralExitFailure(page, message))
}

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

/** Prefer WASM-backed data attributes over visible text (batch-estimate fallback can lie). */
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
  return normalizeStepProgressForComparison(await readStepProgressText(page))
}

async function isWaitingForStepConfirmation(page: Page): Promise<boolean> {
  const progress = page.getByTestId('unilateral-exit-step-progress')
  if (!(await progress.isVisible())) {
    return false
  }
  const progressPhase = await progress.getAttribute('data-progress-phase')
  if (progressPhase === 'waiting') {
    return true
  }
  if (await progress.getByText(/waiting for confirmation/i).isVisible()) {
    return true
  }
  const stepRelayed = await progress.getAttribute('data-step-relayed')
  return stepRelayed === 'true'
}

/** Ignore ticking wait-duration labels so stuck detection cannot be reset every second. */
function normalizeStepProgressForComparison(progressText: string): string {
  return progressText
    .replace(/\s+\(proceeding automatically\)$/i, '')
    .replace(/\s+— waiting for confirmation \(.*\)$/i, '')
    .replace(/\s+— proceeding automatically$/i, '')
    .trim()
}

async function batchFeeShowsInsufficientBumper(page: Page): Promise<boolean> {
  const bumperBalance = page.getByTestId('unilateral-exit-bumper-balance')
  if (!(await bumperBalance.isVisible())) {
    return false
  }
  const insufficientBanner = page.getByText('Insufficient bumper balance.')
  return await insufficientBanner.isVisible()
}

async function bumperNeedsTopUp(page: Page): Promise<boolean> {
  if (await batchFeeShowsInsufficientBumper(page)) {
    return true
  }
  const balanceSats = await readBumperBalanceSatsWithRefresh(page)
  return balanceSats != null && balanceSats < MIN_BUMPER_BALANCE_SATS
}

async function isOnLastUnilateralExitStep(page: Page): Promise<boolean> {
  const progress = page.getByTestId('unilateral-exit-step-progress')
  if (!(await progress.isVisible())) {
    return false
  }
  const stepIndex = Number(await progress.getAttribute('data-step-index') ?? -1)
  const totalSteps = Number(await progress.getAttribute('data-total-steps') ?? 0)
  return stepIndex >= 0 && totalSteps > 0 && stepIndex >= totalSteps - 1
}

async function refreshBumperBalanceFromWorker(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const refresh = window.__e2eRefreshOnchainBumperInfo
    if (refresh == null) {
      return null
    }
    return refresh()
  })
}

async function readBumperBalanceSatsWithRefresh(page: Page): Promise<number | null> {
  const balanceFromWorker = await refreshBumperBalanceFromWorker(page)
  if (balanceFromWorker != null) {
    return balanceFromWorker
  }
  await page.getByRole('button', { name: /Medium/i }).click()
  return readBumperBalanceSats(page)
}

async function waitForBumperBalanceAtLeast(
  page: Page,
  minSats: number,
  timeout = 180_000,
): Promise<void> {
  await expect(async () => {
    const balanceSats = await readBumperBalanceSatsWithRefresh(page)
    if (balanceSats == null || balanceSats < minSats) {
      throw new Error(
        `Bumper balance ${balanceSats ?? 'unavailable'} below ${minSats} sats`,
      )
    }
  }).toPass({ timeout })
}

async function waitForBumperFundingGateToClear(page: Page, timeout = 180_000): Promise<void> {
  await expect(async () => {
    const balanceSats = await readBumperBalanceSatsWithRefresh(page)
    if (balanceSats == null || balanceSats < MIN_BUMPER_BALANCE_SATS) {
      throw new Error(
        `Bumper balance ${balanceSats ?? 'unavailable'} below ${MIN_BUMPER_BALANCE_SATS} sats`,
      )
    }
    if (await batchFeeShowsInsufficientBumper(page)) {
      throw new Error('Insufficient bumper balance banner still visible')
    }
  }).toPass({ timeout })
}

/** Wait until WASM bumper sync and batch estimate gate show funded bumper (after on-chain fund). */
export async function waitForBumperBalanceReady(
  page: Page,
  minSats = MIN_BUMPER_BALANCE_SATS,
): Promise<void> {
  await waitForBumperBalanceAtLeast(page, minSats)
  await waitForBumperFundingGateToClear(page)
}

async function refreshBatchEstimate(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Medium/i }).click()
  await waitForBumperFundingGateToClear(page)
}

async function readBumperBalanceSats(page: Page): Promise<number | null> {
  const bumperBalance = page.getByTestId('unilateral-exit-bumper-balance')
  if (!(await bumperBalance.isVisible())) {
    return null
  }
  const text = (await bumperBalance.textContent()) ?? ''
  const match = text.match(/([\d.]+)/)
  if (match == null) {
    return null
  }
  return Math.round(parseFloat(match[1]) * 100_000_000)
}

async function topUpBumperIfDepleted(page: Page, bumperTopUps: { count: number }): Promise<boolean> {
  const pauseText = await readAutomationPauseText(page)
  const pausedForBumper = pauseText?.toLowerCase().includes('insufficient bumper') ?? false
  const needsTopUp = pausedForBumper || (await bumperNeedsTopUp(page))
  if (!needsTopUp) {
    return false
  }

  bumperTopUps.count += 1
  if (bumperTopUps.count > 5) {
    throw new Error(
      `Bumper recovery failed after ${bumperTopUps.count} top-ups (last pause: ${pauseText ?? 'insufficient banner'})`,
    )
  }
  await topUpBumperAndRefreshBatchEstimate(page)
  return true
}

async function topUpBumperAndRefreshBatchEstimate(page: Page): Promise<void> {
  await mineRegtestBlocks(2)
  await ensureOnChainBumperFunds(page, REG07_BUMPER_FUNDING_SATS)
  await waitForBumperBalanceAtLeast(page, MIN_BUMPER_BALANCE_SATS)
  await refreshBatchEstimate(page)
}

async function readExitErrorToastText(page: Page): Promise<string | null> {
  const errorToast = page
    .locator('[data-sonner-toast][data-type="error"]')
    .filter({ hasText: /unilateral exit|unroll|client|failed|not eligible/i })
    .filter({ hasNotText: /paused/i })
  if ((await errorToast.count()) === 0) {
    return null
  }
  return (await errorToast.first().textContent())?.trim() ?? null
}

async function readAutomationPauseText(page: Page): Promise<string | null> {
  if (!(await isAutomationPaused(page))) {
    return null
  }
  return ((await page.getByTestId('unilateral-exit-automation-paused').textContent()) ?? '').trim() || null
}

async function isAutomationPaused(page: Page): Promise<boolean> {
  return page.getByTestId('unilateral-exit-automation-paused').isVisible()
}

async function clearAutomationPause(page: Page): Promise<void> {
  await refreshBatchEstimate(page)
  await page.evaluate(() => {
    const resume = window.__e2eResumeUnilateralExitAutomation
    if (resume != null) {
      resume()
    }
  })
  await expect(page.getByTestId('unilateral-exit-automation-paused')).not.toBeVisible({
    timeout: 60_000,
  })
  await expect
    .poll(async () => readExitErrorToastText(page), { timeout: 15_000 })
    .toBeNull()
}

/** Returns true when automation was paused or errored and we attempted recovery. */
async function recoverFromRetryableAutomationFailure(
  page: Page,
  recoveryAttempts: { count: number },
): Promise<boolean> {
  const pauseText = await readAutomationPauseText(page)
  const toastText = await readExitErrorToastText(page)
  const failureText = pauseText ?? toastText

  if (failureText == null) {
    return false
  }

  if (!isRecoverableAutomationPause(failureText)) {
    await failUnilateralExit(page, failureText || 'Automatic unilateral exit failed')
  }

  recoveryAttempts.count += 1
  if (recoveryAttempts.count > MAX_AUTOMATION_RECOVERY_ATTEMPTS) {
    await failUnilateralExit(
      page,
      `Automatic unilateral exit failed after ${MAX_AUTOMATION_RECOVERY_ATTEMPTS} recovery attempts: ${failureText}`,
    )
  }

  if (/insufficient bumper/i.test(failureText)) {
    await topUpBumperAndRefreshBatchEstimate(page)
    await expect(page.getByTestId('unilateral-exit-automation-paused')).not.toBeVisible({
      timeout: 180_000,
    })
  } else if (/sendrawtransaction RPC error|code.:.-2[56]/i.test(failureText)) {
    await mineRegtestBlocks(5)
    if ((await readBumperBalanceSatsWithRefresh(page) ?? 0) < MIN_BUMPER_BALANCE_SATS) {
      await topUpBumperAndRefreshBatchEstimate(page)
    }
  } else {
    await mineRegtestBlocks(5)
  }

  await clearAutomationPause(page)
  return true
}

async function assertNoAutomationOrExitError(page: Page): Promise<void> {
  const pauseText = await readAutomationPauseText(page)
  if (pauseText != null) {
    if (isRecoverableAutomationPause(pauseText)) {
      return
    }
    await failUnilateralExit(page, pauseText)
  }

  const toastText = await readExitErrorToastText(page)
  if (toastText != null) {
    if (isRecoverableAutomationPause(toastText)) {
      return
    }
    await failUnilateralExit(page, toastText)
  }
}

/** Select every leaf node on the unilateral exit tree graph for a multi-VTXO batch. */
export async function selectAllUnilateralExitLeafNodes(page: Page): Promise<number> {
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

  return leafCount
}

/**
 * Intermediate virtual txs may still host exitable VTXO outpoints after a chained self-send,
 * but only terminal branch leaves may be selected for unilateral exit.
 */
export async function assertIntermediateNodesShowExitableOutpointsButAreNotLeafSelection(
  page: Page,
  preconfirmedVtxoCount: number,
): Promise<void> {
  const graph = page.getByTestId('unilateral-exit-tree-graph')
  await expect(graph).toBeVisible({ timeout: 120_000 })

  const leafHostCount = await graph.locator('[data-testid^="unilateral-exit-leaf-node-"]').count()
  expect(
    preconfirmedVtxoCount,
    'Expected more preconfirmed VTXOs than terminal leaf hosts (upstream hosts must be excluded)',
  ).toBeGreaterThan(leafHostCount)

  const intermediateGraphNodes = graph.locator('[data-testid^="unilateral-exit-node-"]')
  await expect(intermediateGraphNodes.first()).toBeVisible({ timeout: 120_000 })

  const intermediateCount = await intermediateGraphNodes.count()
  let intermediateHostsVerified = 0

  for (let index = 0; index < intermediateCount; index += 1) {
    const node = intermediateGraphNodes.nth(index)
    const nodeLabel = await node.getAttribute('aria-label')
    if (nodeLabel !== 'ark node' && nodeLabel !== 'tree node') {
      continue
    }
    if ((await node.getByLabel(/exitable VTXO/i).count()) === 0) {
      continue
    }
    await node.click()
    await expect(page.getByTestId('unilateral-exit-node-detail')).toBeVisible({ timeout: 30_000 })
    const showsNodeOutpoints = await page.getByText('VTXO outpoints on this node').isVisible()
    const leafSelectVisible = await page
      .getByTestId('unilateral-exit-leaf-select-switch')
      .isVisible()
    if (showsNodeOutpoints && !leafSelectVisible) {
      intermediateHostsVerified += 1
    }
  }

  expect(
    intermediateHostsVerified,
    'Expected at least one intermediate ark/tree host with exitable VTXO outpoints that cannot be selected for exit',
  ).toBeGreaterThanOrEqual(1)
}

async function ensureAutomaticUnilateralExitMode(page: Page): Promise<void> {
  const autoSwitch = page.getByTestId('unilateral-exit-proceed-automatically')
  await expect(autoSwitch).toBeVisible({ timeout: 60_000 })
  if (!(await autoSwitch.isChecked())) {
    await autoSwitch.click()
  }
  await expect(autoSwitch).toBeChecked()

  const balanceSats = await readBumperBalanceSatsWithRefresh(page)
  const needsFunding =
    balanceSats == null ||
    balanceSats < MIN_BUMPER_BALANCE_SATS ||
    (await batchFeeShowsInsufficientBumper(page))
  if (needsFunding) {
    await topUpBumperAndRefreshBatchEstimate(page)
  } else {
    await waitForBumperFundingGateToClear(page)
  }

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
  await confirmStartUnilateralExitIfShown(page)

  await expect(async () => {
    const progressText = await readStepProgressText(page)
    const automationPaused = await isAutomationPaused(page)
    if (!progressText.trim() && !automationPaused && !(await isBranchComplete(page))) {
      throw new Error('Waiting for unilateral exit step progress or automation pause banner')
    }
  }).toPass({ timeout: 120_000 })

  const deadlineMs = Date.now() + AUTOMATIC_UNROLL_DEADLINE_MS
  const recoveryAttempts = { count: 0 }
  let sawProceedingAutomatically = false
  let lastProgressText = await readStepProgressSignature(page)
  let minesWithoutProgress = 0
  let waitConfirmationMines = 0
  let bumperTopUps = { count: 0 }
  let advancingStuckCycles = 0

  while (Date.now() < deadlineMs) {
    const recoveredFromFailure = await recoverFromRetryableAutomationFailure(
      page,
      recoveryAttempts,
    )
    if (recoveredFromFailure) {
      minesWithoutProgress = 0
      lastProgressText = await readStepProgressSignature(page)
      continue
    }
    if (await bumperNeedsTopUp(page)) {
      if (await topUpBumperIfDepleted(page, bumperTopUps)) {
        minesWithoutProgress = 0
        advancingStuckCycles = 0
        lastProgressText = await readStepProgressSignature(page)
        continue
      }
    }

    await assertNoAutomationOrExitError(page)

    if (await isBranchComplete(page)) {
      return
    }

    const rawProgressText = await readStepProgressText(page)
    const progressText = await readStepProgressSignature(page)
    if (/proceeding automatically|waiting for confirmation/i.test(rawProgressText)) {
      sawProceedingAutomatically = true
    }

    const automationOn = await page.getByTestId('unilateral-exit-proceed-automatically').isChecked()
    if (
      automationOn &&
      (await startButton.isVisible()) &&
      (await startButton.isEnabled()) &&
      !(await isAutomationPaused(page))
    ) {
      await failUnilateralExit(
        page,
        'Manual Start/Proceed re-enabled during automation — runner should advance steps without extra clicks',
      )
    }

    const waitingForConfirmation = await isWaitingForStepConfirmation(page)
    if (waitingForConfirmation) {
      if (await bumperNeedsTopUp(page)) {
        await topUpBumperAndRefreshBatchEstimate(page)
        waitConfirmationMines = 0
        continue
      }
      if (
        waitConfirmationMines >= 15 &&
        /Step \d+ of \d+/i.test(rawProgressText)
      ) {
        const proceedButton = page.getByTestId('unilateral-exit-proceed')
        if (await proceedButton.isEnabled()) {
          await proceedButton.click()
          waitConfirmationMines = 0
          continue
        }
      }
      await mineRegtestBlocks(2)
      waitConfirmationMines += 1
      if (waitConfirmationMines >= 60) {
        await failUnilateralExit(
          page,
          `Step stayed in "waiting for confirmation" after ${waitConfirmationMines * 2} mined blocks. ` +
            `Last progress: "${rawProgressText || '(empty)'}"`,
        )
      }
      continue
    }
    waitConfirmationMines = 0

    const progressPhase = await page
      .getByTestId('unilateral-exit-step-progress')
      .getAttribute('data-progress-phase')
    const isAdvancingPhase =
      progressPhase === 'advancing' ||
      progressPhase === 'ensuringBroadcast' ||
      /proceeding automatically/i.test(rawProgressText) ||
      /broadcasting/i.test(rawProgressText)

    if (isAdvancingPhase) {
      if (progressText !== lastProgressText) {
        lastProgressText = progressText
        advancingStuckCycles = 0
      } else {
        advancingStuckCycles += 1
      }
      minesWithoutProgress = 0
      if (advancingStuckCycles >= ADVANCING_STUCK_RECOVERY_CYCLES) {
        if (await bumperNeedsTopUp(page)) {
          await topUpBumperAndRefreshBatchEstimate(page)
          advancingStuckCycles = 0
          continue
        }
        // Last step can show "advancing" while the relayed tx waits for confirmations (step-relayed
        // may lag). Mine only on the terminal step so we do not race an in-flight broadcast.
        if (await isOnLastUnilateralExitStep(page)) {
          await mineRegtestBlocks(2)
          advancingStuckCycles = 0
          continue
        }
      }
    } else {
      advancingStuckCycles = 0
      if (progressText === lastProgressText) {
        minesWithoutProgress += 1
        if (minesWithoutProgress >= MAX_MINES_WITHOUT_PROGRESS) {
          await failUnilateralExit(
            page,
            `Automatic unilateral unroll stuck after ${minesWithoutProgress} poll cycles without step progress change. ` +
              `Last progress: "${progressText || '(empty)'}"`,
          )
        }
      } else {
        lastProgressText = progressText
        minesWithoutProgress = 0
      }
    }

    // Mine only while waiting for confirmations — mining during broadcast races step inputs.
    await page.waitForTimeout(500)
  }

  await failUnilateralExit(
    page,
    `Automatic unilateral unroll timed out before branch complete (last progress: "${await readStepProgressText(page)}", sawAutomationProgress: ${sawProceedingAutomatically})`,
  )
}

export { REG07_BUMPER_FUNDING_SATS }
