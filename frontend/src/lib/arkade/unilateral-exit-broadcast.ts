import { isUnilateralExitBranchComplete } from '@/lib/arkade/unilateral-exit-branch-complete'
import type { ArkadeUnilateralExitProgress } from '@/workers/arkade-api'

/** True when the active step tx is on the network (WASM `/raw` or proceed wait stamp on regtest). */
export function isCurrentStepRelayed(
  progress: ArkadeUnilateralExitProgress | null,
): boolean {
  if (progress == null) {
    return false
  }
  return (
    progress.currentStepTxRelayed === true || progress.currentStepWaitingSince != null
  )
}

/** Active job step exists but the branch tx is not yet visible via `/raw`. */
export function needsBroadcastEnsurance(
  progress: ArkadeUnilateralExitProgress | null,
): boolean {
  if (progress == null) {
    return false
  }
  if (isUnilateralExitBranchComplete(progress)) {
    return false
  }
  return !isCurrentStepRelayed(progress)
}

/** Relay verified; waiting for block confirmations before advancing. */
export function isWaitingForRelayedStepConfirmation(
  progress: ArkadeUnilateralExitProgress | null,
): boolean {
  if (progress == null) {
    return false
  }
  if (isUnilateralExitBranchComplete(progress)) {
    return false
  }
  if (!isCurrentStepRelayed(progress)) {
    return false
  }
  return progress.phase === 'waiting' || progress.currentStepWaitingSince != null
}

export function isPackageNotChildWithUnconfirmedParentsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('package-not-child-with-unconfirmed-parents')
}

/** CPFP bumper select_coins skipped unconfirmed wallet UTXOs (submitpackage extra parent). */
export function isInsufficientConfirmedBumperFundsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('insufficient confirmed funds')
}

/** Internal remap for retry detection. Not user-facing; UI uses waitingForParentData copy. */
export const UNCONFIRMED_PARENT_PACKAGE_RETRY_MESSAGE =
  'Previous unroll step is not confirmed on-chain yet. Wait for a confirmation, then proceed again.'

export type ParentUnconfirmedPackageError = Error & {
  rewoundProgress?: ArkadeUnilateralExitProgress
  retryableUnconfirmedParent?: boolean
}

export function isRetryableUnconfirmedParentPackageError(error: unknown): boolean {
  if (isPackageNotChildWithUnconfirmedParentsError(error)) {
    return true
  }
  if (isInsufficientConfirmedBumperFundsError(error)) {
    return true
  }
  if (
    error instanceof Error &&
    (error.message === UNCONFIRMED_PARENT_PACKAGE_RETRY_MESSAGE ||
      (error as ParentUnconfirmedPackageError).retryableUnconfirmedParent === true)
  ) {
    return true
  }
  return false
}

export function rewoundProgressFromPackageError(
  error: unknown,
): ArkadeUnilateralExitProgress | undefined {
  if (
    error instanceof Error &&
    'rewoundProgress' in error &&
    (error as ParentUnconfirmedPackageError).rewoundProgress != null
  ) {
    return (error as ParentUnconfirmedPackageError).rewoundProgress
  }
  return undefined
}

export type UnconfirmedParentRetry = {
  stepIndex: number
  parentConfirmationsAtFail: number
}

export function parentConfirmationsForStep(
  progress: ArkadeUnilateralExitProgress | null,
  stepIndex: number,
): number {
  if (progress == null || stepIndex <= 0) {
    return 0
  }
  return progress.nodeStatuses[stepIndex - 1]?.confirmations ?? 0
}

export function unconfirmedParentRetryFromProgress(
  progress: ArkadeUnilateralExitProgress | null,
): UnconfirmedParentRetry | null {
  if (progress == null) {
    return null
  }
  return {
    stepIndex: progress.stepIndex,
    parentConfirmationsAtFail: parentConfirmationsForStep(progress, progress.stepIndex),
  }
}

export function unconfirmedParentRetryIsActive(
  retry: UnconfirmedParentRetry | null,
  progress: ArkadeUnilateralExitProgress | null,
): boolean {
  return retry != null && progress != null && progress.stepIndex === retry.stepIndex
}

/**
 * After broadcasting step N, WASM `first_incomplete` may already point at a later
 * unpublished tx (ASP published checkpoints that then confirmed). That later tx is
 * not the one we just broadcast — do not treat it as a failed relay check.
 */
export function broadcastedStepIsVisibleOnNetwork(
  progressBefore: ArkadeUnilateralExitProgress,
  progressAfter: ArkadeUnilateralExitProgress,
): boolean {
  const broadcastedIndex = progressBefore.stepIndex
  const broadcastedTxid = progressBefore.nodeStatuses[broadcastedIndex]?.txid
  if (progressAfter.stepIndex < broadcastedIndex) {
    return false
  }
  if (progressAfter.stepIndex > broadcastedIndex) {
    return true
  }
  if (broadcastedTxid != null) {
    const afterNode = progressAfter.nodeStatuses.find((node) => node.txid === broadcastedTxid)
    if (afterNode != null && (afterNode.confirmations >= 1 || afterNode.status === 'confirmed')) {
      return true
    }
  }
  return (
    progressAfter.stepIndex === broadcastedIndex && isCurrentStepRelayed(progressAfter)
  )
}
