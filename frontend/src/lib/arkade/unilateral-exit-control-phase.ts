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
