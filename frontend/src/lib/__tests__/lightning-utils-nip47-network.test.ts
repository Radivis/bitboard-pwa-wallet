import { describe, it, expect } from 'vitest'
import { lightningNetworkModeFromNip47Network } from '@/lib/lightning-utils'

describe('lightningNetworkModeFromNip47Network', () => {
  it('maps mainnet variants to mainnet', () => {
    expect(lightningNetworkModeFromNip47Network('mainnet')).toBe('mainnet')
    expect(lightningNetworkModeFromNip47Network('MAINNET')).toBe('mainnet')
    expect(lightningNetworkModeFromNip47Network('  mainnet  ')).toBe('mainnet')
    expect(lightningNetworkModeFromNip47Network('bitcoin')).toBe('mainnet')
  })

  it('maps testnet', () => {
    expect(lightningNetworkModeFromNip47Network('testnet')).toBe('testnet')
  })

  it('maps signet', () => {
    expect(lightningNetworkModeFromNip47Network('signet')).toBe('signet')
  })

  it('returns null for regtest', () => {
    expect(lightningNetworkModeFromNip47Network('regtest')).toBe(null)
  })

  it('returns null for empty or unknown', () => {
    expect(lightningNetworkModeFromNip47Network(undefined)).toBe(null)
    expect(lightningNetworkModeFromNip47Network('')).toBe(null)
    expect(lightningNetworkModeFromNip47Network('   ')).toBe(null)
    expect(lightningNetworkModeFromNip47Network('liquid')).toBe(null)
  })
})
