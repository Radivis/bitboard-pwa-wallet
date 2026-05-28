import { describe, expect, it } from 'vitest'
import {
  isCoinbase,
  LAB_COINBASE_PREV_TXID_HEX,
  LAB_COINBASE_PREV_VOUT,
} from '@/lib/lab/lab-operations'

describe('isCoinbase', () => {
  it('returns false for empty inputs', () => {
    expect(isCoinbase({ inputs: [] })).toBe(false)
  })

  it('returns true for block-effects single input with coinbase prevout', () => {
    expect(
      isCoinbase({
        inputs: [{ prevTxid: LAB_COINBASE_PREV_TXID_HEX, prevVout: LAB_COINBASE_PREV_VOUT }],
      }),
    ).toBe(true)
  })

  it('returns true for persisted detail single input with coinbase prevout', () => {
    expect(
      isCoinbase({
        inputs: [{ prevTxid: LAB_COINBASE_PREV_TXID_HEX, prevVout: LAB_COINBASE_PREV_VOUT }],
      }),
    ).toBe(true)
  })

  it('returns false for a single spend row without prevout fields', () => {
    expect(
      isCoinbase({
        inputs: [{ address: 'bcrt1qxy', amountSats: 1000 }],
      }),
    ).toBe(false)
  })

  it('returns false for multiple inputs', () => {
    expect(
      isCoinbase({
        inputs: [
          { prevTxid: LAB_COINBASE_PREV_TXID_HEX, prevVout: LAB_COINBASE_PREV_VOUT },
          { prevTxid: 'aa'.repeat(32), prevVout: 0 },
        ],
      }),
    ).toBe(false)
  })
})
