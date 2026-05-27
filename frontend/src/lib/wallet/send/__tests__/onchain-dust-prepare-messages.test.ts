import { describe, expect, it } from 'vitest'
import { UX_DUST_FLOOR_SATS } from '@/lib/wallet/bitcoin-dust'
import { onchainDustPrepareWarningLines } from '../onchain-dust-prepare-messages'

describe('onchainDustPrepareWarningLines', () => {
  it('returns empty array when no adjustments', () => {
    expect(
      onchainDustPrepareWarningLines({
        raisedToMinDust: false,
        bumpedChangeFree: false,
      }),
    ).toEqual([])
  })

  it('returns min-dust line only', () => {
    expect(
      onchainDustPrepareWarningLines({
        raisedToMinDust: true,
        bumpedChangeFree: false,
      }),
    ).toEqual([
      `Amount was below the minimum output size (${UX_DUST_FLOOR_SATS} sats). It was increased automatically.`,
    ])
  })

  it('returns change-free line only', () => {
    expect(
      onchainDustPrepareWarningLines({
        raisedToMinDust: false,
        bumpedChangeFree: true,
      }),
    ).toEqual([
      'Change for this transaction would have been below the dust limit; the amount was increased to make the transfer change-free.',
    ])
  })

  it('returns both lines when both adjustments apply', () => {
    const lines = onchainDustPrepareWarningLines({
      raisedToMinDust: true,
      bumpedChangeFree: true,
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain(String(UX_DUST_FLOOR_SATS))
    expect(lines[1]).toContain('change-free')
  })
})
