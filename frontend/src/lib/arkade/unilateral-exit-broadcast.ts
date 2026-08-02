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
