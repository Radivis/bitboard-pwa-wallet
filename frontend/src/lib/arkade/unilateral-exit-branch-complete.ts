import type {
  ArkadeUnilateralExitProgress,
} from '@/workers/arkade-api'

export function isUnilateralExitBranchComplete(
  progress: ArkadeUnilateralExitProgress,
): boolean {
  if (progress.phase !== 'complete') {
    return false
  }
  if (progress.totalSteps === 0) {
    return false
  }
  return progress.nodeStatuses.every((node) => node.status === 'confirmed')
}

/** Job bookmark release: the unroll DAG is 1-conf complete. Not 6-conf `is_unrolled`. */
export function isUnilateralExitJobComplete(
  progress: ArkadeUnilateralExitProgress,
): boolean {
  return isUnilateralExitBranchComplete(progress)
}

export function mapWasmProgressToLifecyclePhase(
  progress: ArkadeUnilateralExitProgress,
): 'waiting-confirm' | 'idle' | 'complete' {
  if (progress.phase === 'complete') {
    return 'complete'
  }
  if (progress.phase === 'waiting' || progress.currentStepWaitingSince != null) {
    return 'waiting-confirm'
  }
  return 'idle'
}
