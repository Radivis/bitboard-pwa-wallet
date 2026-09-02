import type { UnilateralExitAutomationPausedReason } from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import type { ArkadeWalletScope } from '@/lib/arkade/arkade-session-scope'
import {
  UNILATERAL_EXIT_AUTOMATION_WAIT_POLL_MS_REGTEST,
  UNILATERAL_EXIT_PARENT_DATA_WAIT_MS,
} from '@/lib/arkade/arkade-query-timings'
import type { ArkadeUnilateralExitProgress, ArkadeUnilateralExitJobViability, ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import type { DoneActorEvent, ErrorActorEvent } from 'xstate'

export type UnilateralExitMachineContext = {
  walletScope: ArkadeWalletScope | null
  jobOutpoints: ArkadeVtxoOutpoint[]
  progress: ArkadeUnilateralExitProgress | null
  automationEnabled: boolean
  pausedReason: UnilateralExitAutomationPausedReason | null
  lastErrorMessage: string | null
  feeRateSatPerVb: number | null
  proceedRequested: boolean
  proceedTargetStepIndex: number | null
  progressRefreshRequested: boolean
  unconfirmedParentRetry: {
    stepIndex: number
    parentConfirmationsAtFail: number
  } | null
  pollDelayMs: number
  parentDataWaitMs: number
  reconcileInProgressSats: number
  reconcileInProgressOutpoints: ArkadeVtxoOutpoint[]
}

export type UnilateralExitMachineInput = {
  pollDelayMs?: number
  parentDataWaitMs?: number
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
  /** submitpackage parent not spendable on the write node; see docs/unilateral-exit.md. */
  waitingForParentData: 'waitingForParentData',
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
  | { type: 'WALLET_CONFIGURED'; walletScope: ArkadeWalletScope }
  | {
      type: 'HYDRATE_OR_START'
      walletScope: ArkadeWalletScope
      outpoints: ArkadeVtxoOutpoint[]
      automationEnabled?: boolean
      /** When true and automation is enabled, allow auto-proceed after progress fetch. */
      resumeAutomation?: boolean
      reconcileInProgressSats?: number
      reconcileInProgressOutpoints?: ArkadeVtxoOutpoint[]
    }
  | {
      type: 'START_MANUAL'
      walletScope: ArkadeWalletScope
      outpoints: ArkadeVtxoOutpoint[]
      feeRateSatPerVb: number
    }
  | {
      type: 'START_AUTOMATIC'
      walletScope: ArkadeWalletScope
      outpoints: ArkadeVtxoOutpoint[]
    }
  | { type: 'PROCEED_MANUAL'; feeRateSatPerVb: number }
  /** Test / manual kick that mirrors machine `after` delays. Production uses `after`. */
  | { type: 'POLL_TICK' }
  | { type: 'RESUME' }
  | { type: 'CLEAR_JOB' }
  | {
      type: 'ABORT_ORCHESTRATION'
      resolvedJobOutpoints: ArkadeVtxoOutpoint[]
    }
  | { type: 'WALLET_RESET' }
  | { type: 'AUTOMATION_PREFS_CHANGED'; automationEnabled: boolean }

export type UnilateralExitMachineActorDoneEvent =
  | DoneActorEvent<ArkadeUnilateralExitProgress, 'fetchProgress'>
  | DoneActorEvent<ArkadeUnilateralExitProgress, 'proceedStep'>
  | DoneActorEvent<ArkadeUnilateralExitProgress, 'ensureBroadcast'>
  | DoneActorEvent<UnilateralExitPolicyEvaluation, 'evaluateAutomationPolicy'>
  | DoneActorEvent<ArkadeUnilateralExitJobViability, 'evaluateJobViability'>
  | DoneActorEvent<{ vtxoIds: string[] }, 'resolveAbortVtxoIds'>

export type UnilateralExitMachineActorErrorEvent =
  | ErrorActorEvent<unknown, 'fetchProgress'>
  | ErrorActorEvent<unknown, 'proceedStep'>
  | ErrorActorEvent<unknown, 'ensureBroadcast'>
  | ErrorActorEvent<unknown, 'evaluateAutomationPolicy'>
  | ErrorActorEvent<unknown, 'evaluateJobViability'>
  | ErrorActorEvent<unknown, 'resolveAbortVtxoIds'>

/** Public events that callers may send. Actor done/error events are internal. */
export type UnilateralExitMachineEvent = UnilateralExitMachineUserEvent

/** Full event union used by `setup({ types.events })` so `assertEvent` can narrow done/error. */
export type UnilateralExitMachineSetupEvent =
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
    proceedTargetStepIndex: null,
    progressRefreshRequested: false,
    unconfirmedParentRetry: null,
    pollDelayMs: input?.pollDelayMs ?? UNILATERAL_EXIT_AUTOMATION_WAIT_POLL_MS_REGTEST,
    parentDataWaitMs: input?.parentDataWaitMs ?? UNILATERAL_EXIT_PARENT_DATA_WAIT_MS,
    reconcileInProgressSats: 0,
    reconcileInProgressOutpoints: [],
  }
}
