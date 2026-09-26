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

const mockCloseArkadeSession = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

const mockTearDownArkadeWorkerAndClientState = vi.hoisted(() => vi.fn())

const mockReleasePreviousWalletDashboardSession = vi.hoisted(() => vi.fn())

const mockSyncAllRailLifecyclesWithLockPhase = vi.hoisted(() => vi.fn())

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

vi.mock('@/lib/arkade/arkade-session-service', () => ({
  closeArkadeSession: (...args: unknown[]) => mockCloseArkadeSession(...args),
}))

vi.mock('@/lib/arkade/arkade-session-teardown', () => ({
  tearDownArkadeWorkerAndClientState: (...args: unknown[]) =>
    mockTearDownArkadeWorkerAndClientState(...args),
}))

vi.mock('@/lib/wallet/new-wallet-dashboard-session', () => ({
  releasePreviousWalletDashboardSession: (...args: unknown[]) =>
    mockReleasePreviousWalletDashboardSession(...args),
}))

vi.mock('@/lib/wallet/lifecycle/rail-lifecycle-lock-handoff', () => ({
  syncAllRailLifecyclesWithLockPhase: (...args: unknown[]) =>
    mockSyncAllRailLifecyclesWithLockPhase(...args),
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
    mockCloseArkadeSession.mockResolvedValue(undefined)

    vi.mocked(useLightningStore.getState).mockReturnValue({
      purgeLightningConnectionsFromMemory: mockPurgeLightningConnectionsFromMemory,
    } as ReturnType<typeof useLightningStore.getState>)

    vi.mocked(useWalletStore.getState).mockReturnValue({
      lockWallet: mockLockWallet,
      setActiveWallet: mockSetActiveWallet,
    } as ReturnType<typeof useWalletStore.getState>)
  })

  it('closes Arkade, releases the previous dashboard, locks, and sets the active wallet', async () => {
    const callOrder: string[] = []

    mockAwaitInFlightWalletSecretsWrites.mockImplementation(async () => {
      callOrder.push('awaitSecrets')
    })
    mockCloseArkadeSession.mockImplementation(async () => {
      callOrder.push('closeArkadeSession')
    })
    mockReleasePreviousWalletDashboardSession.mockImplementation(() => {
      callOrder.push('releasePreviousDashboard')
    })
    mockPurgeLightningConnectionsFromMemory.mockImplementation(() => {
      callOrder.push('purgeLightning')
    })
    mockRemoveLightningConnectionsHydrationQueries.mockImplementation(() => {
      callOrder.push('removeHydrationQueries')
    })
    mockSyncAllRailLifecyclesWithLockPhase.mockImplementation(() => {
      callOrder.push('syncRailsLocked')
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

    expect(mockCloseArkadeSession).toHaveBeenCalledOnce()
    expect(mockReleasePreviousWalletDashboardSession).toHaveBeenCalledWith(42)
    expect(mockSyncAllRailLifecyclesWithLockPhase).toHaveBeenCalledWith('locked')
    expect(mockLockWallet).toHaveBeenCalledOnce()
    expect(mockSetActiveWallet).toHaveBeenCalledWith(42)
    expect(mockTearDownArkadeWorkerAndClientState).not.toHaveBeenCalled()
    expect(callOrder).toEqual([
      'awaitSecrets',
      'closeArkadeSession',
      'releasePreviousDashboard',
      'purgeLightning',
      'removeHydrationQueries',
      'syncRailsLocked',
      'removeOnchainDashboardQueries',
      'lockWallet',
      'setActiveWallet',
    ])
  })

  it('still switches wallets when closing the Arkade session fails', async () => {
    mockCloseArkadeSession.mockRejectedValue(new Error('flush failed'))

    await prepareActiveWalletSwitch(42)

    expect(mockTearDownArkadeWorkerAndClientState).toHaveBeenCalledOnce()
    expect(mockReleasePreviousWalletDashboardSession).toHaveBeenCalledWith(42)
    expect(mockLockWallet).toHaveBeenCalledOnce()
    expect(mockSetActiveWallet).toHaveBeenCalledWith(42)
  })
})
