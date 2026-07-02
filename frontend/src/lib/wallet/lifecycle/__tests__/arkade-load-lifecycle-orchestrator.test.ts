import { beforeEach, describe, expect, it, vi } from 'vitest'

const featureState = vi.hoisted(() => ({
  isArkadeEnabled: true,
  isMainnetAccessEnabled: false,
}))

const TEST_CONNECTION_ID = 'conn-load-test'

const workerMocks = vi.hoisted(() => ({
  openSession: vi.fn(),
  hasOpenSession: vi.fn(),
  closeSession: vi.fn(),
  reconcileActiveConnectionId: vi.fn(),
  finalizePendingTransactions: vi.fn(),
  delegateSpendableVtxos: vi.fn(),
}))

const setActiveArkadeConnectionIdMock = vi.hoisted(() => vi.fn())
const setLastOperatorSyncTimeMock = vi.hoisted(() => vi.fn())
const setArkadeSignerMigrationHintMock = vi.hoisted(() => vi.fn())
const refreshArkadeStoreFromLoadedWasmMock = vi.hoisted(() => vi.fn())
const findActiveArkadeConnectionSummaryMock = vi.hoisted(() => vi.fn())
const ensureArkadeOperatorConnectionMock = vi.hoisted(() => vi.fn())
const orchestrateArkadePostLoadSyncMock = vi.hoisted(() => vi.fn())
const closeArkadeSessionMock = vi.hoisted(() => vi.fn())
const getArkadeWorkerIfExistsMock = vi.hoisted(() => vi.fn())
const terminateArkadeWorkerMock = vi.hoisted(() => vi.fn())
const clearArkadeDashboardStoreMock = vi.hoisted(() => vi.fn())

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: {
    getState: () => featureState,
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      setActiveArkadeConnectionId: setActiveArkadeConnectionIdMock,
      setLastOperatorSyncTime: setLastOperatorSyncTimeMock,
      setArkadeSignerMigrationHint: setArkadeSignerMigrationHintMock,
    }),
  },
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => workerMocks,
  getArkadeWorkerIfExists: (...args: unknown[]) => getArkadeWorkerIfExistsMock(...args),
  terminateArkadeWorker: (...args: unknown[]) => terminateArkadeWorkerMock(...args),
}))

vi.mock('@/db', () => ({
  getDatabase: vi.fn(() => ({})),
  getWalletSecretsEncrypted: vi.fn(async () => ({
    mnemonic: { ciphertext: new Uint8Array(), iv: new Uint8Array(), salt: new Uint8Array(), kdfPhc: 'x' },
    payload: { ciphertext: new Uint8Array(), iv: new Uint8Array(), salt: new Uint8Array(), kdfPhc: 'x' },
  })),
}))

vi.mock('@/workers/secrets-channel', () => ({
  ensureSecretsChannel: vi.fn().mockResolvedValue(undefined),
  ensureArkadeWorkerSecretsChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/workers/arkade-persistence-channel', () => ({
  ensureArkadeEncryptedSecretsHost: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/arkade/arkade-operator-connections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/arkade/arkade-operator-connections')>()
  return {
    ...actual,
    findActiveArkadeConnectionSummary: (...args: unknown[]) =>
      findActiveArkadeConnectionSummaryMock(...args),
    ensureArkadeOperatorConnection: (...args: unknown[]) =>
      ensureArkadeOperatorConnectionMock(...args),
  }
})

vi.mock('@/lib/arkade/arkade-persistence-store-sync', () => ({
  refreshArkadeStoreFromLoadedWasm: (...args: unknown[]) =>
    refreshArkadeStoreFromLoadedWasmMock(...args),
  clearArkadeDashboardStore: (...args: unknown[]) =>
    clearArkadeDashboardStoreMock(...args),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator')
  >()
  return {
    ...actual,
    orchestrateArkadePostLoadSync: (...args: unknown[]) =>
      orchestrateArkadePostLoadSyncMock(...args),
    configureArkadeSyncForLoadedRail: actual.configureArkadeSyncForLoadedRail,
  }
})

vi.mock('@/lib/arkade/arkade-session-service', () => ({
  closeArkadeSession: (...args: unknown[]) => closeArkadeSessionMock(...args),
}))

import {
  getArkadeLoadLifecycleSnapshot,
  isArkadeLoadFailedForNetwork,
  orchestrateArkadeLoad,
  resetArkadeLoadLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'

describe('arkade-load-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetArkadeLoadLifecycleStateForTests()
    vi.clearAllMocks()
    featureState.isArkadeEnabled = true
    workerMocks.openSession.mockResolvedValue({
      arkadeAddress: 'tark1qtest',
      operatorSignerPkHex: '02deadbeef',
    })
    workerMocks.hasOpenSession.mockResolvedValue(false)
    workerMocks.closeSession.mockResolvedValue(undefined)
    workerMocks.reconcileActiveConnectionId.mockResolvedValue(undefined)
    workerMocks.finalizePendingTransactions.mockResolvedValue({ finalized: 0, pending: 0 })
    workerMocks.delegateSpendableVtxos.mockResolvedValue({ delegated: 0, failed: 0 })
    getArkadeWorkerIfExistsMock.mockReturnValue(null)
    findActiveArkadeConnectionSummaryMock.mockResolvedValue(undefined)
    ensureArkadeOperatorConnectionMock.mockResolvedValue({
      id: TEST_CONNECTION_ID,
      label: 'signet',
      networkMode: 'signet',
      operatorUrl: 'https://asp.example',
      operatorSignerPkHex: '02deadbeef',
      createdAt: '2020-01-01T00:00:00.000Z',
    })
    refreshArkadeStoreFromLoadedWasmMock.mockResolvedValue(undefined)
    orchestrateArkadePostLoadSyncMock.mockResolvedValue(undefined)
    closeArkadeSessionMock.mockResolvedValue(undefined)
  })

  it('load not-configured when feature off', async () => {
    featureState.isArkadeEnabled = false

    await orchestrateArkadeLoad({ walletId: 1, networkMode: 'signet' })

    expect(getArkadeLoadLifecycleSnapshot().loadPhase).toBe('not-configured')
    expect(closeArkadeSessionMock).toHaveBeenCalled()
    expect(workerMocks.openSession).not.toHaveBeenCalled()
  })

  it('load success opens session and refreshes without operator sync in load body', async () => {
    const callOrder: string[] = []
    refreshArkadeStoreFromLoadedWasmMock.mockImplementation(async () => {
      callOrder.push('refresh')
    })
    setActiveArkadeConnectionIdMock.mockImplementation(() => {
      callOrder.push('setActive')
    })

    await orchestrateArkadeLoad({ walletId: 1, networkMode: 'signet' })

    expect(getArkadeLoadLifecycleSnapshot().loadPhase).toBe('loaded')
    expect(workerMocks.openSession).toHaveBeenCalled()
    expect(callOrder).toEqual(['refresh', 'setActive'])
    expect(orchestrateArkadePostLoadSyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 1,
        networkMode: 'signet',
        connectionId: TEST_CONNECTION_ID,
      }),
    )
  })

  it('setActiveArkadeConnectionId at loaded before post-load sync', async () => {
    const order: string[] = []
    setActiveArkadeConnectionIdMock.mockImplementation(() => order.push('setActive'))
    orchestrateArkadePostLoadSyncMock.mockImplementation(async () => {
      order.push('postLoadSync')
    })

    await orchestrateArkadeLoad({ walletId: 1, networkMode: 'signet' })

    expect(order.indexOf('setActive')).toBeLessThan(order.indexOf('postLoadSync'))
  })

  it('load failure sets load-error and tears down worker without leaving loading', async () => {
    getArkadeWorkerIfExistsMock.mockReturnValue(workerMocks)
    workerMocks.openSession.mockRejectedValueOnce(
      new Error('sdkPersistenceJson operator signer mismatch'),
    )

    await expect(
      orchestrateArkadeLoad({ walletId: 1, networkMode: 'signet' }),
    ).rejects.toThrow('sdkPersistenceJson operator signer mismatch')

    expect(getArkadeLoadLifecycleSnapshot()).toEqual({
      loadPhase: 'load-error',
      networkMode: 'signet',
      errorMessage: 'sdkPersistenceJson operator signer mismatch',
    })
    expect(workerMocks.closeSession).not.toHaveBeenCalled()
    expect(terminateArkadeWorkerMock).toHaveBeenCalled()
    expect(clearArkadeDashboardStoreMock).toHaveBeenCalled()
    expect(isArkadeLoadFailedForNetwork('signet')).toBe(true)
    expect(isArkadeLoadFailedForNetwork('testnet')).toBe(false)
  })
})
