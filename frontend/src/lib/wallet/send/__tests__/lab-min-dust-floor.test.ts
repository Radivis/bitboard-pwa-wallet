import { describe, expect, it } from 'vitest'
import { UX_DUST_FLOOR_SATS } from '@/lib/wallet/bitcoin-dust'
import { resolveLabDraftAmountWithMinDustFloor } from '../lab-min-dust-floor'

describe('resolveLabDraftAmountWithMinDustFloor', () => {
  it('bumps amount below dust floor when balance allows', () => {
    expect(
      resolveLabDraftAmountWithMinDustFloor({
        amountSats: 100,
        confirmedBalance: 10_000,
      }),
    ).toEqual({
      draftAmountSats: UX_DUST_FLOOR_SATS,
      dustAdjustment: {
        previousSats: 100,
        isRaisedToMinDust: true,
        isBumpedChangeFree: false,
      },
    })
  })

  it('leaves amount unchanged when already at or above dust floor', () => {
    expect(
      resolveLabDraftAmountWithMinDustFloor({
        amountSats: UX_DUST_FLOOR_SATS,
        confirmedBalance: 10_000,
      }),
    ).toEqual({
      draftAmountSats: UX_DUST_FLOOR_SATS,
      dustAdjustment: null,
    })
  })

  it('does not bump when confirmed balance is below dust floor', () => {
    expect(
      resolveLabDraftAmountWithMinDustFloor({
        amountSats: 100,
        confirmedBalance: UX_DUST_FLOOR_SATS - 1,
      }),
    ).toEqual({
      draftAmountSats: 100,
      dustAdjustment: null,
    })
  })

  it('does not bump invalid zero amount', () => {
    expect(
      resolveLabDraftAmountWithMinDustFloor({
        amountSats: 0,
        confirmedBalance: 10_000,
      }),
    ).toEqual({
      draftAmountSats: 0,
      dustAdjustment: null,
    })
  })
})
