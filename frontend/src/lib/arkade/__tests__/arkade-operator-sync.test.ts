import { beforeEach, describe, expect, it, vi } from 'vitest'

const syncWithOperatorMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const refreshArkadeStoreFromLoadedWasmMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const openArkadeSessionForWalletMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const saveLastSuccessfulOperatorSyncAtEncryptedMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
)

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    syncWithOperator: syncWithOperatorMock,
  }),
}))

vi.mock('@/lib/arkade/arkade-persistence-store-sync', () => ({
  refreshArkadeStoreFromLoadedWasm: (...args: unknown[]) =>
    refreshArkadeStoreFromLoadedWasmMock(...args),
}))

vi.mock('@/lib/arkade/arkade-session-service', () => ({
  openArkadeSessionForWallet: (...args: unknown[]) => openArkadeSessionForWalletMock(...args),
}))

vi.mock('@/lib/arkade/arkade-encrypted-persistence-manager', () => ({
  saveLastSuccessfulOperatorSyncAtEncrypted: (...args: unknown[]) =>
    saveLastSuccessfulOperatorSyncAtEncryptedMock(...args),
}))

vi.mock('@/lib/arkade/arkade-dashboard-sync', () => ({
  invalidateArkadeDashboardQueries: vi.fn(),
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: {
    getState: () => ({
      isArkadeEnabled: true,
      isMainnetAccessEnabled: true,
    }),
  },
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

vi.mock('@/lib/arkade/arkade-utils', () => ({
  isArkadeActiveForNetworkMode: () => true,
}))

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  getArkadeLoadLifecycleSnapshot: () => ({ loadPhase: 'loaded', networkMode: 'signet' }),
}))

import { syncArkadeWithOperator } from '@/lib/arkade/arkade-operator-sync'
import { useWalletStore } from '@/stores/walletStore'

describe('syncArkadeWithOperator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWalletStore.setState({ lastOperatorSyncTime: null })
  })

  it('opens session then syncs on the worker and refreshes store on the main thread', async () => {
    await syncArkadeWithOperator({
      walletId: 1,
      networkMode: 'signet',
      connectionId: 'conn-1',
    })

    expect(openArkadeSessionForWalletMock).toHaveBeenCalledWith({
      walletId: 1,
      networkMode: 'signet',
    })
    expect(syncWithOperatorMock).toHaveBeenCalledTimes(1)
    expect(refreshArkadeStoreFromLoadedWasmMock).toHaveBeenCalledTimes(1)
    expect(saveLastSuccessfulOperatorSyncAtEncryptedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 1,
        connectionId: 'conn-1',
      }),
    )
    expect(useWalletStore.getState().lastOperatorSyncTime).toBeInstanceOf(Date)
  })
})
