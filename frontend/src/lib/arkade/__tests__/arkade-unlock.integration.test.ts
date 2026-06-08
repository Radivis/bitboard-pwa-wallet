import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/lib/wallet/wallet-domain-types'

const featureState = vi.hoisted(() => ({
  isArkadeEnabled: true,
  isMainnetAccessEnabled: false,
}))

const openArkadeSessionForWalletMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
)

const reportArkadeSessionOpenErrorMock = vi.hoisted(() => vi.fn())

const unlockCallOrder = vi.hoisted(() => [] as string[])

const setWalletStatusMock = vi.hoisted(() =>
  vi.fn((status: string) => {
    unlockCallOrder.push(`setWalletStatus:${status}`)
  }),
)

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: {
    getState: () => featureState,
  },
}))

vi.mock('@/lib/arkade/arkade-session-open-error-toast', () => ({
  reportArkadeSessionOpenError: (...args: unknown[]) =>
    reportArkadeSessionOpenErrorMock(...args),
}))

vi.mock('@/lib/arkade/arkade-session-service', () => ({
  openArkadeSessionForWallet: (...args: unknown[]) => {
    unlockCallOrder.push('openArkadeSessionForWallet')
    return openArkadeSessionForWalletMock(...args)
  },
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
      syncWallet: vi.fn().mockResolvedValue(undefined),
      getBalance: vi.fn().mockResolvedValue({
        confirmedSats: 0,
        trustedPendingSats: 0,
        untrustedPendingSats: 0,
        immatureSats: 0,
        totalSats: 0,
      }),
      getTransactionList: vi.fn().mockResolvedValue([]),
      exportChangeset: vi.fn().mockResolvedValue('{}'),
    }),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      setWalletStatus: setWalletStatusMock,
      setBalance: vi.fn(),
      setTransactions: vi.fn(),
      setCurrentAddress: vi.fn(),
      setLastSyncTime: vi.fn(),
      commitLoadedDescriptorWallet: vi.fn(),
      networkMode: 'signet',
      addressType: AddressType.Taproot,
      accountId: 0,
      activeWalletId: 3,
      loadedDescriptorWallet: null,
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
  updateDescriptorWalletChangeset: vi.fn(),
}))

vi.mock('@/lib/wallet/onchain-bdk-store-sync', () => ({
  refreshWalletStoreFromLoadedBdk: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/wallet/onchain-dashboard-sync', () => ({
  invalidateOnchainDashboardQueries: vi.fn(),
}))

vi.mock('@/lib/wallet/persisted-chain-mismatch', () => ({
  withPersistedChainMismatchRetry: vi.fn((loadWallet, params) => loadWallet(params)),
}))

import {
  loadDescriptorWalletAndSync,
  loadDescriptorWalletWithoutSync,
} from '@/lib/wallet/wallet-utils'

describe('openArkadeSession after unlock (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    unlockCallOrder.length = 0
    openArkadeSessionForWalletMock.mockResolvedValue(undefined)
  })

  it('UNLOCK-ARK-01 loadDescriptorWalletWithoutSync awaits openArkadeSessionForWallet when Arkade is active', async () => {
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

  it('UNLOCK-ARK-01 loadDescriptorWalletAndSync calls openArkadeSessionForWallet when Arkade is active', async () => {
    await loadDescriptorWalletAndSync({
      password: 'unlock-password',
      walletId: 3,
      networkMode: 'signet',
      addressType: AddressType.Taproot,
      accountId: 0,
      awaitSync: true,
    })

    expect(openArkadeSessionForWalletMock).toHaveBeenCalledWith({
      password: 'unlock-password',
      walletId: 3,
      networkMode: 'signet',
    })
  })

  it('UNLOCK-ARK-02 sets wallet unlocked before opening Arkade session', async () => {
    await loadDescriptorWalletAndSync({
      password: 'unlock-password',
      walletId: 3,
      networkMode: 'signet',
      addressType: AddressType.Taproot,
      accountId: 0,
      awaitSync: true,
    })

    const unlockedIndex = unlockCallOrder.indexOf('setWalletStatus:unlocked')
    const sessionOpenIndex = unlockCallOrder.indexOf('openArkadeSessionForWallet')
    expect(unlockedIndex).toBeGreaterThanOrEqual(0)
    expect(sessionOpenIndex).toBeGreaterThan(unlockedIndex)
  })

  it('UNLOCK-ARK-04 Arkade session open failure must not reject unlock', async () => {
    const sessionOpenError = new Error('Mutinynet operator unreachable')
    openArkadeSessionForWalletMock.mockRejectedValueOnce(sessionOpenError)

    await expect(
      loadDescriptorWalletAndSync({
        password: 'unlock-password',
        walletId: 3,
        networkMode: 'signet',
        addressType: AddressType.Taproot,
        accountId: 0,
        awaitSync: true,
      }),
    ).resolves.toBeUndefined()

    expect(setWalletStatusMock).toHaveBeenCalledWith('unlocked')
    expect(reportArkadeSessionOpenErrorMock).toHaveBeenCalledWith(sessionOpenError)
  })
})
