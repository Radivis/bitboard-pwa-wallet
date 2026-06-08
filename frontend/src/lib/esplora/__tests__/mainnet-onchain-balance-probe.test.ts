import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadWalletSecretsPayload } from '@/db/wallet-persistence'
import {
  MainnetBalanceProbeUnverifiableError,
  listWalletsWithPositiveMainnetOnChainBalance,
  sumMainnetOnChainSatsForWallet,
} from '@/lib/esplora/mainnet-onchain-balance-probe'
import type { BalanceInfo } from '@/workers/crypto-types'

const mockOpenWalletSession = vi.fn()
const mockLoadWallet = vi.fn()
const mockExportChangeset = vi.fn()
const mockUpdateDescriptorWalletChangeset = vi.fn()
const mockCancelQueries = vi.fn()
const mockAwaitInFlightWalletSecretsWrites = vi.fn()
const mockSessionFree = vi.fn()
const mockSessionGetBalance = vi.fn()

let mockActiveWalletId: number | null = 1

const zeroBalance: BalanceInfo = {
  confirmedSats: 0,
  trustedPendingSats: 0,
  untrustedPendingSats: 0,
  immatureSats: 0,
  totalSats: 0,
}

const mainnetBalance: BalanceInfo = {
  confirmedSats: 50_000,
  trustedPendingSats: 0,
  untrustedPendingSats: 0,
  immatureSats: 0,
  totalSats: 50_000,
}

const { mainnetDescriptorWallet } = vi.hoisted(() => ({
  mainnetDescriptorWallet: {
    network: 'bitcoin' as const,
    addressType: 'taproot' as const,
    accountId: 0,
    externalDescriptor: 'tr([fingerprint/84h/0h/0h]xpub/0/*)',
    internalDescriptor: 'tr([fingerprint/84h/0h/1h]xpub/1/*)',
    changeSet: '{}',
    fullScanDone: false,
  },
}))

vi.mock('@/db/database', () => ({
  getDatabase: vi.fn(),
}))

vi.mock('@/db/wallet-persistence', () => ({
  loadWalletSecretsPayload: vi.fn().mockResolvedValue({
    descriptorWallets: [mainnetDescriptorWallet],
  }),
}))

vi.mock('@/db/wallet-secrets-write-tracker', () => ({
  awaitInFlightWalletSecretsWrites: () => mockAwaitInFlightWalletSecretsWrites(),
}))

vi.mock('@/lib/shared/app-query-client', () => ({
  appQueryClient: {
    cancelQueries: () => mockCancelQueries(),
  },
}))

vi.mock('@/lib/wallet/descriptor-wallet-manager', () => ({
  updateDescriptorWalletChangeset: (...args: unknown[]) =>
    mockUpdateDescriptorWalletChangeset(...args),
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      openWalletSession: mockOpenWalletSession,
      loadWallet: mockLoadWallet,
      exportChangeset: mockExportChangeset,
    }),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      activeWalletId: mockActiveWalletId,
      loadedDescriptorWallet: {
        networkMode: 'testnet',
        addressType: 'taproot',
        accountId: 0,
      },
      networkMode: 'testnet',
      addressType: 'taproot',
      accountId: 0,
    }),
  },
}))

describe('sumMainnetOnChainSatsForWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveWalletId = 1
    mockAwaitInFlightWalletSecretsWrites.mockResolvedValue(undefined)
    mockCancelQueries.mockResolvedValue(undefined)
    mockSessionGetBalance.mockResolvedValue(mainnetBalance)
    mockOpenWalletSession.mockResolvedValue({
      getBalance: mockSessionGetBalance,
      exportChangeset: vi.fn(),
      free: mockSessionFree,
    })
  })

  it('uses openWalletSession in the probe loop instead of global loadWallet', async () => {
    const total = await sumMainnetOnChainSatsForWallet({
      password: 'test-password',
      walletId: 1,
    })

    expect(total).toBe(50_000)
    expect(mockOpenWalletSession).toHaveBeenCalledTimes(1)
    expect(mockOpenWalletSession).toHaveBeenCalledWith(
      expect.objectContaining({
        network: 'bitcoin',
        useEmptyChain: false,
      }),
    )
    expect(mockLoadWallet).not.toHaveBeenCalled()
    expect(mockUpdateDescriptorWalletChangeset).not.toHaveBeenCalled()
    expect(mockExportChangeset).not.toHaveBeenCalled()
    expect(mockSessionFree).toHaveBeenCalledTimes(1)
    expect(mockCancelQueries).toHaveBeenCalledTimes(1)
    expect(mockAwaitInFlightWalletSecretsWrites).toHaveBeenCalledTimes(1)
  })

  it('fails when empty-chain fallback would understate balance', async () => {
    mockOpenWalletSession
      .mockRejectedValueOnce(new Error('Wallet error: Network mismatch'))
      .mockResolvedValueOnce({
        getBalance: vi.fn().mockResolvedValue(zeroBalance),
        exportChangeset: vi.fn(),
        free: mockSessionFree,
      })

    await expect(
      sumMainnetOnChainSatsForWallet({
        password: 'test-password',
        walletId: 1,
      }),
    ).rejects.toBeInstanceOf(MainnetBalanceProbeUnverifiableError)

    expect(mockOpenWalletSession).toHaveBeenCalledTimes(2)
    expect(mockOpenWalletSession.mock.calls[1][0]).toMatchObject({
      useEmptyChain: true,
    })
    expect(mockSessionFree).toHaveBeenCalledTimes(1)
  })

  it('treats descriptor mismatch as unverifiable balance', async () => {
    mockOpenWalletSession
      .mockRejectedValueOnce(
        new Error(
          'Wallet error: Descriptor mismatch for External keychain: loaded tr([aaa/86\'/0\'/0\']xpub/0/*), expected tr([bbb/86\'/0\'/0\']xpub/0/*)',
        ),
      )
      .mockResolvedValueOnce({
        getBalance: vi.fn().mockResolvedValue(zeroBalance),
        exportChangeset: vi.fn(),
        free: mockSessionFree,
      })

    await expect(
      sumMainnetOnChainSatsForWallet({
        password: 'test-password',
        walletId: 1,
      }),
    ).rejects.toBeInstanceOf(MainnetBalanceProbeUnverifiableError)
  })
})

describe('listWalletsWithPositiveMainnetOnChainBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveWalletId = 1
    mockAwaitInFlightWalletSecretsWrites.mockResolvedValue(undefined)
    mockCancelQueries.mockResolvedValue(undefined)
    mockSessionGetBalance.mockResolvedValue(zeroBalance)
    mockOpenWalletSession.mockResolvedValue({
      getBalance: mockSessionGetBalance,
      exportChangeset: vi.fn(),
      free: mockSessionFree,
    })
  })

  it('collects unverifiable wallets without aborting the full probe', async () => {
    vi.mocked(loadWalletSecretsPayload)
      .mockResolvedValueOnce({
        descriptorWallets: [mainnetDescriptorWallet],
      })
      .mockResolvedValueOnce({
        descriptorWallets: [mainnetDescriptorWallet],
      })

    mockOpenWalletSession
      .mockResolvedValueOnce({
        getBalance: vi.fn().mockResolvedValue(zeroBalance),
        exportChangeset: vi.fn(),
        free: mockSessionFree,
      })
      .mockRejectedValueOnce(
        new Error('Wallet error: Descriptor mismatch for External keychain'),
      )
      .mockResolvedValueOnce({
        getBalance: vi.fn().mockResolvedValue(zeroBalance),
        exportChangeset: vi.fn(),
        free: mockSessionFree,
      })

    const summary = await listWalletsWithPositiveMainnetOnChainBalance({
      password: 'test-password',
      wallets: [
        { walletId: 1, name: 'Wallet One' },
        { walletId: 2, name: 'Wallet Two' },
      ],
    })

    expect(summary.positiveBalanceRows).toEqual([])
    expect(summary.unverifiableWalletNames).toEqual(['Wallet Two'])
    expect(mockUpdateDescriptorWalletChangeset).not.toHaveBeenCalled()
    expect(mockExportChangeset).not.toHaveBeenCalled()
    expect(mockLoadWallet).not.toHaveBeenCalled()
    expect(mockCancelQueries).toHaveBeenCalledTimes(1)
    expect(mockAwaitInFlightWalletSecretsWrites).toHaveBeenCalledTimes(1)
  })
})
