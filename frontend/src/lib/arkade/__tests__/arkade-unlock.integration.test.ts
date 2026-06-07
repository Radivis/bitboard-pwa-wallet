import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/lib/wallet/wallet-domain-types'

const featureState = vi.hoisted(() => ({
  isArkadeEnabled: true,
  isMainnetAccessEnabled: false,
}))

const openArkadeSessionForWalletMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
)

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: {
    getState: () => featureState,
  },
}))

vi.mock('@/lib/arkade/arkade-session-service', () => ({
  openArkadeSessionForWallet: (...args: unknown[]) =>
    openArkadeSessionForWalletMock(...args),
  closeArkadeSession: vi.fn(),
  refreshArkadeSessionAfterNetworkSwitch: vi.fn(),
}))

const unlockHoisted = vi.hoisted(() => ({
  loadWalletMock: vi.fn().mockResolvedValue(false),
  getCurrentAddressMock: vi.fn().mockResolvedValue('tb1qunlock'),
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      loadWallet: unlockHoisted.loadWalletMock,
      getCurrentAddress: unlockHoisted.getCurrentAddressMock,
    }),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      setWalletStatus: vi.fn(),
      setBalance: vi.fn(),
      setTransactions: vi.fn(),
      setCurrentAddress: vi.fn(),
      commitLoadedDescriptorWallet: vi.fn(),
    }),
  },
}))

vi.mock('@/stores/sessionStore', () => ({
  startAutoLockTimer: vi.fn(),
}))

vi.mock('@/lib/wallet/descriptor-wallet-manager', () => ({
  resolveDescriptorWallet: vi.fn().mockResolvedValue({
    network: 'testnet',
    addressType: AddressType.Taproot,
    accountId: 0,
    externalDescriptor: 'tr(xpub.../0/*)',
    internalDescriptor: 'tr(xpub.../1/*)',
    changeSet: '{}',
    fullScanDone: false,
  }),
}))

import { loadDescriptorWalletWithoutSync } from '@/lib/wallet/wallet-utils'

describe('openArkadeSession after unlock (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    openArkadeSessionForWalletMock.mockResolvedValue(undefined)
  })

  it('loadDescriptorWalletWithoutSync awaits openArkadeSessionForWallet when Arkade is active', async () => {
    await loadDescriptorWalletWithoutSync({
      password: 'unlock-password',
      walletId: 3,
      networkMode: 'signet',
      addressType: AddressType.Taproot,
      accountId: 0,
    })

    expect(openArkadeSessionForWalletMock).toHaveBeenCalledWith({
      password: 'unlock-password',
      walletId: 3,
      networkMode: 'signet',
    })
  })
})
