import type { UnilateralExitAutomationPausedReason } from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import type { UnilateralExitWalletScope } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import type { ArkadeUnilateralExitProgress, ArkadeUnilateralExitJobViability, ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import type { DoneActorEvent, ErrorActorEvent } from 'xstate'

export type UnilateralExitMachineContext = {
  walletScope: UnilateralExitWalletScope | null
  jobOutpoints: ArkadeVtxoOutpoint[]
  progress: ArkadeUnilateralExitProgress | null
  automationEnabled: boolean
  pausedReason: UnilateralExitAutomationPausedReason | null
  lastErrorMessage: string | null
  feeRateSatPerVb: number | null
  proceedRequested: boolean
  pollDelayMs: number
  reconcileInProgressSats: number
  reconcileInProgressOutpoints: ArkadeVtxoOutpoint[]
}

export type UnilateralExitMachineInput = {
  pollDelayMs?: number
}

export const UNILATERAL_EXIT_MACHINE_STATE = {
  notConfigured: 'notConfigured',
  idle: 'idle',
  checkingProgress: 'checkingProgress',
  loadingProgress: 'loadingProgress',
  evaluatingPolicy: 'evaluatingPolicy',
  proceeding: 'proceeding',
  ensuringBroadcast: 'ensuringBroadcast',
  waitingConfirm: 'waitingConfirm',
  paused: 'paused',
  complete: 'complete',
  terminated: 'terminated',
  aborted: 'aborted',
  error: 'error',
} as const

export type UnilateralExitMachineStateId =
  (typeof UNILATERAL_EXIT_MACHINE_STATE)[keyof typeof UNILATERAL_EXIT_MACHINE_STATE]

export type UnilateralExitActorSnapshot = {
  status: 'active' | 'done' | 'error' | 'stopped'
  value: UnilateralExitMachineStateId
  context: UnilateralExitMachineContext
}

export type UnilateralExitPolicyEvaluation = {
  feeRateSatPerVb: number
  pausedReason: UnilateralExitAutomationPausedReason | null
}

export type UnilateralExitMachineUserEvent =
  | { type: 'WALLET_CONFIGURED'; walletScope: UnilateralExitWalletScope }
  | {
      type: 'HYDRATE_OR_START'
      walletScope: UnilateralExitWalletScope
      outpoints: ArkadeVtxoOutpoint[]
      automationEnabled?: boolean
      /** When true and automation is enabled, allow auto-proceed after progress fetch. */
      resumeAutomation?: boolean
      reconcileInProgressSats?: number
      reconcileInProgressOutpoints?: ArkadeVtxoOutpoint[]
    }
  | {
      type: 'START_MANUAL'
      walletScope: UnilateralExitWalletScope
      outpoints: ArkadeVtxoOutpoint[]
      feeRateSatPerVb: number
    }
  | {
      type: 'START_AUTOMATIC'
      walletScope: UnilateralExitWalletScope
      outpoints: ArkadeVtxoOutpoint[]
    }
  | { type: 'PROCEED_MANUAL'; feeRateSatPerVb: number }
  | { type: 'POLL_TICK' }
  | { type: 'RESUME' }
  | { type: 'CLEAR_JOB' }
  | { type: 'ABORT_ORCHESTRATION'; vtxoIds: string[] }
  | { type: 'WALLET_RESET' }
  | { type: 'AUTOMATION_PREFS_CHANGED'; automationEnabled: boolean }

export type UnilateralExitMachineActorDoneEvent =
  | DoneActorEvent<ArkadeUnilateralExitProgress, 'fetchProgress'>
  | DoneActorEvent<ArkadeUnilateralExitProgress, 'proceedStep'>
  | DoneActorEvent<ArkadeUnilateralExitProgress, 'ensureBroadcast'>
  | DoneActorEvent<UnilateralExitPolicyEvaluation, 'evaluateAutomationPolicy'>
  | DoneActorEvent<ArkadeUnilateralExitJobViability, 'evaluateJobViability'>

export type UnilateralExitMachineActorErrorEvent =
  | ErrorActorEvent<unknown, 'fetchProgress'>
  | ErrorActorEvent<unknown, 'proceedStep'>
  | ErrorActorEvent<unknown, 'ensureBroadcast'>
  | ErrorActorEvent<unknown, 'evaluateAutomationPolicy'>
  | ErrorActorEvent<unknown, 'evaluateJobViability'>

export type UnilateralExitMachineEvent =
  | UnilateralExitMachineUserEvent
  | UnilateralExitMachineActorDoneEvent
  | UnilateralExitMachineActorErrorEvent

export function createInitialUnilateralExitContext(
  input?: UnilateralExitMachineInput,
): UnilateralExitMachineContext {
  return {
    walletScope: null,
    jobOutpoints: [],
    progress: null,
    automationEnabled: false,
    pausedReason: null,
    lastErrorMessage: null,
    feeRateSatPerVb: null,
    proceedRequested: false,
    pollDelayMs: input?.pollDelayMs ?? 2_000,
    reconcileInProgressSats: 0,
    reconcileInProgressOutpoints: [],
  }
}
