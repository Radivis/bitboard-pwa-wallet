import type { ArkadeWalletScope } from '@/lib/arkade/arkade-session-scope'
import type {
  ArkadeUnilateralExitProgress,
  ArkadeUnilateralExitFailureReasonCode,
  ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'

export enum UnilateralExitLifecyclePhase {
  NotConfigured = 'not-configured',
  Idle = 'idle',
  Advancing = 'advancing',
  WaitingConfirm = 'waiting-confirm',
  WaitingForParentData = 'waiting-for-parent-data',
  Complete = 'complete',
  Terminated = 'terminated',
  Error = 'error',
}

export type UnilateralExitLifecycleSnapshot = {
  phase: UnilateralExitLifecyclePhase
  walletScope: ArkadeWalletScope | null
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  progress: ArkadeUnilateralExitProgress | null
  lastErrorMessage: string | null
}

export type PersistedUnilateralExitJob = {
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  /** Unix seconds when the active step was first known relayed; null when not waiting or step confirmed. */
  currentStepRelayedSinceUnix: number | null
  /** Unix seconds when the active job was started; cleared on clearJob. */
  jobStartedAtUnix: number | null
}

export function persistedUnilateralExitJobExists(
  job: Pick<PersistedUnilateralExitJob, 'selectedLeafOutpoints'> | null | undefined,
): boolean {
  return (job?.selectedLeafOutpoints.length ?? 0) > 0
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
  walletScope: ArkadeWalletScope
  outpoints: ArkadeVtxoOutpoint[]
  feeRateSatPerVb: number
}

export type UnilateralExitProceedStepParams = {
  feeRateSatPerVb: number
}
