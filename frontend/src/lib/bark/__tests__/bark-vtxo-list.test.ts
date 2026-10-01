import { describe, expect, it } from 'vitest'
import { readBarkVtxoListJson } from '@/lib/bark/bark-vtxo-list'
import { barkVtxoListQueryKey } from '@/hooks/useBarkVtxoListQuery'

describe('readBarkVtxoListJson', () => {
  it('maps a list payload to Bark states and lock holders', () => {
    const rows = readBarkVtxoListJson(
      JSON.stringify([
        {
          id: 'abc:0',
          amountSats: 1500,
          expiryHeight: 200,
          state: 'locked',
          lockHolder: { kind: 'movement', id: '9' },
          registered: true,
        },
      ]),
    )

    expect(rows).toEqual([
      {
        id: 'abc:0',
        amountSats: 1500,
        expiryHeight: 200,
        state: 'locked',
        lockHolder: { kind: 'movement', id: '9' },
        registered: true,
      },
    ])
  })

  it('rejects an unknown state', () => {
    expect(() =>
      readBarkVtxoListJson(
        JSON.stringify([
          {
            id: 'abc:0',
            amountSats: 1,
            expiryHeight: 1,
            state: 'finalized',
            lockHolder: null,
            registered: false,
          },
        ]),
      ),
    ).toThrow(/unknown state/)
  })
})

describe('barkVtxoListQueryKey', () => {
  it('changes when the last successful sync time changes', () => {
    expect(barkVtxoListQueryKey(1, 'signet', null)).not.toEqual(
      barkVtxoListQueryKey(1, 'signet', '2024-03-01T12:00:00.000Z'),
    )
  })
})
