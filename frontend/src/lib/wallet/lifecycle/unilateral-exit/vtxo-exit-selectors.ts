import type { ArkadeVtxoExitPhase } from '@/workers/arkade-api'
import { vtxoExitPhaseFromMachineState } from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit.machine'
import {
  vtxoExitOutpointKey,
  type VtxoExitChildSnapshotMap,
  type VtxoExitMachineStateId,
} from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit-machine-types'

export const VTXO_EXIT_PHASE_COPY = {
  waitingForHostTransactionBroadcast: 'waiting-for-host-transaction-broadcast',
  waitingForFirstConfirmation: 'waiting-for-first-confirmation',
  waitingForSixConfirmations: 'waiting-for-6-confirmations',
  waitingForTimelock: 'waiting-for-timelock',
  ready: 'ready',
  fundingLost: 'funding-lost',
  exited: 'exited',
} as const

export type VtxoExitPhaseCopyKind =
  (typeof VTXO_EXIT_PHASE_COPY)[keyof typeof VTXO_EXIT_PHASE_COPY]

const WAITING_FOR_HOST_BROADCAST_PHASES: ReadonlySet<ArkadeVtxoExitPhase> = new Set([
  'tagged',
  'host_broadcast_attempted',
])

export function vtxoExitPhaseCopyFromPhase(
  phase: ArkadeVtxoExitPhase | null | undefined,
): VtxoExitPhaseCopyKind | null {
  if (phase == null) {
    return null
  }
  if (WAITING_FOR_HOST_BROADCAST_PHASES.has(phase)) {
    return VTXO_EXIT_PHASE_COPY.waitingForHostTransactionBroadcast
  }
  if (phase === 'host_relayed') {
    return VTXO_EXIT_PHASE_COPY.waitingForFirstConfirmation
  }
  if (phase === 'host_confirmed') {
    return VTXO_EXIT_PHASE_COPY.waitingForSixConfirmations
  }
  if (phase === 'unrolled') {
    return VTXO_EXIT_PHASE_COPY.waitingForTimelock
  }
  if (phase === 'complete_ready') {
    return VTXO_EXIT_PHASE_COPY.ready
  }
  if (phase === 'funding_lost') {
    return VTXO_EXIT_PHASE_COPY.fundingLost
  }
  if (phase === 'exited') {
    return VTXO_EXIT_PHASE_COPY.exited
  }
  return null
}

export function vtxoExitPhaseCopyFromMachineState(
  value: VtxoExitMachineStateId,
): VtxoExitPhaseCopyKind | null {
  return vtxoExitPhaseCopyFromPhase(vtxoExitPhaseFromMachineState(value))
}

export function formatVtxoExitPhaseCopy(kind: VtxoExitPhaseCopyKind | null): string {
  switch (kind) {
    case VTXO_EXIT_PHASE_COPY.waitingForHostTransactionBroadcast:
      return 'waiting for host transaction broadcast'
    case VTXO_EXIT_PHASE_COPY.waitingForFirstConfirmation:
      return 'waiting for first confirmation'
    case VTXO_EXIT_PHASE_COPY.waitingForSixConfirmations:
      return 'waiting for 6 confirmations'
    case VTXO_EXIT_PHASE_COPY.waitingForTimelock:
      return 'waiting for timelock'
    case VTXO_EXIT_PHASE_COPY.ready:
      return 'ready to complete'
    case VTXO_EXIT_PHASE_COPY.fundingLost:
      return 'funding lost'
    case VTXO_EXIT_PHASE_COPY.exited:
      return 'exited'
    default:
      return ''
  }
}

export function lookupVtxoExitChildPhase(
  snapshots: VtxoExitChildSnapshotMap,
  txid: string,
  vout: number,
): ArkadeVtxoExitPhase | undefined {
  return snapshots[vtxoExitOutpointKey(txid, vout)]?.phase
}

export function resolveVtxoExitPhaseForCopy(params: {
  childPhase?: ArkadeVtxoExitPhase
  recordPhase?: ArkadeVtxoExitPhase
}): ArkadeVtxoExitPhase | undefined {
  return params.childPhase ?? params.recordPhase
}

/**
 * After the broadcast job releases to idle, leftover children in these phases mean the unroll DAG
 * already reached 1-conf (or later). Pre–1-conf leftovers (`tagged`, `host_broadcast_attempted`,
 * `host_relayed`) are omitted so abort-after-register does not look complete.
 */
const BRANCH_COMPLETE_LEFTOVER_CHILD_PHASES: ReadonlySet<ArkadeVtxoExitPhase> = new Set([
  'host_confirmed',
  'unrolled',
  'complete_ready',
])

export function hasLeftoverBranchCompleteVtxoChildren(
  snapshots: VtxoExitChildSnapshotMap,
): boolean {
  return Object.values(snapshots).some((child) =>
    BRANCH_COMPLETE_LEFTOVER_CHILD_PHASES.has(child.phase),
  )
}

export function shouldShowUnilateralExitBranchCompleteStatus(params: {
  jobActive: boolean
  hasPersistedFailure: boolean
  vtxoExitSnapshots: VtxoExitChildSnapshotMap
}): boolean {
  if (params.jobActive || params.hasPersistedFailure) {
    return false
  }
  return hasLeftoverBranchCompleteVtxoChildren(params.vtxoExitSnapshots)
}
