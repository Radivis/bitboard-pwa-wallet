import { beforeEach, describe, expect, it, vi } from 'vitest'

const featureState = vi.hoisted(() => ({
  isBarkEnabled: false,
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: {
    getState: () => featureState,
  },
}))

import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'

describe('isBarkActiveForNetworkMode', () => {
  beforeEach(() => {
    featureState.isBarkEnabled = false
  })

  it('is true for signet and mainnet when the flag is on', () => {
    expect(isBarkActiveForNetworkMode('signet')).toBe(false)
    expect(isBarkActiveForNetworkMode('mainnet')).toBe(false)

    featureState.isBarkEnabled = true
    expect(isBarkActiveForNetworkMode('signet')).toBe(true)
    expect(isBarkActiveForNetworkMode('mainnet')).toBe(true)
    expect(isBarkActiveForNetworkMode('mutinynet')).toBe(false)
    expect(isBarkActiveForNetworkMode('testnet')).toBe(false)
    expect(isBarkActiveForNetworkMode('regtest')).toBe(false)
    expect(isBarkActiveForNetworkMode('lab')).toBe(false)
  })
})
