import { describe, expect, it } from 'vitest'
import { UX_DUST_FLOOR_SATS } from '@/lib/wallet/bitcoin-dust'
import {
  minOutputSizeRaisedToastMessage,
  onchainDustPrepareWarningLines,
} from '../onchain-dust-prepare-messages'

describe('minOutputSizeRaisedToastMessage', () => {
  it('matches the isRaisedToMinDust warning line', () => {
    expect(minOutputSizeRaisedToastMessage()).toBe(
      onchainDustPrepareWarningLines({
        isRaisedToMinDust: true,
        bumpedChangeFree: false,
      })[0],
    )
  })
})

describe('onchainDustPrepareWarningLines', () => {
  it('returns empty array when no adjustments', () => {
    expect(
      onchainDustPrepareWarningLines({
        isRaisedToMinDust: false,
        bumpedChangeFree: false,
      }),
    ).toEqual([])
  })

  it('returns min-dust line only', () => {
    expect(
      onchainDustPrepareWarningLines({
        isRaisedToMinDust: true,
        bumpedChangeFree: false,
      }),
    ).toEqual([
      `Amount was below the minimum output size (${UX_DUST_FLOOR_SATS} sats). It was increased automatically.`,
    ])
  })

  it('returns change-free line only', () => {
    expect(
      onchainDustPrepareWarningLines({
        isRaisedToMinDust: false,
        bumpedChangeFree: true,
      }),
    ).toEqual([
      'Change for this transaction would have been below the dust limit; the amount was increased to make the transfer change-free.',
    ])
  })

  it('returns both lines when both adjustments apply', () => {
    const lines = onchainDustPrepareWarningLines({
      isRaisedToMinDust: true,
      bumpedChangeFree: true,
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain(String(UX_DUST_FLOOR_SATS))
    expect(lines[1]).toContain('change-free')
  })
})
