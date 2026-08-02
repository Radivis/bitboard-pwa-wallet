import type { NetworkMode } from '@/stores/walletStore'
import type {
  ArkadeUnilateralExitProgress,
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
}

export type UnilateralExitStartParams = {
  walletScope: UnilateralExitWalletScope
  outpoints: ArkadeVtxoOutpoint[]
  feeRateSatPerVb: number
}

export type UnilateralExitProceedStepParams = {
  feeRateSatPerVb: number
}
