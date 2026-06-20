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

const unlockHoisted = vi.hoisted(() => ({
  loadWalletMock: vi.fn().mockResolvedValue(false),
  getCurrentAddressMock: vi.fn().mockResolvedValue('tb1qunlock'),
}))

const walletStoreState = vi.hoisted(() => ({
  walletStatus: 'none' as 'none' | 'locked' | 'unlocked' | 'syncing',
  setWalletStatus: vi.fn((status: 'none' | 'locked' | 'unlocked' | 'syncing') => {
    walletStoreState.walletStatus = status
    unlockCallOrder.push(`setWalletStatus:${status}`)
  }),
  setBalance: vi.fn(),
  setTransactions: vi.fn(),
  setCurrentAddress: vi.fn(),
  setLastSyncTime: vi.fn(),
  commitLoadedDescriptorWallet: vi.fn(),
  networkMode: 'signet' as const,
  addressType: 2,
  accountId: 0,
  activeWalletId: 3,
  loadedDescriptorWallet: null as {
    networkMode: 'signet'
    addressType: number
    accountId: number
  } | null,
}))

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

const waitForCryptoWorkerHealthyMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

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

vi.mock('@/workers/crypto-factory', () => ({
  waitForCryptoWorkerHealthy: (...args: unknown[]) =>
    waitForCryptoWorkerHealthyMock(...args),
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => walletStoreState,
  },
}))

vi.mock('@/stores/sessionStore', () => ({
  startAutoLockTimer: vi.fn(),
}))

vi.mock('@/lib/wallet/descriptor-wallet-manager', () => ({
  resolveDescriptorWallet: vi.fn().mockImplementation(async () => {
    unlockCallOrder.push('resolveDescriptorWallet')
    return {
      network: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      externalDescriptor: 'tr(xpub.../0/*)',
      internalDescriptor: 'tr(xpub.../1/*)',
      changeSet: '{}',
      fullScanDone: false,
    }
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

vi.mock('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator')
  >()
  return {
    ...actual,
    orchestrateOnchainSyncThenSave: vi.fn().mockResolvedValue(undefined),
  }
})

import {
  loadDescriptorWalletAndSync,
  loadDescriptorWalletWithoutSync,
} from '@/lib/wallet/wallet-utils'

describe('openArkadeSession after unlock (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    unlockCallOrder.length = 0
    walletStoreState.walletStatus = 'none'
    openArkadeSessionForWalletMock.mockResolvedValue(undefined)
  })

  it('UNLOCK-ARK-01 loadDescriptorWalletWithoutSync starts openArkadeSessionForWallet without blocking when Arkade is active', async () => {
    let resolveOpen: (() => void) | undefined
    openArkadeSessionForWalletMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveOpen = resolve
        }),
    )

    await loadDescriptorWalletWithoutSync({
      walletId: 3,
      networkMode: 'signet',
      addressType: AddressType.Taproot,
      accountId: 0,
    })

    expect(waitForCryptoWorkerHealthyMock).toHaveBeenCalled()
    expect(openArkadeSessionForWalletMock).toHaveBeenCalledWith({
      walletId: 3,
      networkMode: 'signet',
    })
    expect(resolveOpen).toBeDefined()
    resolveOpen!()
  })

  it('UNLOCK-ARK-01 loadDescriptorWalletAndSync starts openArkadeSessionForWallet without blocking when Arkade is active', async () => {
    let resolveOpen: (() => void) | undefined
    openArkadeSessionForWalletMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveOpen = resolve
        }),
    )

    await loadDescriptorWalletAndSync({
      walletId: 3,
      networkMode: 'signet',
      addressType: AddressType.Taproot,
      accountId: 0,
      awaitSync: false,
    })

    expect(waitForCryptoWorkerHealthyMock).toHaveBeenCalled()
    expect(openArkadeSessionForWalletMock).toHaveBeenCalledWith({
      walletId: 3,
      networkMode: 'signet',
    })
    expect(resolveOpen).toBeDefined()
    resolveOpen!()
  })

  it('UNLOCK-ARK-02 starts Arkade session open during unlock load and still marks wallet unlocked', async () => {
    await loadDescriptorWalletAndSync({
      walletId: 3,
      networkMode: 'signet',
      addressType: AddressType.Taproot,
      accountId: 0,
      awaitSync: false,
    })

    const unlockedIndex = unlockCallOrder.indexOf('setWalletStatus:unlocked')
    const sessionOpenIndex = unlockCallOrder.indexOf('openArkadeSessionForWallet')
    const resolveDescriptorIndex = unlockCallOrder.indexOf('resolveDescriptorWallet')
    expect(sessionOpenIndex).toBeGreaterThanOrEqual(0)
    expect(resolveDescriptorIndex).toBeGreaterThanOrEqual(0)
    expect(sessionOpenIndex).toBeGreaterThan(resolveDescriptorIndex)
    expect(unlockedIndex).toBeGreaterThan(sessionOpenIndex)
  })

  it('UNLOCK-ARK-04 Arkade session open failure must not reject unlock', async () => {
    const sessionOpenError = new Error('Mutinynet operator unreachable')
    openArkadeSessionForWalletMock.mockRejectedValueOnce(sessionOpenError)

    await expect(
      loadDescriptorWalletAndSync({
        walletId: 3,
        networkMode: 'signet',
        addressType: AddressType.Taproot,
        accountId: 0,
        awaitSync: true,
      }),
    ).resolves.toBeUndefined()

    expect(walletStoreState.setWalletStatus).toHaveBeenCalledWith('unlocked')
    await vi.waitFor(() =>
      expect(reportArkadeSessionOpenErrorMock).toHaveBeenCalledWith(sessionOpenError),
    )
  })
})
