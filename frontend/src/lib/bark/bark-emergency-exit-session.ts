import {
  readBarkEmergencyExitDrain,
  readBarkEmergencyExitEstimate,
  readBarkEmergencyExitProgress,
  readBarkEmergencyExitRows,
  readBarkExitGraph,
} from '@/lib/bark/bark-emergency-exit'
import type { BitboardBarkWasm } from '@/lib/bark/load-bitboard-bark-wasm'
import type {
  BarkEmergencyExitDrain,
  BarkEmergencyExitEstimate,
  BarkEmergencyExitProgress,
  BarkEmergencyExitRow,
  BarkExitGraph,
} from '@/workers/bark-api'

export type BarkEmergencyExitWasm = Pick<
  BitboardBarkWasm,
  | 'bark_estimate_emergency_exit'
  | 'bark_start_emergency_exit'
  | 'bark_list_emergency_exits'
  | 'bark_progress_emergency_exits'
  | 'bark_provide_emergency_exit_cpfp'
  | 'bark_cancel_emergency_exit'
  | 'bark_drain_emergency_exits'
  | 'bark_exit_topology'
  | 'bark_sync_exits'
  | 'bark_broadcast_emergency_exit_claim'
>

function vtxoIdsJson(vtxoIds: string[]): string {
  return JSON.stringify(vtxoIds)
}

export async function estimateEmergencyExitFromWasm(
  wasm: BarkEmergencyExitWasm,
  vtxoIds: string[],
  feeRateSatPerVb: number,
): Promise<BarkEmergencyExitEstimate> {
  return readBarkEmergencyExitEstimate(
    await wasm.bark_estimate_emergency_exit(vtxoIdsJson(vtxoIds), feeRateSatPerVb),
  )
}

export async function startEmergencyExitFromWasm(
  wasm: BarkEmergencyExitWasm,
  vtxoIds: string[],
): Promise<void> {
  await wasm.bark_start_emergency_exit(vtxoIdsJson(vtxoIds))
}

export async function listEmergencyExitsFromWasm(
  wasm: BarkEmergencyExitWasm,
): Promise<BarkEmergencyExitRow[]> {
  return readBarkEmergencyExitRows(await wasm.bark_list_emergency_exits())
}

export async function progressEmergencyExitsFromWasm(
  wasm: BarkEmergencyExitWasm,
): Promise<BarkEmergencyExitProgress> {
  return readBarkEmergencyExitProgress(await wasm.bark_progress_emergency_exits())
}

export async function provideEmergencyExitCpfpFromWasm(
  wasm: BarkEmergencyExitWasm,
  exitTxid: string,
  childTxHex: string,
): Promise<void> {
  await wasm.bark_provide_emergency_exit_cpfp(exitTxid, childTxHex)
}

export async function cancelEmergencyExitFromWasm(
  wasm: BarkEmergencyExitWasm,
  vtxoId: string,
): Promise<void> {
  await wasm.bark_cancel_emergency_exit(vtxoId)
}

export async function drainEmergencyExitsFromWasm(
  wasm: BarkEmergencyExitWasm,
  address: string,
  feeRateSatPerVb: number,
  excludeVtxoIds: string[],
): Promise<BarkEmergencyExitDrain> {
  return readBarkEmergencyExitDrain(
    await wasm.bark_drain_emergency_exits(
      address,
      feeRateSatPerVb,
      JSON.stringify(excludeVtxoIds),
    ),
  )
}

export async function syncEmergencyExitsFromWasm(
  wasm: BarkEmergencyExitWasm,
): Promise<BarkEmergencyExitRow[]> {
  return readBarkEmergencyExitRows(await wasm.bark_sync_exits())
}

export async function broadcastEmergencyExitClaimFromWasm(
  wasm: BarkEmergencyExitWasm,
  rawTxHex: string,
): Promise<void> {
  await wasm.bark_broadcast_emergency_exit_claim(rawTxHex)
}

export async function exitTopologyFromWasm(
  wasm: BarkEmergencyExitWasm,
  vtxoIds: string[],
): Promise<BarkExitGraph> {
  return readBarkExitGraph(await wasm.bark_exit_topology(vtxoIdsJson(vtxoIds)))
}
