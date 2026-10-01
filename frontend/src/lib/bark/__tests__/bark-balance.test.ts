import { describe, expect, it } from 'vitest'
import { readBarkSpendableSats } from '@/lib/bark/bark-balance'

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
