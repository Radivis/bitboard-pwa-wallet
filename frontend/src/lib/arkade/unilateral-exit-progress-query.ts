import type { ArkadeUnilateralExitProgress } from '@/workers/arkade-api'

export function unilateralExitProgressQueryShouldFetch(params: {
  enabled: boolean
  unilateralExitJobActive: boolean
}): boolean {
  return params.enabled && !params.unilateralExitJobActive
}

export function unilateralExitProgressQueryRefetchInterval(params: {
  enabled: boolean
  unilateralExitJobActive: boolean
  branchComplete: boolean
  waitingForConfirmation: boolean
  progressPollMs: number
  progressIdlePollMs: number
}): number | false {
  if (!params.enabled || params.unilateralExitJobActive || params.branchComplete) {
    return false
  }
  if (params.waitingForConfirmation) {
    return params.progressPollMs
  }
  return params.progressIdlePollMs
}

export function isUnilateralExitProgressWaitingForConfirmation(
  progress: ArkadeUnilateralExitProgress | undefined,
): boolean {
  if (progress == null) {
    return false
  }
  return progress.phase === 'waiting' || progress.currentStepWaitingSince != null
}
