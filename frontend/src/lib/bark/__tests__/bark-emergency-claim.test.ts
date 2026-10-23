import { describe, expect, it } from 'vitest'
import {
  claimObservedByBark,
  emergencyExitClaimEnabled,
  overlayPendingEmergencyClaim,
  pendingClaimDecision,
} from '@/lib/bark/bark-emergency-claim'
import type { BarkEmergencyExitRow } from '@/workers/bark-api'

function row(vtxoId: string, state: BarkEmergencyExitRow['state']): BarkEmergencyExitRow {
  return { vtxoId, state, cancelable: false }
}

describe('bark emergency claim observation', () => {
  it('treats claim-in-progress, claimed, and a dropped row as observed', () => {
    expect(claimObservedByBark(['a'], [row('a', 'claimInProgress')])).toBe(true)
    expect(claimObservedByBark(['a'], [row('a', 'claimed')])).toBe(true)
    expect(claimObservedByBark(['a'], [])).toBe(true)
    expect(claimObservedByBark(['a'], [row('a', 'claimable')])).toBe(false)
  })

  it('shows a remembered claimable exit as claim in progress and blocks a fresh claim', () => {
    const overlaid = overlayPendingEmergencyClaim(
      [row('held', 'claimable'), row('fresh', 'claimable')],
      { txid: 'abc', vtxoIds: ['held'] },
    )
    expect(overlaid.find((exitRow) => exitRow.vtxoId === 'held')?.state).toBe('claimInProgress')
    expect(overlaid.find((exitRow) => exitRow.vtxoId === 'fresh')?.state).toBe('claimable')
    expect(emergencyExitClaimEnabled(overlaid)).toBe(true)
    expect(
      emergencyExitClaimEnabled(
        overlayPendingEmergencyClaim([row('held', 'claimable')], {
          txid: 'abc',
          vtxoIds: ['held'],
        }),
      ),
    ).toBe(false)
  })

  it('clears the pending claim when Bark has seen it or the transaction is gone', () => {
    expect(
      pendingClaimDecision({
        vtxoIds: ['a'],
        rows: [row('a', 'claimInProgress')],
        visibility: 'present',
      }),
    ).toBe('clear')
    expect(
      pendingClaimDecision({
        vtxoIds: ['a'],
        rows: [row('a', 'claimable')],
        visibility: 'gone',
      }),
    ).toBe('clear')
    expect(
      pendingClaimDecision({
        vtxoIds: ['a'],
        rows: [row('a', 'claimable')],
        visibility: 'unknown',
      }),
    ).toBe('keep')
  })
})
