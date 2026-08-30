import type { ArkadeUnilateralExitProgress } from '@/workers/arkade-api'
import { isCurrentStepRelayed } from '@/lib/arkade/unilateral-exit-broadcast'
import type {
  UnilateralExitControlDisplayPhase,
  UnilateralExitInProgressOverlayKind,
} from '@/lib/arkade/unilateral-exit-control-phase'
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
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.terminated)) {
    return UnilateralExitLifecyclePhase.Terminated
  }
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.aborted)) {
    return UnilateralExitLifecyclePhase.Idle
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
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.waitingForParentData)) {
    return UnilateralExitLifecyclePhase.WaitingForParentData
  }
  if (
    state.context.unconfirmedParentRetry != null &&
    state.context.progressRefreshRequested &&
    unilateralExitSnapshotIsInAnyState(state, [
      UNILATERAL_EXIT_MACHINE_STATE.checkingProgress,
      UNILATERAL_EXIT_MACHINE_STATE.loadingProgress,
    ])
  ) {
    return UnilateralExitLifecyclePhase.WaitingForParentData
  }
  if (
    unilateralExitSnapshotIsInAnyState(state, [
      UNILATERAL_EXIT_MACHINE_STATE.checkingProgress,
      UNILATERAL_EXIT_MACHINE_STATE.loadingProgress,
      UNILATERAL_EXIT_MACHINE_STATE.evaluatingPolicy,
      UNILATERAL_EXIT_MACHINE_STATE.paused,
    ])
  ) {
    if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.paused)) {
      return UnilateralExitLifecyclePhase.Idle
    }
    if (state.context.progressRefreshRequested) {
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
      UNILATERAL_EXIT_MACHINE_STATE.waitingForParentData,
      UNILATERAL_EXIT_MACHINE_STATE.checkingProgress,
      UNILATERAL_EXIT_MACHINE_STATE.evaluatingPolicy,
      UNILATERAL_EXIT_MACHINE_STATE.proceeding,
      UNILATERAL_EXIT_MACHINE_STATE.ensuringBroadcast,
    ])
  ) {
    scheduling = 'scheduled'
  }

  return {
    prefs: { ...prefs, enabled: state.context.automationEnabled },
    pausedReason: state.context.pausedReason,
    lastErrorMessage: state.context.lastErrorMessage,
    scheduling,
  }
}

export function selectIsUnilateralExitJobActive(state: UnilateralExitActorSnapshot): boolean {
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.aborted)) {
    return false
  }
  const lifecycle = selectUnilateralExitLifecycleSnapshot(state)
  if (lifecycle.phase === UnilateralExitLifecyclePhase.Terminated) {
    return false
  }
  return (
    lifecycle.phase === UnilateralExitLifecyclePhase.Advancing ||
    lifecycle.phase === UnilateralExitLifecyclePhase.WaitingConfirm ||
    lifecycle.phase === UnilateralExitLifecyclePhase.WaitingForParentData ||
    (lifecycle.phase === UnilateralExitLifecyclePhase.Error &&
      lifecycle.selectedLeafOutpoints.length > 0) ||
    (lifecycle.phase === UnilateralExitLifecyclePhase.Idle &&
      lifecycle.selectedLeafOutpoints.length > 0)
  )
}

export function selectCanAbortUnilateralExitOrchestration(
  state: UnilateralExitActorSnapshot,
  params: {
    resolvedJobOutpointsCount: number
    lifecycleJobActive: boolean
    persistedJobExists: boolean
    hasInProgressExits: boolean
  },
): boolean {
  if (params.resolvedJobOutpointsCount === 0) {
    return false
  }
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.complete)) {
    return false
  }
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.aborted)) {
    return false
  }
  return (
    state.context.jobOutpoints.length > 0 ||
    params.lifecycleJobActive ||
    params.persistedJobExists ||
    unilateralExitSnapshotIsProceeding(state) ||
    unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm) ||
    unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.waitingForParentData) ||
    unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.paused)
  )
}

function controlDisplayPhaseFromMachine(
  state: UnilateralExitActorSnapshot,
): UnilateralExitControlDisplayPhase | null {
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.complete)) {
    return 'complete'
  }
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm)) {
    return 'waiting'
  }
  if (
    unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.waitingForParentData)
  ) {
    return 'waitingForParentData'
  }
  if (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.ensuringBroadcast)) {
    return 'ensuringBroadcast'
  }
  if (
    !unilateralExitSnapshotIsInAnyState(state, [
      UNILATERAL_EXIT_MACHINE_STATE.proceeding,
      UNILATERAL_EXIT_MACHINE_STATE.checkingProgress,
      UNILATERAL_EXIT_MACHINE_STATE.loadingProgress,
      UNILATERAL_EXIT_MACHINE_STATE.evaluatingPolicy,
    ])
  ) {
    return null
  }
  if (state.context.progressRefreshRequested) {
    return null
  }
  return 'advancing'
}

function controlDisplayPhaseFromProgress(
  state: UnilateralExitActorSnapshot,
): UnilateralExitControlDisplayPhase {
  const progress = selectUnilateralExitProgressForDisplay(state)
  const wasmPhase = progress?.phase ?? 'idle'
  if (wasmPhase === 'waiting' && !isCurrentStepRelayed(progress)) {
    return 'advancing'
  }
  if (wasmPhase === 'broadcasting') {
    return 'ensuringBroadcast'
  }
  return wasmPhase
}

function controlDisplayPhaseFallback(
  state: UnilateralExitActorSnapshot,
  params: { exitJobInFlight: boolean },
  lifecycle: ReturnType<typeof selectUnilateralExitLifecycleSnapshot>,
): UnilateralExitControlDisplayPhase {
  if (!params.exitJobInFlight) {
    return 'idle'
  }
  if (lifecycle.phase === UnilateralExitLifecyclePhase.WaitingConfirm) {
    return 'waiting'
  }
  if (lifecycle.phase === UnilateralExitLifecyclePhase.WaitingForParentData) {
    return 'waitingForParentData'
  }
  return controlDisplayPhaseFromProgress(state)
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
  const machineComplete = unilateralExitSnapshotIsInState(
    state,
    UNILATERAL_EXIT_MACHINE_STATE.complete,
  )
  const isProceeding = unilateralExitSnapshotIsProceeding(state)
  const exitJobInFlight =
    selectIsUnilateralExitJobActive(state) ||
    isProceeding ||
    machineComplete
  const phase =
    controlDisplayPhaseFromMachine(state) ??
    controlDisplayPhaseFallback(state, {
      exitJobInFlight,
    }, lifecycle)
  const jobActive = selectIsUnilateralExitJobActive(state) || machineComplete

  return {
    phase,
    exitJobInFlight,
    jobActive,
    showStepProgress: exitJobInFlight && params.totalSteps > 0,
    isProceeding,
  }
}

export function selectUnilateralExitInProgressOverlay(
  state: UnilateralExitActorSnapshot,
): UnilateralExitInProgressOverlayKind | null {
  const progress = selectUnilateralExitProgressForDisplay(state)
  if (
    unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm)
  ) {
    return 'waiting'
  }
  if (
    unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.waitingForParentData)
  ) {
    return 'waitingForParentData'
  }
  if (
    state.context.unconfirmedParentRetry != null &&
    state.context.progressRefreshRequested &&
    unilateralExitSnapshotIsInAnyState(state, [
      UNILATERAL_EXIT_MACHINE_STATE.checkingProgress,
      UNILATERAL_EXIT_MACHINE_STATE.loadingProgress,
    ])
  ) {
    return 'waitingForParentData'
  }
  if (
    unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.ensuringBroadcast)
  ) {
    return 'ensuringBroadcast'
  }
  if (
    unilateralExitSnapshotIsInAnyState(state, [
      UNILATERAL_EXIT_MACHINE_STATE.checkingProgress,
      UNILATERAL_EXIT_MACHINE_STATE.loadingProgress,
    ])
  ) {
    if (state.context.progressRefreshRequested) {
      return state.context.jobOutpoints.length > 0 && progress != null
        ? 'readyToProceed'
        : null
    }
  }
  if (
    (unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.idle) ||
      unilateralExitSnapshotIsInState(state, UNILATERAL_EXIT_MACHINE_STATE.error)) &&
    state.context.jobOutpoints.length > 0 &&
    progress != null
  ) {
    return 'readyToProceed'
  }
  return null
}

export function selectUnilateralExitProgressForDisplay(
  state: UnilateralExitActorSnapshot,
): ArkadeUnilateralExitProgress | null {
  if (state.context.jobOutpoints.length > 0) {
    return state.context.progress
  }
  return null
}

export type UnilateralExitProceedButtonState = {
  visible: boolean
  disabled: boolean
  label: string
  showSpinner: boolean
  canProceedStep: boolean
}

export function selectUnilateralExitProceedButtonState(
  state: UnilateralExitActorSnapshot,
  params: {
    jobOutpointsCount: number
    automationEnabled: boolean
    bumperLow: boolean
    batchEstimateLoading: boolean
    prefsHydrated: boolean
    lifecycleJobActive: boolean
    hasInProgressExits: boolean
    phase: UnilateralExitControlDisplayPhase
  },
): UnilateralExitProceedButtonState {
  const isProceeding = unilateralExitSnapshotIsProceeding(state)
  const machineWaiting = unilateralExitSnapshotIsInState(
    state,
    UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm,
  )
  const machineComplete = unilateralExitSnapshotIsInState(
    state,
    UNILATERAL_EXIT_MACHINE_STATE.complete,
  )
  const automationRunning =
    params.automationEnabled &&
    (isProceeding ||
      machineWaiting ||
      unilateralExitSnapshotIsInAnyState(state, [
        UNILATERAL_EXIT_MACHINE_STATE.evaluatingPolicy,
        UNILATERAL_EXIT_MACHINE_STATE.proceeding,
        UNILATERAL_EXIT_MACHINE_STATE.ensuringBroadcast,
        UNILATERAL_EXIT_MACHINE_STATE.waitingForParentData,
      ]))
  const canProceedStep = params.lifecycleJobActive && params.phase !== 'complete'
  const showSpinner = isProceeding && params.phase !== 'waiting' && params.phase !== 'waitingForParentData'
  const disabled =
    !params.prefsHydrated ||
    params.jobOutpointsCount === 0 ||
    params.bumperLow ||
    showSpinner ||
    machineWaiting ||
    (canProceedStep && params.batchEstimateLoading) ||
    params.phase === 'complete' ||
    automationRunning
  const visible =
    (params.lifecycleJobActive || params.jobOutpointsCount > 0) &&
    (!params.automationEnabled || !params.lifecycleJobActive || automationRunning)
  let label = 'Start unroll'
  if (automationRunning) {
    label = 'Running automatically…'
  } else if (params.automationEnabled && params.lifecycleJobActive) {
    label = 'Running automatically…'
  } else if (canProceedStep) {
    label = 'Proceed'
  }

  return {
    visible,
    disabled,
    label,
    showSpinner,
    canProceedStep,
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
