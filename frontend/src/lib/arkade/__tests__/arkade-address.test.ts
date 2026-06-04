import { describe, expect, it } from 'vitest'
import { isValidArkadeAddress } from '@/lib/arkade/arkade-address'

describe('isValidArkadeAddress', () => {
  it('accepts ark1 and tark1 prefixes', () => {
    expect(isValidArkadeAddress('ark1qqqqqqqqqqqqqq')).toBe(true)
    expect(isValidArkadeAddress('tark1qqqqqqqqqqqqqq')).toBe(true)
  })

  it('rejects empty and non-ark strings', () => {
    expect(isValidArkadeAddress('')).toBe(false)
    expect(isValidArkadeAddress('bc1qtest')).toBe(false)
  })
})
