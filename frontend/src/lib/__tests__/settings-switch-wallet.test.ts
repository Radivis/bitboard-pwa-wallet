import { describe, it, expect, beforeEach, vi } from 'vitest'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import {
  resolveDescriptorWallet,
  updateDescriptorWalletChangeset,
} from '@/lib/descriptor-wallet-manager'
import { switchDescriptorWallet } from '@/lib/settings-switch-wallet'

const mockSyncLoadedSubWalletWithEsplora = vi.hoisted(() =>
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
  getSubWalletLabel: () => 'Label',
}))

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: {
    getState: vi.fn(),
  },
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: vi.fn(),
  },
}))

vi.mock('@/lib/descriptor-wallet-manager', () => ({
  resolveDescriptorWallet: vi.fn(),
  updateDescriptorWalletChangeset: vi.fn(),
}))

vi.mock('@/lib/wallet-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wallet-utils')>()
  return {
    ...actual,
    syncLoadedSubWalletWithEsplora: mockSyncLoadedSubWalletWithEsplora,
  }
})

const mockSetWalletStatus = vi.fn()
const mockSetCurrentAddress = vi.fn()
const mockCommitLoadedSubWallet = vi.fn()
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
      commitLoadedSubWallet: mockCommitLoadedSubWallet,
    } as ReturnType<typeof useWalletStore.getState>)

    vi.mocked(useSessionStore.getState).mockReturnValue({
      password: 'pw',
    } as ReturnType<typeof useSessionStore.getState>)

    vi.mocked(useCryptoStore.getState).mockReturnValue({
      exportChangeset: mockExportChangeset,
      loadWallet: mockLoadWallet,
      getCurrentAddress: mockGetCurrentAddress,
    } as unknown as ReturnType<typeof useCryptoStore.getState>)

    vi.mocked(resolveDescriptorWallet).mockResolvedValue(descriptorWallet)
    mockSyncLoadedSubWalletWithEsplora.mockResolvedValue('completed')
    vi.mocked(updateDescriptorWalletChangeset).mockResolvedValue(undefined)
  })

  it('throws when there is no active wallet or session', async () => {
    vi.mocked(useWalletStore.getState).mockReturnValue({
      activeWalletId: null,
      setWalletStatus: mockSetWalletStatus,
      setCurrentAddress: mockSetCurrentAddress,
      commitLoadedSubWallet: mockCommitLoadedSubWallet,
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

    expect(mockSyncLoadedSubWalletWithEsplora).toHaveBeenCalledWith({
      networkMode: 'testnet',
      activeWalletId: 1,
      sessionPassword: 'pw',
      targetNetwork: 'testnet',
      targetAddressType: 'taproot',
      targetAccountId: 0,
      fullScanNeeded: false,
    })
    expect(mockCommitLoadedSubWallet).toHaveBeenCalledWith({
      networkMode: 'testnet',
      addressType: 'taproot',
      accountId: 0,
    })
    expect(mockSetWalletStatus).toHaveBeenCalledWith('syncing')
    expect(mockSetWalletStatus).toHaveBeenCalledWith('unlocked')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('resolves without success toast when sync fails after load; unlocks for manual retry', async () => {
    mockSyncLoadedSubWalletWithEsplora.mockResolvedValueOnce('sync_failed')

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

    expect(mockSyncLoadedSubWalletWithEsplora).toHaveBeenCalled()
    expect(mockCommitLoadedSubWallet).toHaveBeenCalledWith({
      networkMode: 'testnet',
      addressType: 'taproot',
      accountId: 0,
    })
    const successCalls = vi.mocked(toast.success).mock.calls.map((c) => c[0])
    expect(successCalls.some((m) => String(m).includes('sub-wallet loaded'))).toBe(
      false,
    )
    expect(mockSetWalletStatus).toHaveBeenCalledWith('syncing')
    expect(mockSetWalletStatus).toHaveBeenCalledWith('unlocked')
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

    expect(mockSyncLoadedSubWalletWithEsplora).not.toHaveBeenCalled()
    expect(mockCommitLoadedSubWallet).toHaveBeenCalledWith({
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
