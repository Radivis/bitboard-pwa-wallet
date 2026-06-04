import { describe, expect, it, vi } from 'vitest'

vi.mock('@arkade-os/sdk', () => ({
  isValidArkAddress: (address: string) =>
    /^ark1[a-z0-9]+$/i.test(address) || /^tark1[a-z0-9]+$/i.test(address),
}))

import { isValidArkadeAddress } from '@/lib/arkade/arkade-address'

describe('isValidArkadeAddress', () => {
  it('accepts ark1 and tark1 prefixes', () => {
    expect(isValidArkadeAddress('tark1qvalidaddress')).toBe(true)
    expect(isValidArkadeAddress('ark1qvalidaddress')).toBe(true)
  })

  it('rejects empty and on-chain addresses', () => {
    expect(isValidArkadeAddress('')).toBe(false)
    expect(isValidArkadeAddress('   ')).toBe(false)
    expect(
      isValidArkadeAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'),
    ).toBe(false)
  })

  it('trims whitespace before validation', () => {
    expect(isValidArkadeAddress('  tark1qvalidaddress  ')).toBe(true)
  })
})
