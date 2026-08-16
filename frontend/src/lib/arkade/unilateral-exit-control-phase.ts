import type {
  ArkadeUnilateralExitPhaseKind,
} from '@/workers/arkade-api'

export type UnilateralExitControlDisplayPhase =
  | ArkadeUnilateralExitPhaseKind
  | 'advancing'
  | 'waitingForParentData'

export type UnilateralExitInProgressOverlayKind =
  | 'ensuringBroadcast'
  | 'waiting'
  | 'waitingForParentData'
  | 'readyToProceed'
