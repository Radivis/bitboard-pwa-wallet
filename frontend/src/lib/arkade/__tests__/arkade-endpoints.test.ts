import { describe, expect, it } from 'vitest'
import {
  getArkadeDelegatorDisplayLabel,
  getArkadeEndpoints,
  isArkadeDelegatorConfigured,
  isArkadeSupportedNetworkMode,
  networkModeToArkadeIsMainnet,
} from '@/lib/arkade/arkade-endpoints'

describe('arkade-endpoints', () => {
  it('identifies supported network modes', () => {
    expect(isArkadeSupportedNetworkMode('mainnet')).toBe(true)
    expect(isArkadeSupportedNetworkMode('mutinynet')).toBe(true)
    expect(isArkadeSupportedNetworkMode('signet')).toBe(false)
    expect(isArkadeSupportedNetworkMode('regtest')).toBe(true)
    expect(isArkadeSupportedNetworkMode('testnet')).toBe(false)
    expect(isArkadeSupportedNetworkMode('lab')).toBe(false)
  })

  it('maps mainnet flag for identity', () => {
    expect(networkModeToArkadeIsMainnet('mainnet')).toBe(true)
    expect(networkModeToArkadeIsMainnet('mutinynet')).toBe(false)
    expect(networkModeToArkadeIsMainnet('regtest')).toBe(false)
  })

  it('returns proxied operator, empty delegator, and proxied esplora URLs', () => {
    const mainnet = getArkadeEndpoints('mainnet')
    const mutinynet = getArkadeEndpoints('mutinynet')
    const regtest = getArkadeEndpoints('regtest')

    expect(mainnet.arkadeServerUrl).toBe(
      `${window.location.origin}/api/arkade/operator/mainnet`,
    )
    expect(mutinynet.arkadeServerUrl).toBe(
      `${window.location.origin}/api/arkade/operator/mutinynet`,
    )
    expect(regtest.arkadeServerUrl).toBe(
      `${window.location.origin}/api/arkade/operator/regtest`,
    )
    expect(mainnet.delegatorUrl).toBe('')
    expect(mutinynet.delegatorUrl).toBe('')
    expect(regtest.delegatorUrl).toBe('')
    expect(mainnet.esploraUrl).toBe(
      `${window.location.origin}/api/esplora/default/mainnet`,
    )
    expect(mutinynet.esploraUrl).toBe(
      `${window.location.origin}/api/esplora/default/mutinynet`,
    )
    expect(regtest.esploraUrl).toBe(
      `${window.location.origin}/api/esplora/default/regtest`,
    )
  })

  it('reports delegator as disabled when URL is empty', () => {
    expect(isArkadeDelegatorConfigured('mainnet')).toBe(false)
    expect(isArkadeDelegatorConfigured('mutinynet')).toBe(false)
    expect(isArkadeDelegatorConfigured('regtest')).toBe(false)
  })

  it('returns a generic delegator label when URL is not configured', () => {
    expect(getArkadeDelegatorDisplayLabel('mainnet')).toBe('configured delegator')
    expect(getArkadeDelegatorDisplayLabel('mutinynet')).toBe('configured delegator')
    expect(getArkadeDelegatorDisplayLabel('regtest')).toBe('configured delegator')
  })
})
