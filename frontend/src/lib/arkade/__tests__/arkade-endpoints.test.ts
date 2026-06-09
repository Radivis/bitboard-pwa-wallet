import { describe, expect, it } from 'vitest'
import {
  getArkadeEndpoints,
  isArkadeDelegatorConfigured,
  isArkadeSupportedNetworkMode,
  networkModeToArkadeIsMainnet,
} from '@/lib/arkade/arkade-endpoints'

describe('arkade-endpoints', () => {
  it('identifies supported network modes', () => {
    expect(isArkadeSupportedNetworkMode('mainnet')).toBe(true)
    expect(isArkadeSupportedNetworkMode('signet')).toBe(true)
    expect(isArkadeSupportedNetworkMode('testnet')).toBe(false)
    expect(isArkadeSupportedNetworkMode('lab')).toBe(false)
    expect(isArkadeSupportedNetworkMode('regtest')).toBe(false)
  })

  it('maps mainnet flag for identity', () => {
    expect(networkModeToArkadeIsMainnet('mainnet')).toBe(true)
    expect(networkModeToArkadeIsMainnet('signet')).toBe(false)
  })

  it('returns proxied operator, empty delegator, and proxied esplora URLs', () => {
    const mainnet = getArkadeEndpoints('mainnet')
    const signet = getArkadeEndpoints('signet')

    expect(mainnet.arkServerUrl).toBe(
      `${window.location.origin}/api/arkade/operator/mainnet`,
    )
    expect(signet.arkServerUrl).toBe(
      `${window.location.origin}/api/arkade/operator/signet`,
    )
    expect(mainnet.delegatorUrl).toBe('')
    expect(signet.delegatorUrl).toBe('')
    expect(mainnet.esploraUrl).toBe(
      `${window.location.origin}/api/esplora/default/mainnet`,
    )
    expect(signet.esploraUrl).toBe(
      `${window.location.origin}/api/esplora/default/signet`,
    )
  })

  it('reports delegator as disabled when URL is empty', () => {
    expect(isArkadeDelegatorConfigured('mainnet')).toBe(false)
    expect(isArkadeDelegatorConfigured('signet')).toBe(false)
  })
})
