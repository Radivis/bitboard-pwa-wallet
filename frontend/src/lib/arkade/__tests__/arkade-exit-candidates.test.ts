import { describe, expect, it } from 'vitest'
import { mapVirtualCoinToExitCandidate } from '@/lib/arkade/arkade-exit-candidates'
import type { VirtualCoin } from '@arkade-os/sdk'

function baseVtxo(overrides: Partial<VirtualCoin> = {}): VirtualCoin {
  return {
    txid: 'abc123',
    vout: 0,
    value: 50_000,
    status: { confirmed: true, blockHeight: 1 },
    createdAt: new Date(),
    script: '5120ab',
    isUnrolled: false,
    virtualStatus: { state: 'swept' },
    ...overrides,
  } as VirtualCoin
}

describe('mapVirtualCoinToExitCandidate', () => {
  it('marks recoverable unspent vtxos as canStartUnroll', () => {
    const row = mapVirtualCoinToExitCandidate(
      baseVtxo({
        virtualStatus: { state: 'swept' },
        isUnrolled: false,
        isSpent: false,
      }),
    )
    expect(row.canStartUnroll).toBe(true)
    expect(row.canComplete).toBe(false)
    expect(row.id).toBe('abc123:0')
  })

  it('marks unrolled vtxos as canComplete', () => {
    const row = mapVirtualCoinToExitCandidate(
      baseVtxo({
        isUnrolled: true,
        isSpent: false,
      }),
    )
    expect(row.canComplete).toBe(true)
    expect(row.canStartUnroll).toBe(false)
  })
})
