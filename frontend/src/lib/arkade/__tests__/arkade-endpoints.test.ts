import { describe, expect, it } from 'vitest'
import {
  getArkadeEndpoints,
  isArkadeSupportedNetworkMode,
  networkModeToArkadeIsMainnet,
} from '@/lib/arkade/arkade-endpoints'

describe('arkade-endpoints', () => {
  it('identifies supported network modes', () => {
    expect(isArkadeSupportedNetworkMode('mainnet')).toBe(true)
    expect(isArkadeSupportedNetworkMode('testnet')).toBe(true)
    expect(isArkadeSupportedNetworkMode('signet')).toBe(true)
    expect(isArkadeSupportedNetworkMode('lab')).toBe(false)
    expect(isArkadeSupportedNetworkMode('regtest')).toBe(false)
  })

  it('maps mainnet flag for identity', () => {
    expect(networkModeToArkadeIsMainnet('mainnet')).toBe(true)
    expect(networkModeToArkadeIsMainnet('testnet')).toBe(false)
    expect(networkModeToArkadeIsMainnet('signet')).toBe(false)
  })

  it('returns operator, delegator, and esplora URLs per network', () => {
    const mainnet = getArkadeEndpoints('mainnet')
    const testnet = getArkadeEndpoints('testnet')
    const signet = getArkadeEndpoints('signet')

    expect(mainnet.arkServerUrl).toMatch(/^https:\/\//)
    expect(mainnet.delegatorUrl).toContain('delegator-mainnet')
    expect(testnet.delegatorUrl).toContain('delegator-testnet4')
    expect(signet.delegatorUrl).toContain('delegator-mutinynet')
    expect(signet.esploraUrl).toContain('mutinynet')
  })
})
