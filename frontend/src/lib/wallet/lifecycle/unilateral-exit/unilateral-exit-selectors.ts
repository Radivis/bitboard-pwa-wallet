import { isUnilateralExitBranchComplete } from '@/lib/arkade/unilateral-exit-branch-complete'
import {
  isCurrentStepRelayed,
  isWaitingForRelayedStepConfirmation,
} from '@/lib/arkade/unilateral-exit-broadcast'
import type { UnilateralExitControlDisplayPhase } from '@/lib/arkade/unilateral-exit-control-phase'
import type { UnilateralExitAutomationSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import { defaultUnilateralExitAutomationPrefs } from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import {
  UnilateralExitLifecyclePhase,
  type UnilateralExitLifecycleSnapshot,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import {
  UNILATERAL_EXIT_MACHINE_STATE,
  type UnilateralExitActorSnapshot,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import {
  unilateralExitSnapshotIsInAnyState,
  unilateralExitSnapshotIsInState,
  unilateralExitSnapshotIsProceeding,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-snapshot'

export type { UnilateralExitActorSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'

function lifecyclePhaseFromMachineState(
  state: UnilateralExitActorSnapshot,
): UnilateralExitLifecyclePhase {
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.notConfigured)) {
    return UnilateralExitLifecyclePhase.NotConfigured
  }
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.complete)) {
    return UnilateralExitLifecyclePhase.Complete
  }
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.error)) {
    return UnilateralExitLifecyclePhase.Error
  }
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.proceeding)) {
    return UnilateralExitLifecyclePhase.Advancing
  }
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.ensuringBroadcast)) {
    return UnilateralExitLifecyclePhase.Advancing
  }
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm)) {
    return UnilateralExitLifecyclePhase.WaitingConfirm
  }
  if (
    unilateralExitSnapshotIsInAnyState(state, [
      UNILATERAL_EXIT_MACHINE_STATE.checkingProgress,
      UNILATERAL_EXIT_MACHINE_STATE.evaluatingPolicy,
      UNILATERAL_EXIT_MACHINE_STATE.paused,
    ])
  ) {
    const progress = state.context.progress
    if (isWaitingForRelayedStepConfirmation(progress)) {
      return UnilateralExitLifecyclePhase.WaitingConfirm
    }
    if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.paused)) {
      return UnilateralExitLifecyclePhase.Idle
    }
    return state.context.jobOutpoints.length > 0
      ? UnilateralExitLifecyclePhase.Advancing
      : UnilateralExitLifecyclePhase.Idle
  }
  if (state.context.jobOutpoints.length > 0) {
    return UnilateralExitLifecyclePhase.Idle
  }
  return UnilateralExitLifecyclePhase.Idle
}

export function selectUnilateralExitLifecycleSnapshot(
  state: UnilateralExitActorSnapshot,
): UnilateralExitLifecycleSnapshot {
  return {
    phase: lifecyclePhaseFromMachineState(state),
    walletScope: state.context.walletScope,
    selectedLeafOutpoints: state.context.jobOutpoints,
    progress: state.context.progress,
    lastErrorMessage: state.context.lastErrorMessage,
  }
}

export function selectUnilateralExitAutomationSnapshot(
  state: UnilateralExitActorSnapshot,
  prefs = defaultUnilateralExitAutomationPrefs(),
): UnilateralExitAutomationSnapshot {
  let scheduling: UnilateralExitAutomationSnapshot['scheduling'] = 'idle'
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.paused)) {
    scheduling = 'paused'
  } else if (
    state.context.automationEnabled &&
    unilateralExitSnapshotIsInAnyState(state, [
      UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm,
      UNILATERAL_EXIT_MACHINE_STATE.checkingProgress,
      UNILATERAL_EXIT_MACHINE_STATE.evaluatingPolicy,
      UNILATERAL_EXIT_MACHINE_STATE.proceeding,
      UNILATERAL_EXIT_MACHINE_STATE.ensuringBroadcast,
    ])
  ) {
    scheduling = 'scheduled'
  }

  return {
    prefs,
    pausedReason: state.context.pausedReason,
    lastErrorMessage: state.context.lastErrorMessage,
    scheduling,
  }
}

export function selectIsUnilateralExitJobActive(state: UnilateralExitActorSnapshot): boolean {
  const lifecycle = selectUnilateralExitLifecycleSnapshot(state)
  return (
    lifecycle.phase === UnilateralExitLifecyclePhase.Advancing ||
    lifecycle.phase === UnilateralExitLifecyclePhase.WaitingConfirm ||
    (lifecycle.phase === UnilateralExitLifecyclePhase.Idle &&
      lifecycle.selectedLeafOutpoints.length > 0)
  )
}

export function selectUnilateralExitControlJobState(
  state: UnilateralExitActorSnapshot,
  params: {
    hasInProgressExits: boolean
    totalSteps: number
  },
): {
  phase: UnilateralExitControlDisplayPhase
  exitJobInFlight: boolean
  jobActive: boolean
  showStepProgress: boolean
  isProceeding: boolean
} {
  const lifecycle = selectUnilateralExitLifecycleSnapshot(state)
  const progress = state.context.progress
  const wasmPhase = progress?.phase ?? 'idle'
  const branchComplete =
    (progress != null && isUnilateralExitBranchComplete(progress)) ||
    lifecycle.phase === UnilateralExitLifecyclePhase.Complete
  const phaseFromProgress: UnilateralExitControlDisplayPhase = branchComplete
    ? 'complete'
    : wasmPhase === 'waiting' && !isCurrentStepRelayed(progress)
      ? 'advancing'
      : wasmPhase

  const isProceeding = unilateralExitSnapshotIsProceeding(state)

  const exitJobInFlight =
    selectIsUnilateralExitJobActive(state) ||
    params.hasInProgressExits ||
    isProceeding

  const phase: UnilateralExitControlDisplayPhase =
    !params.hasInProgressExits && !exitJobInFlight
      ? 'idle'
      : lifecycle.phase === UnilateralExitLifecyclePhase.WaitingConfirm
        ? 'waiting'
        : unilateralExitSnapshotIsInAnyState(state, [
              UNILATERAL_EXIT_MACHINE_STATE.proceeding,
              UNILATERAL_EXIT_MACHINE_STATE.ensuringBroadcast,
            ]) ||
            (lifecycle.phase === UnilateralExitLifecyclePhase.Advancing && progress == null)
          ? 'advancing'
          : phaseFromProgress

  const jobActive =
    selectIsUnilateralExitJobActive(state) || params.hasInProgressExits

  return {
    phase,
    exitJobInFlight,
    jobActive,
    showStepProgress: exitJobInFlight && params.totalSteps > 0,
    isProceeding,
  }
}

export function selectUnilateralExitDebugSnapshot(state: UnilateralExitActorSnapshot) {
  return {
    lifecycle: selectUnilateralExitLifecycleSnapshot(state),
    automation: selectUnilateralExitAutomationSnapshot(state),
    progress: state.context.progress,
    machineState: state.value,
  }
}
