import type {
  ArkadeUnilateralExitPhaseKind,
} from '@/workers/arkade-api'

export type UnilateralExitControlDisplayPhase =
  | ArkadeUnilateralExitPhaseKind
  | 'advancing'

export type UnilateralExitInProgressOverlayKind = 'ensuringBroadcast' | 'waiting'
