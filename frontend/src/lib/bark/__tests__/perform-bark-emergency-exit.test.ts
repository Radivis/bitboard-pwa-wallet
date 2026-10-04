import { describe, expect, it, vi } from 'vitest'
import { claimBarkEmergencyExits } from '@/lib/bark/perform-bark-emergency-exit'
import type { ClaimBarkEmergencyExitDeps } from '@/lib/bark/perform-bark-emergency-exit'
import type { BarkEmergencyExitRow } from '@/workers/bark-api'

function claimableRow(vtxoId: string): BarkEmergencyExitRow {
  return { vtxoId, state: 'claimable', cancelable: false }
}

function claimDeps(
  overrides: Partial<ClaimBarkEmergencyExitDeps> = {},
): ClaimBarkEmergencyExitDeps {
  return {
    pendingVtxoIds: vi.fn(async () => []),
    drain: vi.fn(async () => ({ psbtHex: '00', rawTxHex: '00', vtxoIds: ['vtxo-1'] })),
    broadcast: vi.fn(async () => 'txid-claim'),
    rememberPendingClaim: vi.fn(async () => undefined),
    broadcastOnBarkChain: vi.fn(async () => undefined),
    syncExits: vi.fn(async () => [claimableRow('vtxo-1')]),
    clearPendingClaim: vi.fn(async () => undefined),
    syncBark: vi.fn(async () => undefined),
    startOnchainBackgroundSync: vi.fn(),
    ...overrides,
  }
}

describe('claimBarkEmergencyExits', () => {
  it('BARK-EMG-07 broadcasts through the app Esplora client', async () => {
    const deps = claimDeps({
      syncExits: vi.fn(async () => [{ vtxoId: 'vtxo-1', state: 'claimInProgress', cancelable: false }]),
    })

    await claimBarkEmergencyExits(deps, 'tb1qcurrent', 2)

    expect(deps.broadcast).toHaveBeenCalledWith('00')
  })

  it('BARK-EMG-16 stores the pending set before exit sync and does not finish an unobserved claim', async () => {
    const events: string[] = []
    const deps = claimDeps({
      rememberPendingClaim: vi.fn(async (pending) => {
        events.push('remember')
        expect(pending).toEqual({ txid: 'txid-claim', vtxoIds: ['vtxo-1'] })
      }),
      broadcastOnBarkChain: vi.fn(async () => {
        events.push('barkBroadcast')
      }),
      syncExits: vi.fn(async () => {
        events.push('syncExits')
        return [claimableRow('vtxo-1')]
      }),
    })

    await expect(claimBarkEmergencyExits(deps, 'tb1qcurrent', 2)).resolves.toEqual({
      txid: 'txid-claim',
      observed: false,
    })
    expect(events).toEqual(['remember', 'barkBroadcast', 'syncExits'])
    expect(deps.clearPendingClaim).not.toHaveBeenCalled()
    expect(deps.startOnchainBackgroundSync).toHaveBeenCalledOnce()
  })

  it('BARK-EMG-16 excludes a remembered claim from the next drain', async () => {
    const deps = claimDeps({
      pendingVtxoIds: vi.fn(async () => ['vtxo-held']),
      drain: vi.fn(async () => ({ psbtHex: '00', rawTxHex: '00', vtxoIds: ['vtxo-fresh'] })),
      syncExits: vi.fn(async () => [
        { vtxoId: 'vtxo-fresh', state: 'claimInProgress', cancelable: false },
      ]),
    })

    await claimBarkEmergencyExits(deps, 'tb1qcurrent', 2)

    expect(deps.drain).toHaveBeenCalledWith('tb1qcurrent', 2, ['vtxo-held'])
  })

  it('finishes the claim when Bark reports claim in progress', async () => {
    const deps = claimDeps({
      syncExits: vi.fn(async () => [
        { vtxoId: 'vtxo-1', state: 'claimInProgress', cancelable: false },
      ]),
    })

    await expect(claimBarkEmergencyExits(deps, 'tb1qcurrent', 2)).resolves.toEqual({
      txid: 'txid-claim',
      observed: true,
    })
    expect(deps.clearPendingClaim).toHaveBeenCalledOnce()
  })

  it('keeps the pending set when exit sync throws after the app broadcast', async () => {
    const deps = claimDeps({
      syncExits: vi.fn(async () => {
        throw new Error('Bark chain source unreachable')
      }),
    })

    await expect(claimBarkEmergencyExits(deps, 'tb1qcurrent', 2)).resolves.toEqual({
      txid: 'txid-claim',
      observed: false,
    })
    expect(deps.rememberPendingClaim).toHaveBeenCalledOnce()
    expect(deps.clearPendingClaim).not.toHaveBeenCalled()
  })
})
