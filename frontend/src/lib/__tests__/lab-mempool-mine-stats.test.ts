import { describe, expect, it } from 'vitest'
import { discardedMempoolConflictTxCount } from '@/lib/lab-mempool-mine-stats'

describe('discardedMempoolConflictTxCount', () => {
  it('returns conflict drops when mempool loses more than included txs', () => {
    expect(
      discardedMempoolConflictTxCount({
        mempoolSizeBefore: 3,
        mempoolSizeAfterFirstBlock: 0,
        includedMempoolTxCount: 2,
      }),
    ).toBe(1)
  })

  it('returns zero when removals equal included count only', () => {
    expect(
      discardedMempoolConflictTxCount({
        mempoolSizeBefore: 2,
        mempoolSizeAfterFirstBlock: 0,
        includedMempoolTxCount: 2,
      }),
    ).toBe(0)
  })

  it('returns zero when mempool unchanged and nothing included', () => {
    expect(
      discardedMempoolConflictTxCount({
        mempoolSizeBefore: 0,
        mempoolSizeAfterFirstBlock: 0,
        includedMempoolTxCount: 0,
      }),
    ).toBe(0)
  })

  it('never returns negative', () => {
    expect(
      discardedMempoolConflictTxCount({
        mempoolSizeBefore: 1,
        mempoolSizeAfterFirstBlock: 1,
        includedMempoolTxCount: 1,
      }),
    ).toBe(0)
  })
})
