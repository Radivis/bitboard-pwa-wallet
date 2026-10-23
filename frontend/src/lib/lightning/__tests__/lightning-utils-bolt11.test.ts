import { describe, it, expect } from 'vitest'
import {
  bolt11InvoiceMatchesAppNetwork,
  bolt11NetworkModeFromPrefix,
  bolt11SignetFamilyNeedsConfirmation,
} from '@/lib/lightning/lightning-utils'

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

describe('bolt11 signet family confirmation', () => {
  it('does not treat Mutinynet as a match for a signet-prefix invoice', () => {
    expect(bolt11InvoiceMatchesAppNetwork('signet', 'mutinynet')).toBe(false)
    expect(bolt11InvoiceMatchesAppNetwork('signet', 'signet')).toBe(true)
  })

  it('asks for confirmation on both Signet and Mutinynet', () => {
    expect(bolt11SignetFamilyNeedsConfirmation('signet', 'signet')).toBe(true)
    expect(bolt11SignetFamilyNeedsConfirmation('signet', 'mutinynet')).toBe(true)
    expect(bolt11SignetFamilyNeedsConfirmation('signet', 'testnet')).toBe(false)
    expect(bolt11SignetFamilyNeedsConfirmation('mainnet', 'mainnet')).toBe(false)
  })
})
