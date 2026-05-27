import { describe, expect, it } from 'vitest'
import { computeSendPageBalances } from '../send-page-balances'

describe('computeSendPageBalances', () => {
  it('uses lab balance when network is lab and lab balance is known', () => {
    expect(
      computeSendPageBalances({
        networkMode: 'lab',
        labBalanceSats: 42_000,
        balance: {
          confirmed: 1,
          trusted_pending: 0,
          untrusted_pending: 0,
          immature: 0,
          total: 2,
        },
      }),
    ).toEqual({
      confirmedBalance: 42_000,
      totalBalanceSats: 42_000,
    })
  })

  it('uses wallet balance when not lab', () => {
    expect(
      computeSendPageBalances({
        networkMode: 'signet',
        labBalanceSats: null,
        balance: {
          confirmed: 500_000,
          trusted_pending: 0,
          untrusted_pending: 0,
          immature: 0,
          total: 600_000,
        },
      }),
    ).toEqual({
      confirmedBalance: 500_000,
      totalBalanceSats: 600_000,
    })
  })

  it('falls back to zero when wallet balance is null', () => {
    expect(
      computeSendPageBalances({
        networkMode: 'testnet',
        labBalanceSats: null,
        balance: null,
      }),
    ).toEqual({
      confirmedBalance: 0,
      totalBalanceSats: 0,
    })
  })
})
