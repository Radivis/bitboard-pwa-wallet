import type { UnilateralExitWalletScope } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import {
  UNILATERAL_EXIT_MACHINE_STATE,
  type UnilateralExitActorSnapshot,
  type UnilateralExitMachineContext,
  type UnilateralExitMachineStateId,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import type { unilateralExitMachine } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.machine'
import { arkadeVtxoOutpointsEqual } from '@/workers/arkade-api'
import type { SnapshotFrom } from 'xstate'

type RuntimeUnilateralExitActorSnapshot = SnapshotFrom<typeof unilateralExitMachine>

function isUnilateralExitMachineStateId(
  value: RuntimeUnilateralExitActorSnapshot['value'],
): value is UnilateralExitMachineStateId {
  return typeof value === 'string'
}

export function toUnilateralExitActorSnapshot(
  snapshot: RuntimeUnilateralExitActorSnapshot,
): UnilateralExitActorSnapshot {
  if (!isUnilateralExitMachineStateId(snapshot.value)) {
    throw new Error(`Unexpected unilateral exit machine state: ${String(snapshot.value)}`)
  }

  return {
    status: snapshot.status,
    value: snapshot.value,
    context: snapshot.context as UnilateralExitMachineContext,
  }
}

export function unilateralExitSnapshotIsInState(
  snapshot: UnilateralExitActorSnapshot,
  stateId: UnilateralExitMachineStateId,
): boolean {
  return snapshot.value === stateId
}

export function unilateralExitSnapshotIsInAnyState(
  snapshot: UnilateralExitActorSnapshot,
  stateIds: readonly UnilateralExitMachineStateId[],
): boolean {
  return stateIds.includes(snapshot.value)
}

const UNILATERAL_EXIT_PROCEEDING_MACHINE_STATES = [
  UNILATERAL_EXIT_MACHINE_STATE.proceeding,
  UNILATERAL_EXIT_MACHINE_STATE.checkingProgress,
  UNILATERAL_EXIT_MACHINE_STATE.evaluatingPolicy,
  UNILATERAL_EXIT_MACHINE_STATE.ensuringBroadcast,
] as const

export function unilateralExitSnapshotIsProceeding(
  snapshot: UnilateralExitActorSnapshot,
): boolean {
  return unilateralExitSnapshotIsInAnyState(snapshot, UNILATERAL_EXIT_PROCEEDING_MACHINE_STATES)
}

function unilateralExitWalletScopesEqual(
  previous: UnilateralExitWalletScope | null,
  next: UnilateralExitWalletScope | null,
): boolean {
  if (previous === next) {
    return true
  }
  if (previous == null || next == null) {
    return false
  }
  return (
    previous.walletId === next.walletId &&
    previous.networkMode === next.networkMode &&
    previous.connectionId === next.connectionId
  )
}

export function unilateralExitActorSnapshotEqual(
  previous: UnilateralExitActorSnapshot,
  next: UnilateralExitActorSnapshot,
): boolean {
  if (previous.status !== next.status || previous.value !== next.value) {
    return false
  }

  const previousContext = previous.context
  const nextContext = next.context
  return (
    unilateralExitWalletScopesEqual(previousContext.walletScope, nextContext.walletScope) &&
    arkadeVtxoOutpointsEqual(previousContext.jobOutpoints, nextContext.jobOutpoints) &&
    previousContext.progress === nextContext.progress &&
    previousContext.automationEnabled === nextContext.automationEnabled &&
    previousContext.pausedReason === nextContext.pausedReason &&
    previousContext.lastErrorMessage === nextContext.lastErrorMessage &&
    previousContext.feeRateSatPerVb === nextContext.feeRateSatPerVb &&
    previousContext.proceedRequested === nextContext.proceedRequested &&
    previousContext.pollDelayMs === nextContext.pollDelayMs
  )
}
