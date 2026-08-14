import type { NetworkMode } from '@/stores/walletStore'
import type {
  ArkadeUnilateralExitProgress,
  ArkadeUnilateralExitFailureReasonCode,
  ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'

export type UnilateralExitWalletScope = {
  walletId: number
  networkMode: NetworkMode
  connectionId: string
}

export function unilateralExitWalletScopeKey(
  scope: Pick<UnilateralExitWalletScope, 'walletId' | 'networkMode' | 'connectionId'>,
): string {
  return `${scope.walletId}:${scope.networkMode}:${scope.connectionId}`
}

export enum UnilateralExitLifecyclePhase {
  NotConfigured = 'not-configured',
  Idle = 'idle',
  Advancing = 'advancing',
  WaitingConfirm = 'waiting-confirm',
  Complete = 'complete',
  Terminated = 'terminated',
  Error = 'error',
}

export type UnilateralExitLifecycleSnapshot = {
  phase: UnilateralExitLifecyclePhase
  walletScope: UnilateralExitWalletScope | null
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  progress: ArkadeUnilateralExitProgress | null
  lastErrorMessage: string | null
}

export type PersistedUnilateralExitJob = {
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  jobActive: boolean
  /** Unix seconds when the active step was first known relayed; null when not waiting or step confirmed. */
  currentStepRelayedSinceUnix: number | null
  /** Unix seconds when the active job was started; cleared on clearJob. */
  jobStartedAtUnix: number | null
}

export type UnilateralExitFailureReasonCode = ArkadeUnilateralExitFailureReasonCode

export type PersistedUnilateralExitFailure = {
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  jobStartedAtUnix: number
  detectedAtUnix: number
  reasonCode: UnilateralExitFailureReasonCode
  detailMessage: string
  vtxoIds: string[]
}

export type UnilateralExitStartParams = {
  walletScope: UnilateralExitWalletScope
  outpoints: ArkadeVtxoOutpoint[]
  feeRateSatPerVb: number
}

export type UnilateralExitProceedStepParams = {
  feeRateSatPerVb: number
}
