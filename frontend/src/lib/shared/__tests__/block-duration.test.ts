import { describe, expect, it } from 'vitest'
import {
  blockDurationParts,
  formatApproximateDurationPhrase,
} from '@/lib/shared/block-duration'

describe('blockDurationParts', () => {
  it('splits 144 mainnet blocks into one day', () => {
    expect(blockDurationParts(144, 'mainnet')).toEqual({
      blockCount: 144,
      days: 1,
      hours: 0,
      minutes: 0,
      seconds: 0,
    })
  })

  it('uses the same ten-minute interval on signet and testnet', () => {
    expect(blockDurationParts(3, 'signet')).toEqual({
      blockCount: 3,
      days: 0,
      hours: 0,
      minutes: 30,
      seconds: 0,
    })
    expect(blockDurationParts(20, 'testnet')).toEqual({
      blockCount: 20,
      days: 0,
      hours: 3,
      minutes: 20,
      seconds: 0,
    })
  })

  it('treats one mutinynet block as thirty seconds', () => {
    expect(blockDurationParts(1, 'mutinynet')).toEqual({
      blockCount: 1,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 30,
    })
  })

  it('leaves the time fields at zero when the network has no target interval', () => {
    expect(blockDurationParts(144, 'regtest')).toEqual({
      blockCount: 144,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    })
    expect(blockDurationParts(144, 'lab')).toEqual({
      blockCount: 144,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    })
  })
})

describe('formatApproximateDurationPhrase', () => {
  it('names a single unit, including the singular', () => {
    expect(formatApproximateDurationPhrase(blockDurationParts(144, 'mainnet'))).toBe('1 day')
    expect(formatApproximateDurationPhrase(blockDurationParts(6, 'signet'))).toBe('1 hour')
    expect(formatApproximateDurationPhrase(blockDurationParts(1, 'mainnet'))).toBe('10 minutes')
  })

  it('joins days, hours, and minutes and leaves seconds out', () => {
    expect(
      formatApproximateDurationPhrase({
        blockCount: 306,
        days: 2,
        hours: 3,
        minutes: 4,
        seconds: 5,
      }),
    ).toBe('2 days, 3 hours, and 4 minutes')
  })

  it('says less than a minute when only seconds remain', () => {
    expect(formatApproximateDurationPhrase(blockDurationParts(1, 'mutinynet'))).toBe(
      'less than a minute',
    )
  })

  it('returns null when there is no approximation', () => {
    expect(formatApproximateDurationPhrase(blockDurationParts(144, 'regtest'))).toBeNull()
  })
})
