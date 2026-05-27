import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sumMainnetOnChainSatsForWallet } from '@/lib/esplora/mainnet-onchain-balance-probe'
import type { BalanceInfo } from '@/workers/crypto-types'

const mockOpenWalletSession = vi.fn()
const mockLoadWallet = vi.fn()
const mockGetBalance = vi.fn()
const mockExportChangeset = vi.fn()
const mockGetTransactionList = vi.fn()
const mockLoadDescriptorWalletWithoutSync = vi.fn()
const mockSessionFree = vi.fn()
const mockSessionGetBalance = vi.fn()

const zeroBalance: BalanceInfo = {
  confirmed: 0,
  trustedPending: 0,
  untrustedPending: 0,
  immature: 0,
  total: 0,
}

const mainnetBalance: BalanceInfo = {
  confirmed: 50_000,
  trustedPending: 0,
  untrustedPending: 0,
  immature: 0,
  total: 50_000,
}

vi.mock('@/db/database', () => ({
  getDatabase: vi.fn(),
}))

vi.mock('@/db/wallet-persistence', () => ({
  loadWalletSecretsPayload: vi.fn().mockResolvedValue({
    descriptorWallets: [
      {
        network: 'bitcoin',
        externalDescriptor: 'tr([fingerprint/84h/0h/0h]xpub/0/*)',
        internalDescriptor: 'tr([fingerprint/84h/0h/1h]xpub/1/*)',
        changeSet: '{}',
      },
    ],
  }),
}))

vi.mock('@/lib/wallet/descriptor-wallet-manager', () => ({
  updateDescriptorWalletChangeset: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/wallet/wallet-utils', () => ({
  loadDescriptorWalletWithoutSync: (...args: unknown[]) =>
    mockLoadDescriptorWalletWithoutSync(...args),
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      openWalletSession: mockOpenWalletSession,
      loadWallet: mockLoadWallet,
      getBalance: mockGetBalance,
      exportChangeset: mockExportChangeset,
      getTransactionList: mockGetTransactionList,
    }),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      loadedSubWallet: {
        networkMode: 'testnet',
        addressType: 'taproot',
        accountId: 0,
      },
      networkMode: 'testnet',
      addressType: 'taproot',
      accountId: 0,
      setBalance: vi.fn(),
      setTransactions: vi.fn(),
    }),
  },
}))

describe('sumMainnetOnChainSatsForWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessionGetBalance.mockResolvedValue(mainnetBalance)
    mockOpenWalletSession.mockResolvedValue({
      getBalance: mockSessionGetBalance,
      exportChangeset: vi.fn(),
      free: mockSessionFree,
    })
    mockExportChangeset.mockRejectedValue(
      new Error('No active wallet. Call create_wallet or load_wallet first.'),
    )
    mockLoadDescriptorWalletWithoutSync.mockResolvedValue(undefined)
    mockGetBalance.mockResolvedValue(zeroBalance)
    mockGetTransactionList.mockResolvedValue([])
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
    expect(mockSessionFree).toHaveBeenCalledTimes(1)
  })

  it('restores the active sub-wallet view after probing', async () => {
    await sumMainnetOnChainSatsForWallet({
      password: 'test-password',
      walletId: 1,
    })

    expect(mockLoadDescriptorWalletWithoutSync).toHaveBeenCalledTimes(1)
    expect(mockLoadDescriptorWalletWithoutSync).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 1,
        networkMode: 'testnet',
      }),
    )
    expect(mockGetBalance).toHaveBeenCalledTimes(1)
    expect(mockGetTransactionList).toHaveBeenCalledTimes(1)
  })
})
