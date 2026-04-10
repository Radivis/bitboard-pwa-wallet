import { describe, expect, it } from 'vitest'
import { feeSatsFromTxDetails } from '@/lib/lab-tx-fee'
import type { LabTxDetails } from '@/workers/lab-api'

describe('feeSatsFromTxDetails', () => {
  it('returns zero for coinbase flag', () => {
    const tx: LabTxDetails = {
      txid: 'a',
      blockHeight: 1,
      blockTime: 1,
      confirmations: 1,
      isCoinbase: true,
      inputs: [],
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
