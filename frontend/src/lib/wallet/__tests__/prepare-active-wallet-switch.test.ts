import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareActiveWalletSwitch } from '@/lib/wallet/prepare-active-wallet-switch'
import { useLightningStore } from '@/stores/lightningStore'
import { useWalletStore } from '@/stores/walletStore'

const mockAwaitInFlightWalletSecretsWrites = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
)

const mockPurgeLightningConnectionsFromMemory = vi.hoisted(() => vi.fn())

const mockRemoveLightningConnectionsHydrationQueries = vi.hoisted(() => vi.fn())

const mockRemoveOnchainDashboardQueries = vi.hoisted(() => vi.fn())

const mockLockWallet = vi.hoisted(() => vi.fn())

const mockSetActiveWallet = vi.hoisted(() => vi.fn())

vi.mock('@/db/wallet-secrets-write-tracker', () => ({
  awaitInFlightWalletSecretsWrites: mockAwaitInFlightWalletSecretsWrites,
}))

vi.mock('@/lib/lightning/lightning-connections-hydration', () => ({
  removeLightningConnectionsHydrationQueries:
    mockRemoveLightningConnectionsHydrationQueries,
}))

vi.mock('@/lib/wallet/onchain-dashboard-sync', () => ({
  removeOnchainDashboardQueries: mockRemoveOnchainDashboardQueries,
}))

vi.mock('@/stores/lightningStore', () => ({
  useLightningStore: {
    getState: vi.fn(),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: vi.fn(),
  },
}))

describe('prepareActiveWalletSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useLightningStore.getState).mockReturnValue({
      purgeLightningConnectionsFromMemory: mockPurgeLightningConnectionsFromMemory,
    } as ReturnType<typeof useLightningStore.getState>)

    vi.mocked(useWalletStore.getState).mockReturnValue({
      lockWallet: mockLockWallet,
      setActiveWallet: mockSetActiveWallet,
    } as ReturnType<typeof useWalletStore.getState>)
  })

  it('waits for secrets writes, purges Lightning state, locks, and sets active wallet', async () => {
    const callOrder: string[] = []

    mockAwaitInFlightWalletSecretsWrites.mockImplementation(async () => {
      callOrder.push('awaitSecrets')
    })
    mockPurgeLightningConnectionsFromMemory.mockImplementation(() => {
      callOrder.push('purgeLightning')
    })
    mockRemoveLightningConnectionsHydrationQueries.mockImplementation(() => {
      callOrder.push('removeHydrationQueries')
    })
    mockRemoveOnchainDashboardQueries.mockImplementation(() => {
      callOrder.push('removeOnchainDashboardQueries')
    })
    mockLockWallet.mockImplementation(() => {
      callOrder.push('lockWallet')
    })
    mockSetActiveWallet.mockImplementation(() => {
      callOrder.push('setActiveWallet')
    })

    await prepareActiveWalletSwitch(42)

    expect(mockAwaitInFlightWalletSecretsWrites).toHaveBeenCalledOnce()
    expect(mockPurgeLightningConnectionsFromMemory).toHaveBeenCalledOnce()
    expect(mockRemoveLightningConnectionsHydrationQueries).toHaveBeenCalledOnce()
    expect(mockRemoveOnchainDashboardQueries).toHaveBeenCalledOnce()
    expect(mockLockWallet).toHaveBeenCalledOnce()
    expect(mockSetActiveWallet).toHaveBeenCalledWith(42)
    expect(callOrder).toEqual([
      'awaitSecrets',
      'purgeLightning',
      'removeHydrationQueries',
      'removeOnchainDashboardQueries',
      'lockWallet',
      'setActiveWallet',
    ])
  })
})
