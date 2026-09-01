import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getArkadeEndpoints } from '@/lib/arkade/arkade-endpoints'

const featureState = vi.hoisted(() => ({
  isArkadeEnabled: true,
  isMainnetAccessEnabled: false,
}))

const TEST_ACCOUNT_ID = 'conn-integration-test'

const encryptedPayload = {
  ciphertext: new Uint8Array([10]),
  iv: new Uint8Array([11]),
  salt: new Uint8Array([12]),
  kdfPhc: '$argon2id$v=19$m=65536,t=3,p=4$test',
}

const workerMocks = vi.hoisted(() => ({
  ping: vi.fn(),
  openSession: vi.fn(),
  hasOpenSession: vi.fn(),
  flushSdkPersistence: vi.fn(),
  closeSession: vi.fn(),
  finalizePendingTransactions: vi.fn(),
  delegateSpendableVtxos: vi.fn(),
  getBalance: vi.fn(),
  getTransactionHistory: vi.fn(),
  getAddress: vi.fn(),
  syncWithOperator: vi.fn(),
  reconcileActiveAccountId: vi.fn(),
  getUnilateralExitFrontendPersistence: vi.fn(),
  setUnilateralExitFrontendPersistence: vi.fn(),
  setUnilateralExitJob: vi.fn(),
  setUnilateralExitAutomationPrefs: vi.fn(),
  setUnilateralExitFailure: vi.fn(),
}))

const awaitInFlightWalletSecretsWritesMock = vi.hoisted(() => vi.fn())
const ensureArkadeAccountMock = vi.hoisted(() => vi.fn())
const findActiveArkadeAccountSummaryMock = vi.hoisted(() => vi.fn())
const ensureSecretsChannelMock = vi.hoisted(() => vi.fn())
const ensureArkadeWorkerSecretsChannelMock = vi.hoisted(() => vi.fn())
const terminateArkadeWorkerMock = vi.hoisted(() => vi.fn())
const removeArkadeDashboardQueriesMock = vi.hoisted(() => vi.fn())
const removeArkadeDashboardSyncQueriesMock = vi.hoisted(() => vi.fn())
const clearArkadeDashboardStoreMock = vi.hoisted(() => vi.fn())
const ensureArkadeEncryptedSecretsHostMock = vi.hoisted(() => vi.fn())
const refreshArkadeStoreFromLoadedWasmMock = vi.hoisted(() => vi.fn())
const setActiveArkadeAccountIdMock = vi.hoisted(() => vi.fn())
const setLastOperatorSyncTimeMock = vi.hoisted(() => vi.fn())
const setArkadeSignerMigrationHintMock = vi.hoisted(() => vi.fn())

const encryptedMnemonic = {
  ciphertext: new Uint8Array([1, 2, 3]),
  iv: new Uint8Array([4, 5, 6]),
  salt: new Uint8Array([7, 8, 9]),
  kdfPhc: '$argon2id$v=19$m=65536,t=3,p=4$test',
}

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: {
    getState: () => featureState,
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      setActiveArkadeAccountId: setActiveArkadeAccountIdMock,
      setLastOperatorSyncTime: setLastOperatorSyncTimeMock,
      setArkadeSignerMigrationHint: setArkadeSignerMigrationHintMock,
    }),
  },
}))

vi.mock('@/workers/secrets-channel', () => ({
  ensureSecretsChannel: (...args: unknown[]) => ensureSecretsChannelMock(...args),
  ensureArkadeWorkerSecretsChannel: (...args: unknown[]) =>
    ensureArkadeWorkerSecretsChannelMock(...args),
}))

vi.mock('@/db', () => ({
  getDatabase: vi.fn(() => ({})),
  getWalletSecretsEncrypted: vi.fn(async () => ({
    mnemonic: encryptedMnemonic,
    payload: encryptedPayload,
  })),
  awaitInFlightWalletSecretsWrites: (...args: unknown[]) =>
    awaitInFlightWalletSecretsWritesMock(...args),
}))

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => {}),
    removeItem: vi.fn(async () => {}),
  },
}))

const getArkadeWorkerIfExistsMock = vi.hoisted(() => vi.fn())

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => workerMocks,
  getArkadeWorkerIfExists: (...args: unknown[]) => getArkadeWorkerIfExistsMock(...args),
  terminateArkadeWorker: (...args: unknown[]) => terminateArkadeWorkerMock(...args),
}))

vi.mock('@/lib/arkade/arkade-accounts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/arkade/arkade-accounts')>()
  return {
    ...actual,
    findActiveArkadeAccountSummary: (...args: unknown[]) =>
      findActiveArkadeAccountSummaryMock(...args),
    ensureArkadeAccount: (...args: unknown[]) =>
      ensureArkadeAccountMock(...args),
  }
})

vi.mock('@/lib/arkade/arkade-query-keys', () => ({
  removeArkadeDashboardQueries: (...args: unknown[]) =>
    removeArkadeDashboardQueriesMock(...args),
}))

vi.mock('@/lib/arkade/arkade-encrypted-persistence-manager', () => ({
  saveLastSuccessfulOperatorSyncAtEncrypted: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/arkade/arkade-dashboard-sync', () => ({
  removeArkadeDashboardSyncQueries: (...args: unknown[]) =>
    removeArkadeDashboardSyncQueriesMock(...args),
  invalidateArkadeDashboardQueries: vi.fn(),
}))

vi.mock('@/lib/arkade/arkade-persistence-store-sync', () => ({
  refreshArkadeStoreFromLoadedWasm: (...args: unknown[]) =>
    refreshArkadeStoreFromLoadedWasmMock(...args),
  clearArkadeDashboardStore: (...args: unknown[]) =>
    clearArkadeDashboardStoreMock(...args),
}))

vi.mock('@/workers/arkade-persistence-channel', () => ({
  ensureArkadeEncryptedSecretsHost: (...args: unknown[]) =>
    ensureArkadeEncryptedSecretsHostMock(...args),
}))

import {
  abortArkadeSessionForNetworkSwitch,
  closeArkadeSession,
  openArkadeSessionForWallet,
  refreshArkadeSessionAfterNetworkSwitch,
} from '@/lib/arkade/arkade-session-service'
import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'

describe('openArkadeSessionForWallet (integration)', () => {
  beforeEach(async () => {
    featureState.isArkadeEnabled = true
    featureState.isMainnetAccessEnabled = false
    await closeArkadeSession()
    vi.clearAllMocks()

    workerMocks.ping.mockResolvedValue(true)
    workerMocks.hasOpenSession.mockResolvedValue(true)
    workerMocks.openSession.mockResolvedValue({
      arkadeAddress: 'tark1qtest',
      operatorSignerPkHex: '02deadbeef',
    })
    workerMocks.flushSdkPersistence.mockResolvedValue(undefined)
    workerMocks.getUnilateralExitFrontendPersistence.mockResolvedValue({
      job: {
        selectedLeafOutpoints: [],
        currentStepRelayedSinceUnix: null,
        jobStartedAtUnix: null,
      },
      automationPrefs: {
        enabled: false,
        feePresetLabel: 'Medium',
        maxFeeRateSatPerVb: 10,
      },
      lastFailure: null,
    })
    workerMocks.setUnilateralExitFrontendPersistence.mockResolvedValue(undefined)
    workerMocks.setUnilateralExitJob.mockResolvedValue(undefined)
    workerMocks.setUnilateralExitAutomationPrefs.mockResolvedValue(undefined)
    workerMocks.setUnilateralExitFailure.mockResolvedValue(undefined)
    getArkadeWorkerIfExistsMock.mockReturnValue(workerMocks)
    awaitInFlightWalletSecretsWritesMock.mockResolvedValue(undefined)
    workerMocks.finalizePendingTransactions.mockResolvedValue({
      finalized: 0,
      pending: 0,
    })
    workerMocks.delegateSpendableVtxos.mockResolvedValue({
      delegated: 0,
      failed: 0,
    })
    workerMocks.getBalance.mockResolvedValue({
      confirmedSats: 50_000,
      totalSats: 50_000,
    })
    workerMocks.getTransactionHistory.mockResolvedValue([])
    workerMocks.getAddress.mockResolvedValue('tark1qtest')
    ensureSecretsChannelMock.mockResolvedValue(undefined)
    ensureArkadeWorkerSecretsChannelMock.mockResolvedValue(undefined)
    ensureArkadeEncryptedSecretsHostMock.mockResolvedValue(undefined)
    findActiveArkadeAccountSummaryMock.mockResolvedValue(undefined)
    ensureArkadeAccountMock.mockResolvedValue({
      id: TEST_ACCOUNT_ID,
      label: 'signet',
      networkMode: 'signet',
      operatorUrl: getArkadeEndpoints('signet').arkServerUrl,
      operatorSignerPkHex: '02deadbeef',
      createdAt: '2020-01-01T00:00:00.000Z',
    })
    refreshArkadeStoreFromLoadedWasmMock.mockResolvedValue(undefined)
    workerMocks.syncWithOperator.mockResolvedValue({})
    workerMocks.reconcileActiveAccountId.mockResolvedValue(undefined)
  })

  it('opens worker session with network endpoints after unlock prerequisites', async () => {
    const endpoints = getArkadeEndpoints('signet')

    await openArkadeSessionForWallet({
      walletId: 7,
      networkMode: 'signet',
    })

    expect(ensureSecretsChannelMock).toHaveBeenCalledTimes(1)
    expect(ensureArkadeWorkerSecretsChannelMock).toHaveBeenCalledTimes(1)
    expect(ensureArkadeEncryptedSecretsHostMock).toHaveBeenCalledTimes(1)
    expect(workerMocks.openSession).toHaveBeenCalledWith(
      expect.objectContaining({
        encryptedMnemonic,
        encryptedPayload,
        walletId: 7,
        networkMode: 'signet',
        arkadeAccountId: expect.any(String),
        arkServerUrl: endpoints.arkServerUrl,
        delegatorUrl: endpoints.delegatorUrl,
        esploraUrl: endpoints.esploraUrl,
      }),
    )
    expect(ensureArkadeAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorSignerPkHex: '02deadbeef',
        persistInitialSdkFromWasm: true,
      }),
    )
    expect(refreshArkadeStoreFromLoadedWasmMock).toHaveBeenCalledWith(TEST_ACCOUNT_ID)
    expect(setActiveArkadeAccountIdMock).toHaveBeenCalledWith(TEST_ACCOUNT_ID)
    await vi.waitFor(() => expect(workerMocks.syncWithOperator).toHaveBeenCalled())
    expect(workerMocks.finalizePendingTransactions).toHaveBeenCalledTimes(1)
    expect(workerMocks.delegateSpendableVtxos).not.toHaveBeenCalled()
  })

  it('ARK-HYDRATE-01 sets active account id at load before operator sync', async () => {
    const hydrationOrder: string[] = []
    const persistedAccount = {
      id: TEST_ACCOUNT_ID,
      label: 'signet',
      networkMode: 'signet' as const,
      operatorUrl: getArkadeEndpoints('signet').arkServerUrl,
      operatorSignerPkHex: '02deadbeef',
      createdAt: '2020-01-01T00:00:00.000Z',
      lastSuccessfulOperatorSyncAt: '2020-01-02T00:00:00.000Z',
    }
    findActiveArkadeAccountSummaryMock.mockResolvedValue(persistedAccount)
    ensureArkadeAccountMock.mockResolvedValue(persistedAccount)
    refreshArkadeStoreFromLoadedWasmMock.mockImplementation(async () => {
      hydrationOrder.push('refreshArkadeStoreFromLoadedWasm')
    })
    setActiveArkadeAccountIdMock.mockImplementation(() => {
      hydrationOrder.push('setActiveArkadeAccountId')
    })
    workerMocks.syncWithOperator.mockImplementation(async () => {
      hydrationOrder.push('syncWithOperator')
    })

    await openArkadeSessionForWallet({
      walletId: 7,
      networkMode: 'signet',
    })

    await vi.waitFor(() => expect(workerMocks.syncWithOperator).toHaveBeenCalled())

    expect(hydrationOrder.indexOf('setActiveArkadeAccountId')).toBeGreaterThanOrEqual(0)
    expect(hydrationOrder.indexOf('syncWithOperator')).toBeGreaterThan(
      hydrationOrder.indexOf('setActiveArkadeAccountId'),
    )
    expect(refreshArkadeStoreFromLoadedWasmMock).toHaveBeenCalledWith(TEST_ACCOUNT_ID)
    expect(ensureArkadeAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        persistInitialSdkFromWasm: false,
      }),
    )
  })

  it('closes session instead of opening when Arkade feature is disabled', async () => {
    featureState.isArkadeEnabled = false

    await openArkadeSessionForWallet({
      walletId: 7,
      networkMode: 'signet',
    })

    expect(workerMocks.openSession).not.toHaveBeenCalled()
    expect(workerMocks.flushSdkPersistence).not.toHaveBeenCalled()
    expect(workerMocks.closeSession).not.toHaveBeenCalled()
    expect(terminateArkadeWorkerMock).toHaveBeenCalledTimes(1)
    expect(removeArkadeDashboardQueriesMock).toHaveBeenCalledTimes(1)
    expect(removeArkadeDashboardSyncQueriesMock).toHaveBeenCalledTimes(1)
    expect(clearArkadeDashboardStoreMock).toHaveBeenCalledTimes(1)
  })

  it('flushes SDK persistence and awaits wallet-secrets writes before closeSession', async () => {
    const callOrder: string[] = []
    workerMocks.flushSdkPersistence.mockImplementation(async () => {
      callOrder.push('flushSdkPersistence')
    })
    workerMocks.closeSession.mockImplementation(async () => {
      callOrder.push('closeSession')
    })
    awaitInFlightWalletSecretsWritesMock.mockImplementation(async () => {
      callOrder.push('awaitInFlightWalletSecretsWrites')
    })

    await openArkadeSessionForWallet({
      walletId: 7,
      networkMode: 'signet',
    })
    await closeArkadeSession()

    expect(callOrder).toEqual([
      'flushSdkPersistence',
      'awaitInFlightWalletSecretsWrites',
      'closeSession',
    ])
  })

  it('waits for an in-flight open before closing', async () => {
    let resolveOpen:
      | ((value: { arkadeAddress: string; operatorSignerPkHex: string }) => void)
      | undefined
    workerMocks.openSession.mockImplementation(
      () =>
        new Promise<{ arkadeAddress: string; operatorSignerPkHex: string }>((resolve) => {
          resolveOpen = resolve
        }),
    )

    const openPromise = openArkadeSessionForWallet({
      walletId: 7,
      networkMode: 'signet',
    })
    await vi.waitFor(() => expect(workerMocks.openSession).toHaveBeenCalled())

    const closePromise = closeArkadeSession()
    await Promise.resolve()
    expect(workerMocks.closeSession).not.toHaveBeenCalled()

    resolveOpen!({ arkadeAddress: 'tark1qtest', operatorSignerPkHex: '02deadbeef' })
    await Promise.all([openPromise, closePromise])
    expect(workerMocks.closeSession).toHaveBeenCalledTimes(1)
  })

  it('UNLOCK-ARK-04 completes session open when finalizePendingTransactions fails', async () => {
    workerMocks.finalizePendingTransactions.mockRejectedValueOnce(
      new Error(
        'failed to fetch pending VTXOs: request failed: error in response: status code 400 Bad Request',
      ),
    )

    await expect(
      openArkadeSessionForWallet({
        walletId: 7,
        networkMode: 'signet',
      }),
    ).resolves.toBeUndefined()

    expect(ensureArkadeAccountMock).toHaveBeenCalledTimes(1)
  })

  it('reopens when session key matches but the worker was terminated', async () => {
    await openArkadeSessionForWallet({
      walletId: 7,
      networkMode: 'signet',
    })
    expect(workerMocks.openSession).toHaveBeenCalledTimes(1)

    getArkadeWorkerIfExistsMock.mockReturnValue(null)
    await openArkadeSessionForWallet({
      walletId: 7,
      networkMode: 'signet',
    })

    expect(workerMocks.openSession).toHaveBeenCalledTimes(2)
  })

  it('reopens when worker exists but WASM session is not active', async () => {
    findActiveArkadeAccountSummaryMock.mockResolvedValue({
      id: TEST_ACCOUNT_ID,
      networkMode: 'signet',
      operatorSignerPkHex: '02deadbeef',
      label: 'signet',
      operatorUrl: getArkadeEndpoints('signet').arkServerUrl,
      createdAt: '2020-01-01T00:00:00.000Z',
    })

    await openArkadeSessionForWallet({
      walletId: 7,
      networkMode: 'signet',
    })
    expect(workerMocks.openSession).toHaveBeenCalledTimes(1)

    workerMocks.hasOpenSession.mockResolvedValueOnce(false)
    await openArkadeSessionForWallet({
      walletId: 7,
      networkMode: 'signet',
    })

    expect(workerMocks.openSession).toHaveBeenCalledTimes(2)
  })

  it('does not reopen when the same wallet, network, and account session is already active', async () => {
    const activeAccount = {
      id: TEST_ACCOUNT_ID,
      label: 'signet',
      networkMode: 'signet' as const,
      operatorUrl: getArkadeEndpoints('signet').arkServerUrl,
      operatorSignerPkHex: '02deadbeef',
      createdAt: '2020-01-01T00:00:00.000Z',
    }
    findActiveArkadeAccountSummaryMock.mockResolvedValue(activeAccount)

    await openArkadeSessionForWallet({
      walletId: 7,
      networkMode: 'signet',
    })
    await openArkadeSessionForWallet({
      walletId: 7,
      networkMode: 'signet',
    })

    expect(workerMocks.openSession).toHaveBeenCalledTimes(1)
    expect(workerMocks.hasOpenSession).toHaveBeenCalledWith({
      walletId: 7,
      networkMode: 'signet',
      arkadeAccountId: TEST_ACCOUNT_ID,
    })
  })

  it('closeArkadeSession rejects when flushSdkPersistence fails for a loaded session', async () => {
    await openArkadeSessionForWallet({
      walletId: 7,
      networkMode: 'signet',
    })
    workerMocks.flushSdkPersistence.mockRejectedValueOnce(new Error('flush failed'))

    await expect(closeArkadeSession()).rejects.toThrow('flush failed')

    expect(workerMocks.closeSession).not.toHaveBeenCalled()
  })

  it('closeArkadeSession skips flush when session never reached loaded', async () => {
    workerMocks.openSession.mockRejectedValueOnce(new Error('persistence mismatch'))

    await expect(
      openArkadeSessionForWallet({
        walletId: 7,
        networkMode: 'signet',
      }),
    ).rejects.toThrow('persistence mismatch')

    expect(getArkadeLoadLifecycleSnapshot().loadPhase).toBe('load-error')

    await closeArkadeSession()

    expect(workerMocks.flushSdkPersistence).not.toHaveBeenCalled()
    expect(workerMocks.closeSession).not.toHaveBeenCalled()
    expect(getArkadeLoadLifecycleSnapshot()).toEqual({
      loadPhase: 'not-configured',
      networkMode: null,
      errorMessage: null,
    })
  })

  it('abortArkadeSessionForNetworkSwitch terminates without awaiting stuck session open', async () => {
    workerMocks.openSession.mockImplementation(() => new Promise(() => {}))
    getArkadeWorkerIfExistsMock.mockReturnValue(workerMocks)

    void openArkadeSessionForWallet({
      walletId: 7,
      networkMode: 'signet',
    })

    await vi.waitFor(() =>
      expect(getArkadeLoadLifecycleSnapshot().loadPhase).toBe('loading'),
    )

    await abortArkadeSessionForNetworkSwitch()

    expect(terminateArkadeWorkerMock).toHaveBeenCalled()
    expect(getArkadeLoadLifecycleSnapshot()).toEqual({
      loadPhase: 'not-configured',
      networkMode: null,
      errorMessage: null,
    })
  })

  it('refreshArkadeSessionAfterNetworkSwitch reports open errors without rethrowing', async () => {
    const reportSpy = vi.spyOn(
      await import('@/lib/arkade/arkade-session-open-error-toast'),
      'reportArkadeSessionOpenError',
    )
    workerMocks.openSession.mockRejectedValueOnce(new Error('operator down'))

    await refreshArkadeSessionAfterNetworkSwitch({
      walletId: 7,
      networkMode: 'signet',
    })

    expect(reportSpy).toHaveBeenCalled()
    reportSpy.mockRestore()
  })
})
