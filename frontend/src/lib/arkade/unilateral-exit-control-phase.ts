import {
  isWaitingForRelayedStepConfirmation,
  needsBroadcastEnsurance,
} from '@/lib/arkade/unilateral-exit-broadcast'
import type {
  ArkadeUnilateralExitPhaseKind,
  ArkadeUnilateralExitProgress,
} from '@/workers/arkade-api'

export type UnilateralExitControlDisplayPhase =
  | ArkadeUnilateralExitPhaseKind
  | 'advancing'

export type UnilateralExitInProgressOverlayKind = 'ensuringBroadcast' | 'waiting'

export function resolveUnilateralExitInProgressOverlay(params: {
  phase: UnilateralExitControlDisplayPhase
  progress: ArkadeUnilateralExitProgress | null
  isEnsuringBroadcast: boolean
}): UnilateralExitInProgressOverlayKind | null {
  if (
    params.phase === 'waiting' ||
    isWaitingForRelayedStepConfirmation(params.progress)
  ) {
    return 'waiting'
  }
  if (
    params.isEnsuringBroadcast ||
    params.phase === 'broadcasting' ||
    (params.phase === 'advancing' && needsBroadcastEnsurance(params.progress))
  ) {
    return 'ensuringBroadcast'
  }
  return null
}
