import { describe, expect, it, vi } from 'vitest'
import { claimBarkEmergencyExits } from '@/lib/bark/perform-bark-emergency-exit'
import type { ClaimBarkEmergencyExitDeps } from '@/lib/bark/perform-bark-emergency-exit'

function claimDeps(
  syncBark: ClaimBarkEmergencyExitDeps['syncBark'],
): ClaimBarkEmergencyExitDeps {
  return {
    drain: vi.fn(async () => ({ psbtHex: '00', rawTxHex: '00' })),
    broadcast: vi.fn(async () => 'txid-claim'),
    syncBark,
    startOnchainBackgroundSync: vi.fn(),
  }
}

describe('claimBarkEmergencyExits', () => {
  it('returns a sync warning when the post-claim Bark sync throws', async () => {
    const deps = claimDeps(vi.fn(async () => {
      throw new Error('Bark server unreachable')
    }))

    await expect(claimBarkEmergencyExits(deps, 'tb1qcurrent', 2)).resolves.toEqual({
      txid: 'txid-claim',
      syncWarning: 'Bark server unreachable',
    })
    expect(deps.startOnchainBackgroundSync).toHaveBeenCalledOnce()
  })

  it('returns no sync warning when the post-claim Bark sync succeeds', async () => {
    const deps = claimDeps(vi.fn(async () => undefined))

    await expect(claimBarkEmergencyExits(deps, 'tb1qcurrent', 2)).resolves.toEqual({
      txid: 'txid-claim',
      syncWarning: null,
    })
  })
})
