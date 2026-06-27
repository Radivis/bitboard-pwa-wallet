import { beforeEach, describe, expect, it, vi } from 'vitest'

const featureState = vi.hoisted(() => ({
  isArkadeEnabled: true,
  isMainnetAccessEnabled: false,
}))

const workerMocks = vi.hoisted(() => ({
  openSession: vi.fn(),
  hasOpenSession: vi.fn(),
  closeSession: vi.fn(),
  reconcileActiveConnectionId: vi.fn(),
  finalizePendingTransactions: vi.fn(),
  delegateSpendableVtxos: vi.fn(),
}))

const findActiveArkadeConnectionSummaryMock = vi.hoisted(() => vi.fn())
const ensureArkadeOperatorConnectionMock = vi.hoisted(() => vi.fn())
const orchestrateArkadePostLoadSyncMock = vi.hoisted(() => vi.fn())
const saveLastSuccessfulOperatorSyncAtEncrypted = vi.hoisted(() => vi.fn())

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: {
    getState: () => featureState,
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      setActiveArkadeConnectionId: vi.fn(),
      setLastOperatorSyncTime: vi.fn(),
      setArkadeSignerMigrationHint: vi.fn(),
    }),
  },
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => workerMocks,
  getArkadeWorkerIfExists: vi.fn(() => null),
  terminateArkadeWorker: vi.fn(),
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
  refreshArkadeStoreFromLoadedWasm: vi.fn().mockResolvedValue(undefined),
  clearArkadeDashboardStore: vi.fn(),
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
  closeArkadeSession: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/arkade/arkade-encrypted-persistence-manager', () => ({
  saveLastSuccessfulOperatorSyncAtEncrypted: (...args: unknown[]) =>
    saveLastSuccessfulOperatorSyncAtEncrypted(...args),
}))

vi.mock('@/lib/arkade/arkade-dashboard-sync', () => ({
  invalidateArkadeDashboardQueries: vi.fn(),
}))

import {
  awaitArkadeLoadQuiescence,
  getArkadeLoadLifecycleSnapshot,
  orchestrateArkadeLoad,
  resetArkadeLoadLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import {
  awaitArkadeSaveQuiescence,
  getArkadeSaveLifecycleSnapshot,
  isArkadeSaveBlockingLock,
  orchestrateArkadeSave,
  resetArkadeSaveLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'

const TEST_CONNECTION_ID = 'conn-error-test'

describe('rail-lifecycle-error-handling', () => {
  beforeEach(() => {
    resetArkadeLoadLifecycleStateForTests()
    resetArkadeSaveLifecycleStateForTests()
    vi.clearAllMocks()
    featureState.isArkadeEnabled = true
    workerMocks.openSession.mockResolvedValue({
      arkadeAddress: 'tark1qtest',
      operatorSignerPkHex: '02deadbeef',
    })
    workerMocks.hasOpenSession.mockResolvedValue(false)
    workerMocks.closeSession.mockResolvedValue(undefined)
    workerMocks.finalizePendingTransactions.mockResolvedValue({ finalized: 0, pending: 0 })
    workerMocks.delegateSpendableVtxos.mockResolvedValue({ delegated: 0, failed: 0 })
    findActiveArkadeConnectionSummaryMock.mockResolvedValue(undefined)
    ensureArkadeOperatorConnectionMock.mockResolvedValue({
      id: TEST_CONNECTION_ID,
      label: 'signet',
      networkMode: 'signet',
      operatorUrl: 'https://asp.example',
      operatorSignerPkHex: '02deadbeef',
      createdAt: '2020-01-01T00:00:00.000Z',
    })
    orchestrateArkadePostLoadSyncMock.mockResolvedValue(undefined)
    saveLastSuccessfulOperatorSyncAtEncrypted.mockResolvedValue(undefined)
  })

  it('prior arkade load failure + different key wait propagates and preserves load-error', async () => {
    let rejectFirstLoad!: (error: Error) => void
    workerMocks.openSession.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirstLoad = reject
        }),
    )

    const firstLoad = orchestrateArkadeLoad({ walletId: 1, networkMode: 'signet' })
    await vi.waitFor(() =>
      expect(getArkadeLoadLifecycleSnapshot().loadPhase).toBe('loading'),
    )

    const secondLoad = orchestrateArkadeLoad({ walletId: 2, networkMode: 'signet' })

    rejectFirstLoad(new Error('first load failed'))
    await expect(firstLoad).rejects.toThrow('first load failed')
    await expect(secondLoad).rejects.toThrow('first load failed')

    expect(getArkadeLoadLifecycleSnapshot()).toEqual({
      loadPhase: 'load-error',
      networkMode: 'signet',
      errorMessage: 'first load failed',
    })
    expect(workerMocks.openSession).toHaveBeenCalledTimes(1)
  })

  it('awaitArkadeSaveQuiescence while save is failing propagates error', async () => {
    let rejectSave!: (error: Error) => void
    saveLastSuccessfulOperatorSyncAtEncrypted.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject
        }),
    )

    const savePromise = orchestrateArkadeSave({
      walletId: 1,
      networkMode: 'signet',
      connectionId: TEST_CONNECTION_ID,
    })
    await vi.waitFor(() =>
      expect(getArkadeSaveLifecycleSnapshot().savePhase).toBe('saving'),
    )

    const quiescencePromise = awaitArkadeSaveQuiescence()
    rejectSave(new Error('disk full'))

    await expect(savePromise).rejects.toThrow('disk full')
    await expect(quiescencePromise).rejects.toThrow('disk full')
    expect(isArkadeSaveBlockingLock()).toBe(true)
  })

  it('load-error snapshot includes sanitized errorMessage', async () => {
    workerMocks.openSession.mockRejectedValueOnce(
      new Error('https://secret-host.example failed'),
    )

    await expect(
      orchestrateArkadeLoad({ walletId: 1, networkMode: 'signet' }),
    ).rejects.toThrow()

    expect(getArkadeLoadLifecycleSnapshot().errorMessage).toBe('[url] failed')
  })

  it('awaitArkadeLoadQuiescence while load is failing propagates error', async () => {
    let rejectLoad!: (error: Error) => void
    workerMocks.openSession.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectLoad = reject
        }),
    )

    const loadPromise = orchestrateArkadeLoad({ walletId: 1, networkMode: 'signet' })
    await vi.waitFor(() =>
      expect(getArkadeLoadLifecycleSnapshot().loadPhase).toBe('loading'),
    )

    const quiescencePromise = awaitArkadeLoadQuiescence()
    rejectLoad(new Error('session open failed'))

    await expect(loadPromise).rejects.toThrow('session open failed')
    await expect(quiescencePromise).rejects.toThrow('session open failed')
  })
})
