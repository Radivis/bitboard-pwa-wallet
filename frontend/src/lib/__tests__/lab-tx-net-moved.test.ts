import { describe, expect, it } from 'vitest'
import { netMovedSatsForBlock, netMovedSatsForLabTx } from '@/lib/lab-tx-net-moved'
import type { LabTxDetails } from '@/workers/lab-api'
import { LAB_COINBASE_PREV_TXID_HEX, LAB_COINBASE_PREV_VOUT } from '@/lib/lab-operations'

function coinbaseTx(overrides: Partial<LabTxDetails> = {}): LabTxDetails {
  return {
    txid: 'cb',
    blockHeight: 0,
    blockTime: 1,
    confirmations: 1,
    inputs: [
      {
        address: '',
        amountSats: 0,
        prevTxid: LAB_COINBASE_PREV_TXID_HEX,
        prevVout: LAB_COINBASE_PREV_VOUT,
      },
    ],
    outputs: [{ address: 'a', amountSats: 5_000_000_000 }],
    ...overrides,
  }
}

describe('netMovedSatsForLabTx', () => {
  it('sums all outputs for coinbase', () => {
    const tx = coinbaseTx({
      outputs: [
        { address: 'm', amountSats: 5_000_000_000 },
        { address: 'x', amountSats: 1_000 },
      ],
    })
    expect(netMovedSatsForLabTx(tx)).toBe(5_000_001_000)
  })

  it('sums only non-change outputs for non-coinbase', () => {
    const tx: LabTxDetails = {
      txid: 't1',
      blockHeight: 1,
      blockTime: 1,
      confirmations: 1,
      inputs: [
        { address: 'a', amountSats: 10_000, prevTxid: 'p', prevVout: 0 },
      ],
      outputs: [
        { address: 'pay', amountSats: 1_000, isChange: false },
        { address: 'ch', amountSats: 8_500, isChange: true },
      ],
    }
    expect(netMovedSatsForLabTx(tx)).toBe(1_000)
  })

  it('counts outputs with undefined isChange as non-change', () => {
    const tx: LabTxDetails = {
      txid: 't2',
      blockHeight: 1,
      blockTime: 1,
      confirmations: 1,
      inputs: [{ address: 'a', amountSats: 100, prevTxid: 'p', prevVout: 0 }],
      outputs: [
        { address: 'o1', amountSats: 40 },
        { address: 'o2', amountSats: 50 },
      ],
    }
    expect(netMovedSatsForLabTx(tx)).toBe(90)
  })
})

describe('netMovedSatsForBlock', () => {
  it('sums non-coinbase per-tx net moved for the given height (excludes coinbase)', () => {
    const cb = coinbaseTx({ blockHeight: 2, txid: 'cb2' })
    const spend: LabTxDetails = {
      txid: 'sp',
      blockHeight: 2,
      blockTime: 1,
      confirmations: 1,
      inputs: [{ address: 'a', amountSats: 500, prevTxid: 'p', prevVout: 0 }],
      outputs: [
        { address: 'to', amountSats: 400, isChange: false },
        { address: 'ch', amountSats: 50, isChange: true },
      ],
    }
    const other: LabTxDetails = {
      txid: 'other',
      blockHeight: 99,
      blockTime: 1,
      confirmations: 1,
      inputs: [{ address: 'a', amountSats: 1, prevTxid: 'p', prevVout: 0 }],
      outputs: [{ address: 'o', amountSats: 1 }],
    }
    expect(netMovedSatsForBlock([cb, spend, other], 2)).toBe(400)
  })
})
