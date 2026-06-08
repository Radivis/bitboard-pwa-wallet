import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getArkadeEndpoints } from '@/lib/arkade/arkade-endpoints'

const featureState = vi.hoisted(() => ({
  isArkadeEnabled: true,
  isMainnetAccessEnabled: false,
}))

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
}))

const awaitInFlightWalletSecretsWritesMock = vi.hoisted(() => vi.fn())

const upsertArkadeWalletStateMock = vi.hoisted(() => vi.fn())
const ensureSecretsChannelMock = vi.hoisted(() => vi.fn())
const ensureArkadeWorkerSecretsChannelMock = vi.hoisted(() => vi.fn())
const terminateArkadeWorkerMock = vi.hoisted(() => vi.fn())
const removeArkadeDashboardQueriesMock = vi.hoisted(() => vi.fn())
const ensureArkadePersistenceChannelMock = vi.hoisted(() => vi.fn())
const loadSdkPersistenceJsonForNetworkMock = vi.hoisted(() => vi.fn())

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

const getArkadeWorkerIfExistsMock = vi.hoisted(() => vi.fn())

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => workerMocks,
  getArkadeWorkerIfExists: (...args: unknown[]) => getArkadeWorkerIfExistsMock(...args),
  terminateArkadeWorker: (...args: unknown[]) => terminateArkadeWorkerMock(...args),
}))

vi.mock('@/lib/arkade/arkade-wallet-secrets', () => ({
  upsertArkadeWalletState: (...args: unknown[]) => upsertArkadeWalletStateMock(...args),
}))

vi.mock('@/lib/arkade/arkade-query-keys', () => ({
  removeArkadeDashboardQueries: (...args: unknown[]) =>
    removeArkadeDashboardQueriesMock(...args),
}))

vi.mock('@/workers/arkade-persistence-channel', () => ({
  ensureArkadePersistenceChannel: (...args: unknown[]) =>
    ensureArkadePersistenceChannelMock(...args),
}))

vi.mock('@/lib/arkade/arkade-sdk-persistence', () => ({
  loadSdkPersistenceJsonForNetwork: (...args: unknown[]) =>
    loadSdkPersistenceJsonForNetworkMock(...args),
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
    workerMocks.openSession.mockResolvedValue({ arkadeAddress: 'tark1qtest' })
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
    ensureSecretsChannelMock.mockResolvedValue(undefined)
    ensureArkadeWorkerSecretsChannelMock.mockResolvedValue(undefined)
    ensureArkadePersistenceChannelMock.mockResolvedValue(undefined)
    loadSdkPersistenceJsonForNetworkMock.mockResolvedValue(undefined)
    upsertArkadeWalletStateMock.mockResolvedValue(undefined)
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
    expect(loadSdkPersistenceJsonForNetworkMock).toHaveBeenCalledWith({
      password: 'unlock-password',
      walletId: 7,
      networkMode: 'signet',
    })
    expect(workerMocks.openSession).toHaveBeenCalledWith({
      password: 'unlock-password',
      encryptedMnemonic,
      walletId: 7,
      networkMode: 'signet',
      arkServerUrl: endpoints.arkServerUrl,
      delegatorUrl: endpoints.delegatorUrl,
      esploraUrl: endpoints.esploraUrl,
      sdkPersistenceJson: undefined,
    })
    expect(workerMocks.finalizePendingTransactions).toHaveBeenCalledTimes(1)
    expect(workerMocks.delegateSpendableVtxos).not.toHaveBeenCalled()
    expect(upsertArkadeWalletStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'unlock-password',
        walletId: 7,
        networkMode: 'signet',
        patch: expect.objectContaining({
          lastSessionOpenedAt: expect.any(String),
        }),
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
    let resolveOpen: ((value: { arkadeAddress: string }) => void) | undefined
    workerMocks.openSession.mockImplementation(
      () =>
        new Promise<{ arkadeAddress: string }>((resolve) => {
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

    resolveOpen!({ arkadeAddress: 'tark1qtest' })
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

    expect(upsertArkadeWalletStateMock).toHaveBeenCalledTimes(1)
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

  it('does not reopen when the same wallet and network session is already active', async () => {
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
  })
})
