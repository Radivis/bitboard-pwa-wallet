import { describe, expect, it } from 'vitest'
import { networkModeToSdkNetworkName } from '@/lib/arkade/arkade-onchain-bumper'

describe('networkModeToSdkNetworkName', () => {
  it('maps signet to mutinynet for SDK OnchainWallet', () => {
    expect(networkModeToSdkNetworkName('signet')).toBe('mutinynet')
  })

  it('maps mainnet to bitcoin', () => {
    expect(networkModeToSdkNetworkName('mainnet')).toBe('bitcoin')
  })

  it('maps testnet to testnet', () => {
    expect(networkModeToSdkNetworkName('testnet')).toBe('testnet')
  })
})
