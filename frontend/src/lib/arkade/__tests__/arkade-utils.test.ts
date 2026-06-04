import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'

const featureState = vi.hoisted(() => ({
  isArkadeEnabled: false,
  isMainnetAccessEnabled: false,
}))

const walletState = vi.hoisted(() => ({
  networkMode: 'testnet' as const,
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: {
    getState: () => featureState,
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => walletState,
  },
}))

describe('isArkadeActiveForNetworkMode', () => {
  beforeEach(() => {
    featureState.isArkadeEnabled = false
    featureState.isMainnetAccessEnabled = false
    walletState.networkMode = 'testnet'
  })

  it('returns false when feature flag is off', () => {
    expect(isArkadeActiveForNetworkMode('testnet')).toBe(false)
  })

  it('returns true on testnet when feature is on', () => {
    featureState.isArkadeEnabled = true
    expect(isArkadeActiveForNetworkMode('testnet')).toBe(true)
  })

  it('requires mainnet access on mainnet', () => {
    featureState.isArkadeEnabled = true
    walletState.networkMode = 'mainnet'
    expect(isArkadeActiveForNetworkMode('mainnet')).toBe(false)
    featureState.isMainnetAccessEnabled = true
    expect(isArkadeActiveForNetworkMode('mainnet')).toBe(true)
  })

  it('returns false on lab', () => {
    featureState.isArkadeEnabled = true
    expect(isArkadeActiveForNetworkMode('lab')).toBe(false)
  })
})
