import { describe, expect, it } from 'vitest'
import { mergeMempoolInputsDetailWithOutpoints } from '@/workers/lab-api'

describe('mergeMempoolInputsDetailWithOutpoints', () => {
  it('fills missing prevout from parallel inputs array', () => {
    const merged = mergeMempoolInputsDetailWithOutpoints(
      [{ txid: 'aa', vout: 1 }],
      [{ address: 'bcrt1a', amountSats: 1000, owner: null }],
    )
    expect(merged).toEqual([
      {
        address: 'bcrt1a',
        amountSats: 1000,
        owner: null,
        prevTxid: 'aa',
        prevVout: 1,
      },
    ])
  })

  it('does not overwrite when prevout already present', () => {
    const merged = mergeMempoolInputsDetailWithOutpoints(
      [{ txid: 'bb', vout: 0 }],
      [
        {
          address: 'bcrt1a',
          amountSats: 1000,
          owner: null,
          prevTxid: 'cc',
          prevVout: 2,
        },
      ],
    )
    expect(merged[0]?.prevTxid).toBe('cc')
    expect(merged[0]?.prevVout).toBe(2)
  })

  it('preserves vout 0 when detail omits prevVout', () => {
    const merged = mergeMempoolInputsDetailWithOutpoints(
      [{ txid: 'dd', vout: 0 }],
      [{ address: 'bcrt1a', amountSats: 1000, owner: null }],
    )
    expect(merged[0]?.prevVout).toBe(0)
  })
})
