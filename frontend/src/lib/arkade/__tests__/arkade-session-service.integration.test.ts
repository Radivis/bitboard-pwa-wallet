import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getArkadeEndpoints } from '@/lib/arkade/arkade-endpoints'

const featureState = vi.hoisted(() => ({
  isArkadeEnabled: true,
  isMainnetAccessEnabled: false,
}))

const TEST_CONNECTION_ID = 'conn-integration-test'

const workerMocks = vi.hoisted(() => ({
  ping: vi.fn(),
  openSession: vi.fn(),
  hasOpenSession: vi.fn(),
  flushSdkPersistence: vi.fn(),
  exportSdkPersistenceJson: vi.fn(),
  closeSession: vi.fn(),
  finalizePendingTransactions: vi.fn(),
  delegateSpendableVtxos: vi.fn(),
  getBalance: vi.fn(),
  getTransactionHistory: vi.fn(),
  getAddress: vi.fn(),
  syncWithOperator: vi.fn(),
  reconcileActiveConnectionId: vi.fn(),
}))

const awaitInFlightWalletSecretsWritesMock = vi.hoisted(() => vi.fn())
const ensureArkadeOperatorConnectionMock = vi.hoisted(() => vi.fn())
const ensureSecretsChannelMock = vi.hoisted(() => vi.fn())
const ensureArkadeWorkerSecretsChannelMock = vi.hoisted(() => vi.fn())
const terminateArkadeWorkerMock = vi.hoisted(() => vi.fn())
const removeArkadeDashboardQueriesMock = vi.hoisted(() => vi.fn())
const removeArkadeDashboardSyncQueriesMock = vi.hoisted(() => vi.fn())
const clearArkadeDashboardStoreMock = vi.hoisted(() => vi.fn())
const ensureArkadePersistenceChannelMock = vi.hoisted(() => vi.fn())
const loadActiveArkadeConnectionForNetworkMock = vi.hoisted(() => vi.fn())
const runArkadeOperatorSyncAndPersistMock = vi.hoisted(() => vi.fn())
const refreshArkadeStoreFromLoadedWasmMock = vi.hoisted(() => vi.fn())
const loadWalletSecretsPayloadMock = vi.hoisted(() => vi.fn())
const setActiveArkadeConnectionIdMock = vi.hoisted(() => vi.fn())
const setLastOperatorSyncTimeMock = vi.hoisted(() => vi.fn())

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
      setActiveArkadeConnectionId: setActiveArkadeConnectionIdMock,
      setLastOperatorSyncTime: setLastOperatorSyncTimeMock,
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
    payload: {},
  })),
  awaitInFlightWalletSecretsWrites: (...args: unknown[]) =>
    awaitInFlightWalletSecretsWritesMock(...args),
}))

vi.mock('@/db/wallet-persistence', () => ({
  loadWalletSecretsPayload: (...args: unknown[]) => loadWalletSecretsPayloadMock(...args),
}))

const getArkadeWorkerIfExistsMock = vi.hoisted(() => vi.fn())

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => workerMocks,
  getArkadeWorkerIfExists: (...args: unknown[]) => getArkadeWorkerIfExistsMock(...args),
  terminateArkadeWorker: (...args: unknown[]) => terminateArkadeWorkerMock(...args),
}))

vi.mock('@/lib/arkade/arkade-operator-connections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/arkade/arkade-operator-connections')>()
  return {
    ...actual,
    ensureArkadeOperatorConnection: (...args: unknown[]) =>
      ensureArkadeOperatorConnectionMock(...args),
    loadActiveArkadeConnectionForNetwork: (...args: unknown[]) =>
      loadActiveArkadeConnectionForNetworkMock(...args),
  }
})

vi.mock('@/lib/arkade/arkade-query-keys', () => ({
  removeArkadeDashboardQueries: (...args: unknown[]) =>
    removeArkadeDashboardQueriesMock(...args),
}))

vi.mock('@/lib/arkade/arkade-dashboard-sync', () => ({
  removeArkadeDashboardSyncQueries: (...args: unknown[]) =>
    removeArkadeDashboardSyncQueriesMock(...args),
}))

vi.mock('@/lib/arkade/arkade-persistence-store-sync', () => ({
  refreshArkadeStoreFromLoadedWasm: (...args: unknown[]) =>
    refreshArkadeStoreFromLoadedWasmMock(...args),
  clearArkadeDashboardStore: (...args: unknown[]) =>
    clearArkadeDashboardStoreMock(...args),
}))

vi.mock('@/lib/arkade/arkade-operator-sync', () => ({
  awaitBackgroundArkadeOperatorSync: vi.fn().mockResolvedValue(undefined),
  runArkadeOperatorSyncAndPersist: (...args: unknown[]) =>
    runArkadeOperatorSyncAndPersistMock(...args),
}))

vi.mock('@/workers/arkade-persistence-channel', () => ({
  ensureArkadePersistenceChannel: (...args: unknown[]) =>
    ensureArkadePersistenceChannelMock(...args),
}))

vi.mock('@/lib/arkade/arkade-sdk-persistence', () => ({
  loadSdkPersistenceJsonForConnection: vi.fn(),
}))

import {
  closeArkadeSession,
  openArkadeSessionForWallet,
} from '@/lib/arkade/arkade-session-service'

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
    workerMocks.exportSdkPersistenceJson.mockResolvedValue('{"version":3}')
    workerMocks.flushSdkPersistence.mockResolvedValue(undefined)
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
    ensureArkadePersistenceChannelMock.mockResolvedValue(undefined)
    loadActiveArkadeConnectionForNetworkMock.mockResolvedValue(undefined)
    loadWalletSecretsPayloadMock.mockResolvedValue({
      arkadeOperatorConnections: [],
      activeArkadeConnectionIdByNetwork: {},
    })
    ensureArkadeOperatorConnectionMock.mockResolvedValue({
      id: TEST_CONNECTION_ID,
      label: 'signet',
      networkMode: 'signet',
      operatorUrl: getArkadeEndpoints('signet').arkServerUrl,
      operatorSignerPkHex: '02deadbeef',
      createdAt: '2020-01-01T00:00:00.000Z',
    })
    refreshArkadeStoreFromLoadedWasmMock.mockResolvedValue(undefined)
    runArkadeOperatorSyncAndPersistMock.mockResolvedValue(undefined)
  })

  it('opens worker session with network endpoints after unlock prerequisites', async () => {
    const endpoints = getArkadeEndpoints('signet')

    await openArkadeSessionForWallet({
      password: 'unlock-password',
      walletId: 7,
      networkMode: 'signet',
    })

    expect(ensureSecretsChannelMock).toHaveBeenCalledTimes(1)
    expect(ensureArkadeWorkerSecretsChannelMock).toHaveBeenCalledTimes(1)
    expect(ensureArkadePersistenceChannelMock).toHaveBeenCalledTimes(1)
    expect(workerMocks.openSession).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'unlock-password',
        encryptedMnemonic,
        walletId: 7,
        networkMode: 'signet',
        connectionId: expect.any(String),
        arkServerUrl: endpoints.arkServerUrl,
        delegatorUrl: endpoints.delegatorUrl,
        esploraUrl: endpoints.esploraUrl,
        sdkPersistenceJson: undefined,
      }),
    )
    expect(ensureArkadeOperatorConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorSignerPkHex: '02deadbeef',
      }),
    )
    expect(runArkadeOperatorSyncAndPersistMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: TEST_CONNECTION_ID,
        sessionAlreadyOpen: true,
      }),
    )
    expect(refreshArkadeStoreFromLoadedWasmMock).toHaveBeenCalledWith(TEST_CONNECTION_ID)
    expect(setActiveArkadeConnectionIdMock).toHaveBeenCalledWith(TEST_CONNECTION_ID)
    expect(workerMocks.finalizePendingTransactions).toHaveBeenCalledTimes(1)
    expect(workerMocks.delegateSpendableVtxos).not.toHaveBeenCalled()
  })

  it('ARK-HYDRATE-01 sets active connection id only after WASM dashboard refresh', async () => {
    const hydrationOrder: string[] = []
    const persistedConnection = {
      id: TEST_CONNECTION_ID,
      label: 'signet',
      networkMode: 'signet' as const,
      operatorUrl: getArkadeEndpoints('signet').arkServerUrl,
      operatorSignerPkHex: '02deadbeef',
      createdAt: '2020-01-01T00:00:00.000Z',
      lastSuccessfulOperatorSyncAt: '2020-01-02T00:00:00.000Z',
    }
    loadWalletSecretsPayloadMock.mockResolvedValue({
      arkadeOperatorConnections: [persistedConnection],
      activeArkadeConnectionIdByNetwork: { signet: TEST_CONNECTION_ID },
    })
    ensureArkadeOperatorConnectionMock.mockResolvedValue(persistedConnection)
    refreshArkadeStoreFromLoadedWasmMock.mockImplementation(async () => {
      hydrationOrder.push('refreshArkadeStoreFromLoadedWasm')
    })
    setActiveArkadeConnectionIdMock.mockImplementation(() => {
      hydrationOrder.push('setActiveArkadeConnectionId')
    })

    await openArkadeSessionForWallet({
      password: 'unlock-password',
      walletId: 7,
      networkMode: 'signet',
    })

    expect(hydrationOrder).toEqual([
      'refreshArkadeStoreFromLoadedWasm',
      'refreshArkadeStoreFromLoadedWasm',
      'setActiveArkadeConnectionId',
    ])
    expect(refreshArkadeStoreFromLoadedWasmMock).toHaveBeenCalledTimes(2)
    expect(refreshArkadeStoreFromLoadedWasmMock).toHaveBeenNthCalledWith(
      1,
      TEST_CONNECTION_ID,
    )
    expect(refreshArkadeStoreFromLoadedWasmMock).toHaveBeenNthCalledWith(
      2,
      TEST_CONNECTION_ID,
    )
    expect(runArkadeOperatorSyncAndPersistMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: TEST_CONNECTION_ID,
        sessionAlreadyOpen: true,
      }),
    )
  })

  it('closes session instead of opening when Arkade feature is disabled', async () => {
    featureState.isArkadeEnabled = false

    await openArkadeSessionForWallet({
      password: 'unlock-password',
      walletId: 7,
      networkMode: 'signet',
    })

    expect(workerMocks.openSession).not.toHaveBeenCalled()
    expect(workerMocks.closeSession).toHaveBeenCalledTimes(1)
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
      password: 'unlock-password',
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
        password: 'unlock-password',
        walletId: 7,
        networkMode: 'signet',
      }),
    ).resolves.toBeUndefined()

    expect(ensureArkadeOperatorConnectionMock).toHaveBeenCalledTimes(1)
  })

  it('reopens when session key matches but the worker was terminated', async () => {
    await openArkadeSessionForWallet({
      password: 'unlock-password',
      walletId: 7,
      networkMode: 'signet',
    })
    expect(workerMocks.openSession).toHaveBeenCalledTimes(1)

    getArkadeWorkerIfExistsMock.mockReturnValue(null)
    await openArkadeSessionForWallet({
      password: 'unlock-password',
      walletId: 7,
      networkMode: 'signet',
    })

    expect(workerMocks.openSession).toHaveBeenCalledTimes(2)
  })

  it('reopens when worker exists but WASM session is not active', async () => {
    loadActiveArkadeConnectionForNetworkMock.mockResolvedValue({
      id: TEST_CONNECTION_ID,
      networkMode: 'signet',
      operatorSignerPkHex: '02deadbeef',
    })
    loadWalletSecretsPayloadMock.mockResolvedValue({
      arkadeOperatorConnections: [{ id: TEST_CONNECTION_ID, networkMode: 'signet' }],
      activeArkadeConnectionIdByNetwork: { signet: TEST_CONNECTION_ID },
    })

    await openArkadeSessionForWallet({
      password: 'unlock-password',
      walletId: 7,
      networkMode: 'signet',
    })
    expect(workerMocks.openSession).toHaveBeenCalledTimes(1)

    workerMocks.hasOpenSession.mockResolvedValueOnce(false)
    await openArkadeSessionForWallet({
      password: 'unlock-password',
      walletId: 7,
      networkMode: 'signet',
    })

    expect(workerMocks.openSession).toHaveBeenCalledTimes(2)
  })

  it('does not reopen when the same wallet, network, and connection session is already active', async () => {
    const activeConnection = {
      id: TEST_CONNECTION_ID,
      label: 'signet',
      networkMode: 'signet' as const,
      operatorUrl: getArkadeEndpoints('signet').arkServerUrl,
      operatorSignerPkHex: '02deadbeef',
      createdAt: '2020-01-01T00:00:00.000Z',
    }
    loadActiveArkadeConnectionForNetworkMock.mockResolvedValue(activeConnection)
    loadWalletSecretsPayloadMock.mockResolvedValue({
      arkadeOperatorConnections: [activeConnection],
      activeArkadeConnectionIdByNetwork: { signet: TEST_CONNECTION_ID },
    })

    await openArkadeSessionForWallet({
      password: 'unlock-password',
      walletId: 7,
      networkMode: 'signet',
    })
    await openArkadeSessionForWallet({
      password: 'unlock-password',
      walletId: 7,
      networkMode: 'signet',
    })

    expect(workerMocks.openSession).toHaveBeenCalledTimes(1)
    expect(workerMocks.hasOpenSession).toHaveBeenCalledWith({
      walletId: 7,
      networkMode: 'signet',
      connectionId: TEST_CONNECTION_ID,
    })
  })
})
