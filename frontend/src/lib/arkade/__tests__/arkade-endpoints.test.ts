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
    expect(isArkadeSupportedNetworkMode('signet')).toBe(true)
    expect(isArkadeSupportedNetworkMode('regtest')).toBe(true)
    expect(isArkadeSupportedNetworkMode('testnet')).toBe(false)
    expect(isArkadeSupportedNetworkMode('lab')).toBe(false)
  })

  it('maps mainnet flag for identity', () => {
    expect(networkModeToArkadeIsMainnet('mainnet')).toBe(true)
    expect(networkModeToArkadeIsMainnet('signet')).toBe(false)
    expect(networkModeToArkadeIsMainnet('regtest')).toBe(false)
  })

  it('returns proxied operator, empty delegator, and proxied esplora URLs', () => {
    const mainnet = getArkadeEndpoints('mainnet')
    const signet = getArkadeEndpoints('signet')
    const regtest = getArkadeEndpoints('regtest')

    expect(mainnet.arkServerUrl).toBe(
      `${window.location.origin}/api/arkade/operator/mainnet`,
    )
    expect(signet.arkServerUrl).toBe(
      `${window.location.origin}/api/arkade/operator/signet`,
    )
    expect(regtest.arkServerUrl).toBe(
      `${window.location.origin}/api/arkade/operator/regtest`,
    )
    expect(mainnet.delegatorUrl).toBe('')
    expect(signet.delegatorUrl).toBe('')
    expect(regtest.delegatorUrl).toBe('')
    expect(mainnet.esploraUrl).toBe(
      `${window.location.origin}/api/esplora/default/mainnet`,
    )
    expect(signet.esploraUrl).toBe(
      `${window.location.origin}/api/esplora/default/signet`,
    )
    expect(regtest.esploraUrl).toBe('http://localhost:7030/api')
  })

  it('reports delegator as disabled when URL is empty', () => {
    expect(isArkadeDelegatorConfigured('mainnet')).toBe(false)
    expect(isArkadeDelegatorConfigured('signet')).toBe(false)
    expect(isArkadeDelegatorConfigured('regtest')).toBe(false)
  })

  it('returns a generic delegator label when URL is not configured', () => {
    expect(getArkadeDelegatorDisplayLabel('mainnet')).toBe('configured delegator')
    expect(getArkadeDelegatorDisplayLabel('signet')).toBe('configured delegator')
    expect(getArkadeDelegatorDisplayLabel('regtest')).toBe('configured delegator')
  })
})
