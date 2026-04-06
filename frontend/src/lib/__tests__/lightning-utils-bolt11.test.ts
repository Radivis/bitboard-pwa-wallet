import { describe, it, expect } from 'vitest'
import { bolt11NetworkModeFromPrefix } from '@/lib/lightning-utils'

describe('bolt11NetworkModeFromPrefix', () => {
  it('maps lnbc to mainnet', () => {
    expect(bolt11NetworkModeFromPrefix('LNBC1')).toBe('mainnet')
  })

  it('maps lntb to testnet', () => {
    expect(bolt11NetworkModeFromPrefix('lntb1')).toBe('testnet')
  })

  it('maps lntbs to signet', () => {
    expect(bolt11NetworkModeFromPrefix('lntbs1')).toBe('signet')
  })

  it('returns null for unknown prefix', () => {
    expect(bolt11NetworkModeFromPrefix('lnxyz')).toBeNull()
  })
})
