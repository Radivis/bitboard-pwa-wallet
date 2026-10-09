import type { BarkEmergencyExitRow } from '@/workers/bark-api'
import type { PendingEmergencyClaim } from '@/lib/wallet/wallet-domain-types'

const BARK_OBSERVED_CLAIM_STATES = new Set(['claimInProgress', 'claimed'])

/**
 * Bark has seen the claim when every drained VTXO is claim-in-progress or claimed,
 * or no longer listed as claimable.
 */
export function claimObservedByBark(
  vtxoIds: string[],
  rows: BarkEmergencyExitRow[],
): boolean {
  return vtxoIds.every((vtxoId) => {
    const row = rows.find((candidate) => candidate.vtxoId === vtxoId)
    if (row == null) return true
    return BARK_OBSERVED_CLAIM_STATES.has(row.state)
  })
}

/** Shows a remembered claim as in progress while Bark still says claimable. */
export function overlayPendingEmergencyClaim(
  rows: BarkEmergencyExitRow[],
  pending: PendingEmergencyClaim | null,
): BarkEmergencyExitRow[] {
  if (pending == null) return rows
  const heldVtxoIds = new Set(pending.vtxoIds)
  return rows.map((row) =>
    row.state === 'claimable' && heldVtxoIds.has(row.vtxoId)
      ? { ...row, state: 'claimInProgress' }
      : row,
  )
}

export function emergencyExitClaimEnabled(rows: BarkEmergencyExitRow[]): boolean {
  return rows.some((row) => row.state === 'claimable')
}

export function pendingClaimDecision(params: {
  vtxoIds: string[]
  rows: BarkEmergencyExitRow[]
  visibility: 'present' | 'gone' | 'unknown'
}): 'clear' | 'keep' {
  if (claimObservedByBark(params.vtxoIds, params.rows)) return 'clear'
  if (params.visibility === 'gone') return 'clear'
  return 'keep'
}
