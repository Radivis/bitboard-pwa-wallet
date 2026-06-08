import { beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_CONNECTION_ID = 'conn-ready-test'

const workerMocks = vi.hoisted(() => ({
  openSession: vi.fn(),
  hasOpenSession: vi.fn().mockResolvedValue(true),
  flushSdkPersistence: vi.fn().mockResolvedValue(undefined),
  exportSdkPersistenceJson: vi.fn().mockResolvedValue('{"version":3}'),
  closeSession: vi.fn(),
  finalizePendingTransactions: vi.fn().mockResolvedValue({ finalized: 0, pending: 0 }),
  delegateSpendableVtxos: vi.fn(),
  getBalance: vi.fn().mockResolvedValue({ confirmedSats: 0, totalSats: 0 }),
  getTransactionHistory: vi.fn().mockResolvedValue([]),
  getAddress: vi.fn().mockResolvedValue('tark1qtest'),
}))

const ensureLegacyArkadeWalletMigratedMock = vi.hoisted(() => vi.fn())
const loadWalletSecretsPayloadMock = vi.hoisted(() => vi.fn())
const refreshArkadeStoreFromLoadedWasmMock = vi.hoisted(() => vi.fn())
const runArkadeOperatorSyncAndPersistMock = vi.hoisted(() => vi.fn())
const encryptedMnemonic = vi.hoisted(() => ({
  ciphertext: new Uint8Array([1, 2, 3]),
  iv: new Uint8Array([4, 5, 6]),
  salt: new Uint8Array([7, 8, 9]),
  kdfPhc: '$argon2id$v=19$m=65536,t=3,p=4$test',
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => workerMocks,
  getArkadeWorkerIfExists: () => workerMocks,
  terminateArkadeWorker: vi.fn(),
}))

vi.mock('@/workers/secrets-channel', () => ({
  ensureSecretsChannel: vi.fn().mockResolvedValue(undefined),
  ensureArkadeWorkerSecretsChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/workers/arkade-persistence-channel', () => ({
  ensureArkadePersistenceChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/db', () => ({
  getDatabase: vi.fn(() => ({})),
  getWalletSecretsEncrypted: vi.fn().mockResolvedValue({ mnemonic: encryptedMnemonic }),
  awaitInFlightWalletSecretsWrites: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/db/wallet-persistence', () => ({
  loadWalletSecretsPayload: (...args: unknown[]) => loadWalletSecretsPayloadMock(...args),
}))

vi.mock('@/lib/arkade/arkade-sdk-persistence', () => ({
  loadSdkPersistenceJsonForNetwork: vi.fn().mockResolvedValue(undefined),
  loadSdkPersistenceJsonForConnection: vi.fn(),
}))

vi.mock('@/lib/arkade/arkade-operator-connections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/arkade/arkade-operator-connections')>()
  return {
    ...actual,
    ensureLegacyArkadeWalletMigrated: (...args: unknown[]) =>
      ensureLegacyArkadeWalletMigratedMock(...args),
    loadActiveArkadeConnectionForNetwork: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/lib/arkade/arkade-persistence-store-sync', () => ({
  refreshArkadeStoreFromLoadedWasm: (...args: unknown[]) =>
    refreshArkadeStoreFromLoadedWasmMock(...args),
  clearArkadeDashboardStore: vi.fn(),
}))

vi.mock('@/lib/arkade/arkade-operator-sync', () => ({
  runArkadeOperatorSyncAndPersist: (...args: unknown[]) =>
    runArkadeOperatorSyncAndPersistMock(...args),
}))

vi.mock('@/lib/arkade/arkade-query-keys', () => ({
  removeArkadeDashboardQueries: vi.fn(),
}))

vi.mock('@/lib/arkade/arkade-dashboard-sync', () => ({
  removeArkadeDashboardSyncQueries: vi.fn(),
}))

vi.mock('@/lib/arkade/arkade-endpoints', () => ({
  getArkadeEndpoints: vi.fn(() => ({
    arkServerUrl: 'http://localhost/api/arkade/operator/signet',
    delegatorUrl: '',
    esploraUrl: 'http://localhost/api/esplora/signet',
  })),
  isArkadeDelegatorConfigured: vi.fn(() => false),
  isArkadeSupportedNetworkMode: vi.fn(() => true),
}))

vi.mock('@/lib/arkade/arkade-utils', () => ({
  isArkadeActiveForNetworkMode: vi.fn(() => true),
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      setActiveArkadeConnectionId: vi.fn(),
      setLastOperatorSyncTime: vi.fn(),
    }),
  },
}))

import {
  awaitArkadeSessionReady,
  closeArkadeSession,
  openArkadeSessionForWallet,
} from '@/lib/arkade/arkade-session-service'

describe('awaitArkadeSessionReady (UNLOCK-ARK-03)', () => {
  beforeEach(async () => {
    await closeArkadeSession()
    vi.clearAllMocks()
    loadWalletSecretsPayloadMock.mockResolvedValue({
      arkadeOperatorConnections: [],
      activeArkadeConnectionIdByNetwork: {},
    })
    ensureLegacyArkadeWalletMigratedMock.mockResolvedValue({
      id: TEST_CONNECTION_ID,
      networkMode: 'signet',
      operatorSignerPkHex: '02deadbeef',
    })
    refreshArkadeStoreFromLoadedWasmMock.mockResolvedValue(undefined)
    runArkadeOperatorSyncAndPersistMock.mockResolvedValue(undefined)
  })

  it('waits for in-flight session open before resolving', async () => {
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
      password: 'pw',
      walletId: 1,
      networkMode: 'signet',
    })

    let readyResolvedEarly = false
    const readyPromise = awaitArkadeSessionReady().then(() => {
      readyResolvedEarly = true
    })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(readyResolvedEarly).toBe(false)

    resolveOpen!({ arkadeAddress: 'tark1qtest', operatorSignerPkHex: '02deadbeef' })
    await Promise.all([openPromise, readyPromise])
    expect(readyResolvedEarly).toBe(true)
    expect(workerMocks.openSession).toHaveBeenCalledTimes(1)
  })
})
