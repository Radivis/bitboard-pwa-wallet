import { describe, expect, it, vi } from 'vitest'
import {
  claimBarkEmergencyExits,
  progressBarkEmergencyExits,
  startBarkEmergencyExit,
} from '@/lib/bark/perform-bark-emergency-exit'
import type { BarkEmergencyCpfpRequest } from '@/workers/bark-api'

const requestA: BarkEmergencyCpfpRequest = {
  vtxoId: 'vtxo-a',
  parentTxid: 'parent-a',
  parentTxHex: 'aa',
  rbfMinFeeRateSatPerKwu: null,
  currentPackageFeeSats: null,
}

const requestB: BarkEmergencyCpfpRequest = {
  vtxoId: 'vtxo-b',
  parentTxid: 'parent-b',
  parentTxHex: 'bb',
  rbfMinFeeRateSatPerKwu: 250,
  currentPackageFeeSats: 100,
}

describe('startBarkEmergencyExit', () => {
  it('BARK-EMG-04 forwards selected ids or an empty whole-wallet list and does not offboard', async () => {
    const start = vi.fn(async () => undefined)
    const offboardAll = vi.fn()
    const sendOnchain = vi.fn()
    await startBarkEmergencyExit({ start }, ['vtxo-a'])
    await startBarkEmergencyExit({ start }, [])
    expect(start).toHaveBeenNthCalledWith(1, ['vtxo-a'])
    expect(start).toHaveBeenNthCalledWith(2, [])
    expect(offboardAll).not.toHaveBeenCalled()
    expect(sendOnchain).not.toHaveBeenCalled()
  })
})

describe('progressBarkEmergencyExits', () => {
  it('BARK-EMG-05 progresses, signs a child for each request, then progresses again', async () => {
    const calls: string[] = []
    const progress = vi.fn(async () => {
      calls.push('progress')
      if (progress.mock.calls.length === 1) {
        return { requests: [requestA, requestB] }
      }
      return { requests: [] }
    })
    const signChild = vi.fn(async (request: BarkEmergencyCpfpRequest) => {
      calls.push(`sign:${request.parentTxid}`)
      return `child-${request.parentTxid}`
    })
    const provideChild = vi.fn(async (parentTxid: string, childTxHex: string) => {
      calls.push(`provide:${parentTxid}:${childTxHex}`)
    })
    const rememberUnconfirmedChild = vi.fn(async (childTxHex: string) => {
      calls.push(`remember:${childTxHex}`)
    })

    await progressBarkEmergencyExits(
      {
        progress,
        signChild,
        provideChild,
        rememberUnconfirmedChild,
      },
      1,
    )

    expect(calls).toEqual([
      'progress',
      'sign:parent-a',
      'provide:parent-a:child-parent-a',
      'remember:child-parent-a',
      'sign:parent-b',
      'provide:parent-b:child-parent-b',
      'remember:child-parent-b',
      'progress',
    ])
    expect(signChild).toHaveBeenCalledWith(requestA, 1)
    expect(signChild).toHaveBeenCalledWith(requestB, 1)
  })

  it('stops without a success path when signing a child fails', async () => {
    const provideChild = vi.fn()
    const progress = vi.fn(async () => ({ requests: [requestA] }))
    await expect(
      progressBarkEmergencyExits(
        {
          progress,
          signChild: async () => {
            throw new Error('bark_cpfp_insufficient_funds: short')
          },
          provideChild,
          rememberUnconfirmedChild: vi.fn(),
        },
        1,
      ),
    ).rejects.toThrow(/bark_cpfp_insufficient_funds/)
    expect(provideChild).not.toHaveBeenCalled()
    expect(progress).toHaveBeenCalledTimes(1)
  })
})

describe('claimBarkEmergencyExits', () => {
  it('BARK-EMG-07 drains to the given address and broadcasts the signed transaction', async () => {
    const drain = vi.fn(async () => ({ psbtHex: 'psbt', rawTxHex: 'raw-claim' }))
    const broadcast = vi.fn(async () => 'claim-txid')
    const syncBark = vi.fn(async () => undefined)
    const startOnchainBackgroundSync = vi.fn()

    const claimed = await claimBarkEmergencyExits(
      { drain, broadcast, syncBark, startOnchainBackgroundSync },
      'tb1qcurrent',
      1,
    )

    expect(drain).toHaveBeenCalledWith('tb1qcurrent', 1)
    expect(broadcast).toHaveBeenCalledWith('raw-claim')
    expect(claimed.txid).toBe('claim-txid')
    expect(syncBark).toHaveBeenCalledOnce()
    expect(startOnchainBackgroundSync).toHaveBeenCalledOnce()
  })

  it('does not report a txid when the broadcast fails', async () => {
    const startOnchainBackgroundSync = vi.fn()
    await expect(
      claimBarkEmergencyExits(
        {
          drain: async () => ({ psbtHex: 'psbt', rawTxHex: 'raw-claim' }),
          broadcast: async () => {
            throw new Error('broadcast rejected')
          },
          syncBark: vi.fn(),
          startOnchainBackgroundSync,
        },
        'tb1qcurrent',
        1,
      ),
    ).rejects.toThrow(/broadcast rejected/)
    expect(startOnchainBackgroundSync).not.toHaveBeenCalled()
  })
})
