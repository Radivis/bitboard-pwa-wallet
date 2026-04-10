import { describe, expect, it } from 'vitest'
import {
  isCoinbase,
  LAB_COINBASE_PREV_TXID_HEX,
  LAB_COINBASE_PREV_VOUT,
} from '@/lib/lab-operations'

describe('isCoinbase', () => {
  it('returns true for empty inputs (legacy WASM block effects)', () => {
    expect(isCoinbase({ inputs: [] })).toBe(true)
  })

  it('returns true for block-effects single input with coinbase prevout (snake_case)', () => {
    expect(
      isCoinbase({
        inputs: [{ prev_txid: LAB_COINBASE_PREV_TXID_HEX, prev_vout: LAB_COINBASE_PREV_VOUT }],
      }),
    ).toBe(true)
  })

  it('returns true for persisted detail single input with coinbase prevout (camelCase)', () => {
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
          { prev_txid: LAB_COINBASE_PREV_TXID_HEX, prev_vout: LAB_COINBASE_PREV_VOUT },
          { prev_txid: 'aa'.repeat(32), prev_vout: 0 },
        ],
      }),
    ).toBe(false)
  })
})
