import type {
  ArkadeUnilateralExitNodeStatus,
  ArkadeUnilateralExitPhaseKind,
} from '@/workers/arkade-api'

export function isUnilateralExitAwaitingStepConfirmation(params: {
  phase: ArkadeUnilateralExitPhaseKind
  currentStepWaitingSince?: number | null
  proceedMutationPending: boolean
  awaitingConfirmationStepIndex: number | null
  stepIndex: number
  nodeStatuses: ArkadeUnilateralExitNodeStatus[]
  automationJobActive: boolean
  automationPausedReason: string | null | undefined
}): boolean {
  if (params.proceedMutationPending) {
    return true
  }

  if (params.phase === 'waiting' || params.currentStepWaitingSince != null) {
    return true
  }

  if (params.awaitingConfirmationStepIndex != null) {
    const awaitingNode = params.nodeStatuses[params.awaitingConfirmationStepIndex]
    if (
      params.stepIndex <= params.awaitingConfirmationStepIndex &&
      awaitingNode?.status !== 'confirmed'
    ) {
      return true
    }
  }

  if (
    params.automationJobActive &&
    params.automationPausedReason == null &&
    params.phase !== 'complete'
  ) {
    return true
  }

  return false
}
