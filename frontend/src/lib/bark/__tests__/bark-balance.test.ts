import { describe, expect, it } from 'vitest'
import { readBarkBalance, readBarkSpendableSats } from '@/lib/bark/bark-balance'

describe('readBarkBalance', () => {
  it('reads spendable, locked, and exiting sats from the balance JSON', () => {
    expect(
      readBarkBalance('{"spendableSats":1000,"lockedSats":450,"exitingSats":2500}'),
    ).toEqual({ spendableSats: 1_000, lockedSats: 450, exitingSats: 2_500 })
  })

  it('rejects a balance that is missing exiting sats, as a stale WASM build emits', () => {
    expect(() => readBarkBalance('{"spendableSats":1000,"lockedSats":450}')).toThrow(
      'Bark balance exiting sats are not a satoshi count',
    )
  })

  it('rejects negative or invalid exitingSats', () => {
    expect(() =>
      readBarkBalance('{"spendableSats":1000,"lockedSats":450,"exitingSats":-1}'),
    ).toThrow('Bark balance exiting sats are not a satoshi count')
    expect(() =>
      readBarkBalance('{"spendableSats":1000,"lockedSats":450,"exitingSats":"abc"}'),
    ).toThrow('Bark balance exiting sats are not a satoshi count')
  })

  it('rejects a balance that is missing locked sats', () => {
    expect(() => readBarkBalance('{"spendableSats":1000}')).toThrow(
      'Bark balance locked sats are not a satoshi count',
    )
  })
})

describe('readBarkSpendableSats', () => {
  it('reads a wasm bigint and a safe integer', () => {
    expect(readBarkSpendableSats(50_000n)).toBe(50_000)
    expect(readBarkSpendableSats(0)).toBe(0)
  })

  it('rejects values that are not a spendable satoshi count', () => {
    expect(() => readBarkSpendableSats(-1)).toThrow(
      'Bark balance is not a spendable satoshi count',
    )
    expect(() => readBarkSpendableSats(1.5)).toThrow(
      'Bark balance is not a spendable satoshi count',
    )
    expect(() => readBarkSpendableSats('50000')).toThrow(
      'Bark balance is not a spendable satoshi count',
    )
  })
})
