import { isRecoverable, type VirtualCoin } from '@arkade-os/sdk'

/** Serializable VTXO row for unilateral / exit UI (worker → main thread). */
export interface ArkadeExitCandidateRow {
  id: string
  txid: string
  vout: number
  amountSats: number
  virtualStatusState: string
  isRecoverable: boolean
  isUnrolled: boolean
  canStartUnroll: boolean
  canComplete: boolean
}

export function mapVirtualCoinToExitCandidate(vtxo: VirtualCoin): ArkadeExitCandidateRow {
  const recoverable = isRecoverable(vtxo)
  const isUnrolled = vtxo.isUnrolled === true
  const isSpent = vtxo.isSpent === true
  return {
    id: `${vtxo.txid}:${vtxo.vout}`,
    txid: vtxo.txid,
    vout: vtxo.vout,
    amountSats: vtxo.value,
    virtualStatusState: vtxo.virtualStatus?.state ?? 'unknown',
    isRecoverable: recoverable,
    isUnrolled,
    canStartUnroll: recoverable && !isUnrolled && !isSpent,
    canComplete: isUnrolled && !isSpent,
  }
}

export function mapVirtualCoinsToExitCandidates(
  vtxos: VirtualCoin[],
): ArkadeExitCandidateRow[] {
  return vtxos.map(mapVirtualCoinToExitCandidate)
}
