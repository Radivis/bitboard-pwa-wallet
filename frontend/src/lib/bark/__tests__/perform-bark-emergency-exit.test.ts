import { describe, expect, it, vi } from 'vitest'
import {
  BarkCpfpUnfundableError,
  claimBarkEmergencyExits,
  progressBarkEmergencyExits,
} from '@/lib/bark/perform-bark-emergency-exit'
import type {
  ClaimBarkEmergencyExitDeps,
  ProgressBarkEmergencyExitDeps,
} from '@/lib/bark/perform-bark-emergency-exit'
import type { BarkEmergencyCpfpRequest, BarkEmergencyExitRow } from '@/workers/bark-api'

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

describe('progressBarkEmergencyExits', () => {
  it('runs one progress at a time', async () => {
    let inProgress = 0
    let maxInProgress = 0
    const deps: ProgressBarkEmergencyExitDeps = {
      progress: vi.fn(async () => {
        inProgress += 1
        maxInProgress = Math.max(maxInProgress, inProgress)
        await new Promise((resolve) => {
          setTimeout(resolve, 20)
        })
        inProgress -= 1
        return { requests: [] }
      }),
      signChild: vi.fn(async () => 'child'),
      provideChild: vi.fn(async () => undefined),
      rememberUnconfirmedChild: vi.fn(async () => undefined),
      onchainTotalSats: vi.fn(async () => 0),
    }

    await Promise.all([
      progressBarkEmergencyExits(deps, 1),
      progressBarkEmergencyExits(deps, 1),
    ])

    expect(maxInProgress).toBe(1)
    expect(deps.progress).toHaveBeenCalledTimes(2)
  })

  it('BARK-EMG-21 skips a child the bumper wallet cannot fund and still provides later children', async () => {
    const deps = progressDeps({
      signChild: vi.fn(async (request: BarkEmergencyCpfpRequest) => {
        if (request.parentTxid === 'parent-2') {
          throw new Error('bark_cpfp_insufficient_funds: short')
        }
        return `child-of-${request.parentTxid}`
      }),
    })

    await progressBarkEmergencyExits(deps, 1)

    expect(deps.provideChild).toHaveBeenCalledTimes(2)
    expect(deps.provideChild).toHaveBeenCalledWith('parent-1', 'child-of-parent-1')
    expect(deps.provideChild).toHaveBeenCalledWith('parent-3', 'child-of-parent-3')
    expect(deps.progress).toHaveBeenCalledTimes(2)
  })

  it('BARK-EMG-21 resolves with the requested and provided child counts', async () => {
    const deps = progressDeps({
      signChild: vi.fn(async (request: BarkEmergencyCpfpRequest) => {
        if (request.parentTxid !== 'parent-1') {
          throw new Error('bark_cpfp_insufficient_funds: short')
        }
        return 'child'
      }),
    })

    await expect(progressBarkEmergencyExits(deps, 1)).resolves.toEqual({
      requestedChildren: 3,
      providedChildren: 1,
      unfundedParentTxids: ['parent-2', 'parent-3'],
    })
  })

  it('BARK-EMG-22 fails as unfundable when the waiting children need more than the wallet holds including pending', async () => {
    const deps = progressDeps({
      signChild: vi.fn(async (request: BarkEmergencyCpfpRequest) => {
        if (request.parentTxid === 'parent-1') return 'child-1'
        throw shortfallError(3_000)
      }),
      onchainTotalSats: vi.fn(async () => 5_000),
    })

    const progressed = progressBarkEmergencyExits(deps, 1)

    await expect(progressed).rejects.toThrow(/^bark_cpfp_unfundable: /)
    await expect(progressed).rejects.toThrow('need at least 6000 sat')
    await expect(progressed).rejects.toThrow('holds 5000 sat')
    await expect(progressed).rejects.toBeInstanceOf(BarkCpfpUnfundableError)
    await expect(progressed).rejects.toMatchObject({
      waitingNeededSats: 6_000,
      onchainTotalSats: 5_000,
      unfundedParentTxids: ['parent-2', 'parent-3'],
    })
    expect(deps.provideChild).toHaveBeenCalledWith('parent-1', 'child-1')
    expect(deps.progress).toHaveBeenCalledTimes(2)
  })

  it('BARK-EMG-21 keeps waiting when confirmed and pending funds cover the waiting children', async () => {
    const deps = progressDeps({
      signChild: vi.fn(async (request: BarkEmergencyCpfpRequest) => {
        if (request.parentTxid === 'parent-1') return 'child-1'
        throw shortfallError(3_000)
      }),
      onchainTotalSats: vi.fn(async () => 6_000),
    })

    await expect(progressBarkEmergencyExits(deps, 1)).resolves.toEqual({
      requestedChildren: 3,
      providedChildren: 1,
      unfundedParentTxids: ['parent-2', 'parent-3'],
    })
  })

  it('does not read the wallet total when every child is funded', async () => {
    const deps = progressDeps()

    await progressBarkEmergencyExits(deps, 1)

    expect(deps.onchainTotalSats).not.toHaveBeenCalled()
  })

  it('BARK-EMG-21 skips a shortfall the crypto worker reports through Comlink', async () => {
    const deps = progressDeps({
      signChild: vi.fn(async (request: BarkEmergencyCpfpRequest) => {
        if (request.parentTxid === 'parent-1') return 'child-1'
        throw workerShortfallError(124)
      }),
    })

    await expect(progressBarkEmergencyExits(deps, 1)).resolves.toEqual({
      requestedChildren: 3,
      providedChildren: 1,
      unfundedParentTxids: ['parent-2', 'parent-3'],
    })
  })

  it('BARK-EMG-22 sums the needed sats of shortfalls the crypto worker reports through Comlink', async () => {
    const deps = progressDeps({
      signChild: vi.fn(async () => {
        throw workerShortfallError(124)
      }),
      onchainTotalSats: vi.fn(async () => 0),
    })

    await expect(progressBarkEmergencyExits(deps, 1)).rejects.toThrow(
      /^bark_cpfp_unfundable: Waiting exit transactions need at least 372 sat/,
    )
  })

  it('rethrows a signer error that is not a funding shortfall', async () => {
    const deps = progressDeps({
      signChild: vi.fn(async () => {
        throw new Error('Pay-to-Anchor child could not be fully signed')
      }),
    })

    await expect(progressBarkEmergencyExits(deps, 1)).rejects.toThrow(
      'Pay-to-Anchor child could not be fully signed',
    )
    expect(deps.provideChild).not.toHaveBeenCalled()
  })
})

function shortfallError(neededSats: number): Error {
  return new Error(
    `bark_cpfp_insufficient_funds: needed_sats=${neededSats}; Insufficient funds: 0 sat available of ${neededSats} sat needed`,
  )
}

/** `CryptoError::Transaction` as `rethrowWasmCryptoErrorForComlink` forwards it to the main thread. */
function workerShortfallError(neededSats: number): Error {
  return new Error(
    JSON.stringify({
      code: 'transaction',
      message: `Transaction error: bark_cpfp_insufficient_funds: needed_sats=${neededSats}; Insufficient funds: 0 BTC available of 0.00000124 BTC needed`,
    }),
  )
}

function cpfpRequest(parentTxid: string): BarkEmergencyCpfpRequest {
  return { vtxoId: `vtxo-${parentTxid}`, parentTxid, parentTxHex: '00' }
}

function progressDeps(
  overrides: Partial<ProgressBarkEmergencyExitDeps> = {},
): ProgressBarkEmergencyExitDeps {
  return {
    progress: vi.fn(async () => ({
      requests: ['parent-1', 'parent-2', 'parent-3'].map(cpfpRequest),
    })),
    signChild: vi.fn(async () => 'child'),
    provideChild: vi.fn(async () => undefined),
    rememberUnconfirmedChild: vi.fn(async () => undefined),
    onchainTotalSats: vi.fn(async () => 1_000_000),
    ...overrides,
  }
}
