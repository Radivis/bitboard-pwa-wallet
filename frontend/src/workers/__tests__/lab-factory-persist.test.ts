import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LabState } from '@/workers/lab-api'
import { EMPTY_LAB_STATE } from '@/workers/lab-api'

const getLabDatabase = vi.hoisted(() => vi.fn())
const notifyLabStatePersistedAfterCommit = vi.hoisted(() => vi.fn())

vi.mock('@/db', () => ({
  getLabDatabase,
  ensureLabMigrated: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/lab-cross-tab-sync', () => ({
  notifyLabStatePersistedAfterCommit,
}))

import { persistLabState } from '@/workers/lab-factory'

describe('persistLabState', () => {
  let transactionCount = 0
  const utxoBatchSizes: number[] = []

  beforeEach(() => {
    transactionCount = 0
    utxoBatchSizes.length = 0
    notifyLabStatePersistedAfterCommit.mockClear()

    const mockTrx = {
      deleteFrom: vi.fn(() => ({
        execute: vi.fn().mockResolvedValue(undefined),
      })),
      insertInto: vi.fn((table: string) => ({
        values: vi.fn((rows: unknown[]) => {
          if (table === 'utxos' && Array.isArray(rows)) {
            utxoBatchSizes.push(rows.length)
          }
          return { execute: vi.fn().mockResolvedValue(undefined) }
        }),
      })),
    }

    getLabDatabase.mockReturnValue({
      transaction: () => ({
        execute: vi.fn(async (fn: (trx: typeof mockTrx) => Promise<void>) => {
          transactionCount += 1
          await fn(mockTrx)
        }),
      }),
    } as never)
  })

  it('runs a single database transaction for one persist', async () => {
    const state: LabState = { ...EMPTY_LAB_STATE }
    await persistLabState(state)
    expect(transactionCount).toBe(1)
    expect(notifyLabStatePersistedAfterCommit).toHaveBeenCalledTimes(1)
  })

  it('batches large utxo persists into multiple INSERT chunks (persist batch size)', async () => {
    const utxos = Array.from({ length: 250 }, (_, i) => ({
      txid: 'aa',
      vout: i,
      address: `addr${i}`,
      amountSats: 1000,
      scriptPubkeyHex: '76a914' + '00'.repeat(22),
    }))
    const state: LabState = { ...EMPTY_LAB_STATE, utxos }

    await persistLabState(state)

    expect(utxoBatchSizes).toEqual([200, 50])
  })
})
