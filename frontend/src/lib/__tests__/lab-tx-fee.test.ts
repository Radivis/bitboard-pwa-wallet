import { describe, expect, it } from 'vitest'
import { LAB_COINBASE_PREV_TXID_HEX, LAB_COINBASE_PREV_VOUT } from '@/lib/lab-operations'
import { feeSatsFromTxDetails } from '@/lib/lab-tx-fee'
import type { LabTxDetails } from '@/workers/lab-api'

describe('feeSatsFromTxDetails', () => {
  it('returns zero for coinbase', () => {
    const tx: LabTxDetails = {
      txid: 'a',
      blockHeight: 1,
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
      outputs: [{ address: 'bcrt1qtest', amountSats: 5000 }],
    }
    expect(feeSatsFromTxDetails(tx)).toBe(0)
  })

  it('returns input minus outputs for non-coinbase', () => {
    const tx: LabTxDetails = {
      txid: 'b',
      blockHeight: 1,
      blockTime: 1,
      confirmations: 1,
      inputs: [{ address: 'bcrt1qfrom', amountSats: 10_000 }],
      outputs: [
        { address: 'bcrt1qto', amountSats: 7000 },
        { address: 'bcrt1qch', amountSats: 2000, isChange: true },
      ],
    }
    expect(feeSatsFromTxDetails(tx)).toBe(1000)
  })
})
