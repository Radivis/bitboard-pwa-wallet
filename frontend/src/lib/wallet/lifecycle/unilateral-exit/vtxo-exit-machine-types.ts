import type { ArkadeVtxoExitPhase, ArkadeVtxoExitRecordDto } from '@/workers/arkade-api'

export const VTXO_EXIT_MACHINE_STATE = {
  routing: 'routing',
  tagged: 'tagged',
  host_broadcast_attempted: 'host_broadcast_attempted',
  host_relayed: 'host_relayed',
  host_confirmed: 'host_confirmed',
  unrolled: 'unrolled',
  complete_ready: 'complete_ready',
  completing: 'completing',
  exited: 'exited',
  funding_lost: 'funding_lost',
  idle: 'idle',
} as const

export type VtxoExitMachineStateId =
  (typeof VTXO_EXIT_MACHINE_STATE)[keyof typeof VTXO_EXIT_MACHINE_STATE]

export type VtxoExitMachineContext = {
  txid: string
  vout: number
  amountSats: number
  hostTxid: string
  taggedAt: number
  phase: ArkadeVtxoExitPhase
}

export type VtxoExitMachineInput = ArkadeVtxoExitRecordDto

export type VtxoExitMachineEvent =
  | { type: 'HYDRATE'; phase: ArkadeVtxoExitPhase }
  | { type: 'HOST_REGISTERED' }
  | { type: 'HOST_RELAYED' }
  | { type: 'HOST_CONFIRMED' }
  | { type: 'UNROLLED' }
  | { type: 'COMPLETE_READY' }
  | { type: 'COMPLETE' }
  | { type: 'EXITED' }
  | { type: 'FUNDING_LOST' }
  | { type: 'UNTAG' }

export const VTXO_EXIT_CHILD_ID_PREFIX = 'vtxoExit:'

export function vtxoExitOutpointKey(txid: string, vout: number): string {
  return `${txid}:${vout}`
}

export function vtxoExitChildId(txid: string, vout: number): string {
  return `${VTXO_EXIT_CHILD_ID_PREFIX}${vtxoExitOutpointKey(txid, vout)}`
}

export function isVtxoExitChildId(actorId: string): boolean {
  return actorId.startsWith(VTXO_EXIT_CHILD_ID_PREFIX)
}

export type VtxoExitChildView = {
  childId: string
  txid: string
  vout: number
  phase: ArkadeVtxoExitPhase
  machineState: VtxoExitMachineStateId
}

export type VtxoExitChildSnapshotMap = Record<string, VtxoExitChildView>

export function createInitialVtxoExitContext(
  input: VtxoExitMachineInput,
): VtxoExitMachineContext {
  return {
    txid: input.txid,
    vout: input.vout,
    amountSats: input.amountSats,
    hostTxid: input.hostTxid,
    taggedAt: input.taggedAt,
    phase: input.phase,
  }
}
