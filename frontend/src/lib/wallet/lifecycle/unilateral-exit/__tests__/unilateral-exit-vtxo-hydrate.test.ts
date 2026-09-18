import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hydrateVtxoExitChildrenFromWasm,
  registerVtxoExitHydrateSender,
  resetVtxoExitHydrateSenderForTests,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-vtxo-hydrate'

const listVtxoExitRecords = vi.hoisted(() => vi.fn(async () => []))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    listVtxoExitRecords,
  }),
}))

describe('unilateral-exit-vtxo-hydrate', () => {
  afterEach(() => {
    resetVtxoExitHydrateSenderForTests()
    listVtxoExitRecords.mockReset()
  })

  it('hydrate sender is registered without actors importing runtime', async () => {
    const send = vi.fn()
    const records = [
      {
        txid: 'aa'.repeat(32),
        vout: 0,
        amountSats: 1,
        phase: 'tagged' as const,
        taggedAt: 1,
      },
    ]
    listVtxoExitRecords.mockResolvedValue(records)
    registerVtxoExitHydrateSender(send)

    await hydrateVtxoExitChildrenFromWasm()

    expect(listVtxoExitRecords).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(records)
  })
})
