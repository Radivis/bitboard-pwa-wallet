import type {
  ArkadeExitCandidateDto,
  ArkadeUnilateralExitInProgressDto,
  ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'

function vtxoIdForOutpoint(
  outpoint: ArkadeVtxoOutpoint,
  candidates: ArkadeExitCandidateDto[],
  inProgressRows: ArkadeUnilateralExitInProgressDto[],
): string | null {
  const candidate = candidates.find(
    (row) => row.txid === outpoint.txid && row.vout === outpoint.vout,
  )
  if (candidate != null) {
    return candidate.id
  }
  const inProgress = inProgressRows.find(
    (row) => row.txid === outpoint.txid && row.vout === outpoint.vout,
  )
  return inProgress?.id ?? null
}

export function resolveVtxoIdsForOutpoints(
  outpoints: ArkadeVtxoOutpoint[],
  candidates: ArkadeExitCandidateDto[],
  inProgressRows: ArkadeUnilateralExitInProgressDto[],
): string[] {
  const ids = new Set<string>()
  for (const outpoint of outpoints) {
    const id = vtxoIdForOutpoint(outpoint, candidates, inProgressRows)
    if (id != null) {
      ids.add(id)
    }
  }
  return [...ids].sort()
}
