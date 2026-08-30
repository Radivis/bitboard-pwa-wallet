import type {
  ArkadeUnilateralExitPhaseKind,
} from '@/workers/arkade-api'

export type UnilateralExitControlDisplayPhase =
  | ArkadeUnilateralExitPhaseKind
  | 'advancing'
  | 'ensuringBroadcast'
  | 'waitingForParentData'

export type UnilateralExitInProgressOverlayKind =
  | 'ensuringBroadcast'
  | 'waiting'
  | 'waitingForParentData'
  | 'readyToProceed'

/**
 * Step-progress suffix and overlay label while `waitingForParentData`.
 * GET `/tx/status` can already show the parent confirmed; submitpackage may not.
 */
export const UNILATERAL_EXIT_WAITING_FOR_PARENT_DATA_COPY =
  'Waiting for Esplora to acknowledge parent data'

export function unilateralExitInProgressOverlayLabel(
  overlay: UnilateralExitInProgressOverlayKind,
): string | undefined {
  switch (overlay) {
    case 'waitingForParentData':
      return UNILATERAL_EXIT_WAITING_FOR_PARENT_DATA_COPY
    case 'waiting':
      return 'Waiting for confirmation'
    case 'ensuringBroadcast':
      return 'Broadcasting'
    case 'readyToProceed':
      return undefined
  }
}
