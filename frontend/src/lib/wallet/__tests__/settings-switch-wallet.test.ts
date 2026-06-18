import { describe, it, expect, beforeEach, vi } from 'vitest'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import {
  resolveDescriptorWallet,
  updateDescriptorWalletChangeset,
} from '@/lib/wallet/descriptor-wallet-manager'
import { switchDescriptorWallet } from '@/lib/wallet/settings-switch-wallet'

const mockSyncLoadedDescriptorWalletWithEsplora = vi.hoisted(() =>
  vi.fn().mockResolvedValue('completed' as const),
)

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: vi.fn(),
  },
  NETWORK_LABELS: {
    lab: 'Lab',
    regtest: 'Regtest',
    signet: 'Signet',
    testnet: 'Testnet',
    mainnet: 'Mainnet',
  },
  ADDRESS_TYPE_LABELS: {
    taproot: 'Taproot',
    segwit: 'SegWit',
  },
  getDescriptorWalletLabel: () => 'Label',
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: vi.fn(),
  },
}))

vi.mock('@/lib/wallet/descriptor-wallet-manager', () => ({
  resolveDescriptorWallet: vi.fn(),
  updateDescriptorWalletChangeset: vi.fn(),
}))

vi.mock('@/lib/wallet/wallet-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wallet/wallet-utils')>()
  return {
    ...actual,
    syncLoadedDescriptorWalletWithEsplora: mockSyncLoadedDescriptorWalletWithEsplora,
  }
})

const mockRefreshWalletStoreFromLoadedBdk = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
)

vi.mock('@/lib/wallet/onchain-bdk-store-sync', () => ({
  refreshWalletStoreFromLoadedBdk: mockRefreshWalletStoreFromLoadedBdk,
}))

vi.mock('@/lib/wallet/onchain-dashboard-sync', () => ({
  invalidateOnchainDashboardQueries: vi.fn(),
}))

const mockSetWalletStatus = vi.fn()
const mockSetCurrentAddress = vi.fn()
const mockCommitLoadedDescriptorWallet = vi.fn()
const mockSetBalance = vi.fn()
const mockSetTransactions = vi.fn()
const mockSetLastSyncTime = vi.fn()
const mockExportChangeset = vi.fn()
const mockLoadWallet = vi.fn()
const mockGetCurrentAddress = vi.fn()

const descriptorWallet = {
  network: 'testnet' as const,
  addressType: 'taproot' as const,
  accountId: 0,
  externalDescriptor: 'ext',
  internalDescriptor: 'int',
  changeSet: '{}',
  fullScanDone: true,
}

describe('switchDescriptorWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExportChangeset.mockResolvedValue('{}')
    mockLoadWallet.mockResolvedValue(undefined)
    mockGetCurrentAddress.mockResolvedValue('bc1qtest')

    vi.mocked(useWalletStore.getState).mockReturnValue({
      activeWalletId: 1,
      setWalletStatus: mockSetWalletStatus,
      setCurrentAddress: mockSetCurrentAddress,
      commitLoadedDescriptorWallet: mockCommitLoadedDescriptorWallet,
      setBalance: mockSetBalance,
      setTransactions: mockSetTransactions,
      setLastSyncTime: mockSetLastSyncTime,
    } as ReturnType<typeof useWalletStore.getState>)

    vi.mocked(useCryptoStore.getState).mockReturnValue({
      exportChangeset: mockExportChangeset,
      loadWallet: mockLoadWallet,
      getCurrentAddress: mockGetCurrentAddress,
    } as unknown as ReturnType<typeof useCryptoStore.getState>)

    vi.mocked(resolveDescriptorWallet).mockResolvedValue(descriptorWallet)
    mockSyncLoadedDescriptorWalletWithEsplora.mockResolvedValue('completed')
    vi.mocked(updateDescriptorWalletChangeset).mockResolvedValue(undefined)
  })

  it('throws when there is no active wallet or session', async () => {
    vi.mocked(useWalletStore.getState).mockReturnValue({
      activeWalletId: null,
      setWalletStatus: mockSetWalletStatus,
      setCurrentAddress: mockSetCurrentAddress,
      commitLoadedDescriptorWallet: mockCommitLoadedDescriptorWallet,
      setBalance: mockSetBalance,
      setTransactions: mockSetTransactions,
      setLastSyncTime: mockSetLastSyncTime,
    } as ReturnType<typeof useWalletStore.getState>)

    await expect(
      switchDescriptorWallet({
        targetNetworkMode: 'testnet',
        targetAddressType: 'taproot',
        targetAccountId: 0,
        currentNetworkMode: 'signet',
        currentAddressType: 'taproot',
        currentAccountId: 0,
      }),
    ).rejects.toThrow('Cannot switch descriptor wallet: no active wallet or session')
  })

  it('rejects after toast when resolveDescriptorWallet fails', async () => {
    vi.mocked(resolveDescriptorWallet).mockRejectedValue(
      new Error('resolve failed'),
    )

    await expect(
      switchDescriptorWallet({
        targetNetworkMode: 'testnet',
        targetAddressType: 'taproot',
        targetAccountId: 0,
        currentNetworkMode: 'signet',
        currentAddressType: 'taproot',
        currentAccountId: 0,
      }),
    ).rejects.toThrow('resolve failed')

    expect(toast.error).toHaveBeenCalled()
  })

  it('resolves when load and sync succeed (non-lab)', async () => {
    await switchDescriptorWallet({
      targetNetworkMode: 'testnet',
      targetAddressType: 'taproot',
      targetAccountId: 0,
      currentNetworkMode: 'signet',
      currentAddressType: 'taproot',
      currentAccountId: 0,
    })

    expect(mockSetBalance).toHaveBeenCalledWith(null)
    expect(mockSetTransactions).toHaveBeenCalledWith([])
    expect(mockSetLastSyncTime).toHaveBeenCalledWith(null)
    expect(mockRefreshWalletStoreFromLoadedBdk).toHaveBeenCalledTimes(1)
    expect(mockSyncLoadedDescriptorWalletWithEsplora).toHaveBeenCalledWith({
      networkMode: 'testnet',
      activeWalletId: 1,
      targetNetwork: 'testnet',
      targetAddressType: 'taproot',
      targetAccountId: 0,
      fullScanNeeded: true,
    })
    expect(mockCommitLoadedDescriptorWallet).toHaveBeenCalledWith({
      networkMode: 'testnet',
      addressType: 'taproot',
      accountId: 0,
    })
    expect(mockSetWalletStatus).toHaveBeenCalledWith('syncing')
    expect(mockSetWalletStatus).toHaveBeenCalledWith('unlocked')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('resolves without success toast when sync fails after load; unlocks for manual retry', async () => {
    mockSyncLoadedDescriptorWalletWithEsplora.mockResolvedValueOnce('syncFailed')

    await expect(
      switchDescriptorWallet({
        targetNetworkMode: 'testnet',
        targetAddressType: 'taproot',
        targetAccountId: 0,
        currentNetworkMode: 'signet',
        currentAddressType: 'taproot',
        currentAccountId: 0,
      }),
    ).resolves.toBeUndefined()

    expect(mockSyncLoadedDescriptorWalletWithEsplora).toHaveBeenCalled()
    expect(mockCommitLoadedDescriptorWallet).toHaveBeenCalledWith({
      networkMode: 'testnet',
      addressType: 'taproot',
      accountId: 0,
    })
    const successCalls = vi.mocked(toast.success).mock.calls.map((c) => c[0])
    expect(successCalls.some((m) => String(m).includes('descriptor wallet loaded'))).toBe(
      false,
    )
    expect(mockSetWalletStatus).toHaveBeenCalledWith('syncing')
    expect(mockSetWalletStatus).toHaveBeenCalledWith('unlocked')
  })

  it('forces full scan when switching between live networks even if fullScanDone is set', async () => {
    await switchDescriptorWallet({
      targetNetworkMode: 'mainnet',
      targetAddressType: 'taproot',
      targetAccountId: 0,
      currentNetworkMode: 'testnet',
      currentAddressType: 'taproot',
      currentAccountId: 0,
    })

    expect(mockSyncLoadedDescriptorWalletWithEsplora).toHaveBeenCalledWith(
      expect.objectContaining({ fullScanNeeded: true }),
    )
  })

  it('retries load with fresh chain when persisted changeset network mismatches target', async () => {
    mockLoadWallet
      .mockRejectedValueOnce(
        new Error(
          'Wallet error: Network mismatch: loaded testnet4, expected signet',
        ),
      )
      .mockResolvedValueOnce(undefined)

    await switchDescriptorWallet({
      targetNetworkMode: 'signet',
      targetAddressType: 'taproot',
      targetAccountId: 0,
      currentNetworkMode: 'testnet',
      currentAddressType: 'taproot',
      currentAccountId: 0,
    })

    expect(mockLoadWallet).toHaveBeenCalledTimes(2)
    expect(mockLoadWallet).toHaveBeenNthCalledWith(1, {
      externalDescriptor: 'ext',
      internalDescriptor: 'int',
      network: 'signet',
      changesetJson: '{}',
      useEmptyChain: false,
    })
    expect(mockLoadWallet).toHaveBeenNthCalledWith(2, {
      externalDescriptor: 'ext',
      internalDescriptor: 'int',
      network: 'signet',
      changesetJson: '{}',
      useEmptyChain: true,
    })
    expect(mockSyncLoadedDescriptorWalletWithEsplora).toHaveBeenCalledWith(
      expect.objectContaining({ fullScanNeeded: true }),
    )
  })

  it('retries load with fresh chain when changeset cannot be loaded and forces full scan', async () => {
    mockLoadWallet
      .mockRejectedValueOnce(new Error('Wallet could not be loaded from changeset'))
      .mockResolvedValueOnce(undefined)

    await switchDescriptorWallet({
      targetNetworkMode: 'testnet',
      targetAddressType: 'taproot',
      targetAccountId: 0,
      currentNetworkMode: 'mainnet',
      currentAddressType: 'taproot',
      currentAccountId: 0,
    })

    expect(mockLoadWallet).toHaveBeenCalledTimes(2)
    expect(mockSyncLoadedDescriptorWalletWithEsplora).toHaveBeenCalledWith(
      expect.objectContaining({ fullScanNeeded: true }),
    )
  })

  it('does not run Esplora sync for lab target', async () => {
    await switchDescriptorWallet({
      targetNetworkMode: 'lab',
      targetAddressType: 'taproot',
      targetAccountId: 0,
      currentNetworkMode: 'testnet',
      currentAddressType: 'taproot',
      currentAccountId: 0,
    })

    expect(mockSyncLoadedDescriptorWalletWithEsplora).not.toHaveBeenCalled()
    expect(mockCommitLoadedDescriptorWallet).toHaveBeenCalledWith({
      networkMode: 'lab',
      addressType: 'taproot',
      accountId: 0,
    })
    expect(mockSetWalletStatus).toHaveBeenCalledWith('unlocked')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('emits address-type phase labels when phaseContext is addressType', async () => {
    const onPhase = vi.fn()
    await switchDescriptorWallet({
      targetNetworkMode: 'testnet',
      targetAddressType: 'segwit',
      targetAccountId: 0,
      currentNetworkMode: 'testnet',
      currentAddressType: 'taproot',
      currentAccountId: 0,
      phaseContext: 'addressType',
      onPhase,
    })

    const messages = onPhase.mock.calls.map((c) => String(c[0]))
    expect(messages.some((m) => m.includes('Switching address type'))).toBe(true)
    expect(messages.some((m) => m.includes('Taproot'))).toBe(true)
    expect(messages.some((m) => m.includes('SegWit'))).toBe(true)
  })
})
