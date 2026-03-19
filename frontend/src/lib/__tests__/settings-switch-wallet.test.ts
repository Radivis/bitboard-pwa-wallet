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

vi.mock('@/lib/wallet-utils', () => ({
  syncLoadedSubWalletWithEsplora: mockSyncLoadedSubWalletWithEsplora,
}))

const mockSetWalletStatus = vi.fn()
const mockSetCurrentAddress = vi.fn()
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
    } as ReturnType<typeof useWalletStore.getState>)

    await expect(
      switchDescriptorWallet(
        'testnet',
        'taproot',
        0,
        'signet',
        'taproot',
        0,
      ),
    ).rejects.toThrow('Cannot switch descriptor wallet: no active wallet or session')
  })

  it('rejects after toast when resolveDescriptorWallet fails', async () => {
    vi.mocked(resolveDescriptorWallet).mockRejectedValue(
      new Error('resolve failed'),
    )

    await expect(
      switchDescriptorWallet(
        'testnet',
        'taproot',
        0,
        'signet',
        'taproot',
        0,
      ),
    ).rejects.toThrow('resolve failed')

    expect(toast.error).toHaveBeenCalled()
  })

  it('resolves when load and sync succeed (non-lab)', async () => {
    await switchDescriptorWallet(
      'testnet',
      'taproot',
      0,
      'signet',
      'taproot',
      0,
    )

    expect(mockSyncLoadedSubWalletWithEsplora).toHaveBeenCalledWith({
      networkMode: 'testnet',
      activeWalletId: 1,
      sessionPassword: 'pw',
      targetNetwork: 'testnet',
      targetAddressType: 'taproot',
      targetAccountId: 0,
      fullScanNeeded: false,
    })
    expect(mockSetWalletStatus).toHaveBeenCalledWith('syncing')
    expect(mockSetWalletStatus).toHaveBeenCalledWith('unlocked')
    expect(toast.success).toHaveBeenCalledWith('Label sub-wallet loaded')
  })

  it('resolves without success toast when sync fails after load; stays syncing', async () => {
    mockSyncLoadedSubWalletWithEsplora.mockResolvedValueOnce('sync_failed')

    await expect(
      switchDescriptorWallet(
        'testnet',
        'taproot',
        0,
        'signet',
        'taproot',
        0,
      ),
    ).resolves.toBeUndefined()

    expect(mockSyncLoadedSubWalletWithEsplora).toHaveBeenCalled()
    const successCalls = vi.mocked(toast.success).mock.calls.map((c) => c[0])
    expect(successCalls.some((m) => String(m).includes('sub-wallet loaded'))).toBe(
      false,
    )
    expect(mockSetWalletStatus).toHaveBeenCalledWith('syncing')
    expect(mockSetWalletStatus).not.toHaveBeenCalledWith('unlocked')
  })

  it('does not run Esplora sync for lab target', async () => {
    await switchDescriptorWallet(
      'lab',
      'taproot',
      0,
      'testnet',
      'taproot',
      0,
    )

    expect(mockSyncLoadedSubWalletWithEsplora).not.toHaveBeenCalled()
    expect(mockSetWalletStatus).toHaveBeenCalledWith('unlocked')
    expect(toast.success).toHaveBeenCalledWith('Label sub-wallet loaded')
  })
})
