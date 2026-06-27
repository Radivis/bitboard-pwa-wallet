import { beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_CONNECTION_ID = 'conn-ready-test'

const encryptedPayload = vi.hoisted(() => ({
  ciphertext: new Uint8Array([10]),
  iv: new Uint8Array([11]),
  salt: new Uint8Array([12]),
  kdfPhc: '$argon2id$v=19$m=65536,t=3,p=4$test',
}))

const workerMocks = vi.hoisted(() => ({
  openSession: vi.fn(),
  hasOpenSession: vi.fn().mockResolvedValue(true),
  flushSdkPersistence: vi.fn().mockResolvedValue(undefined),
  closeSession: vi.fn(),
  finalizePendingTransactions: vi.fn().mockResolvedValue({ finalized: 0, pending: 0 }),
  delegateSpendableVtxos: vi.fn(),
  getBalance: vi.fn().mockResolvedValue({ confirmedSats: 0, totalSats: 0 }),
  getTransactionHistory: vi.fn().mockResolvedValue([]),
  getAddress: vi.fn().mockResolvedValue('tark1qtest'),
  reconcileActiveConnectionId: vi.fn().mockResolvedValue(undefined),
  syncWithOperator: vi.fn().mockResolvedValue(undefined),
}))

const ensureArkadeOperatorConnectionMock = vi.hoisted(() => vi.fn())
const findActiveArkadeConnectionSummaryMock = vi.hoisted(() => vi.fn())
const refreshArkadeStoreFromLoadedWasmMock = vi.hoisted(() => vi.fn())
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
  ensureArkadeEncryptedSecretsHost: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/db', () => ({
  getDatabase: vi.fn(() => ({})),
  getWalletSecretsEncrypted: vi.fn().mockResolvedValue({
    mnemonic: encryptedMnemonic,
    payload: encryptedPayload,
  }),
  awaitInFlightWalletSecretsWrites: vi.fn().mockResolvedValue(undefined),
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
  clearArkadeDashboardStore: vi.fn(),
}))

vi.mock('@/lib/arkade/arkade-encrypted-persistence-manager', () => ({
  saveLastSuccessfulOperatorSyncAtEncrypted: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/arkade/arkade-query-keys', () => ({
  removeArkadeDashboardQueries: vi.fn(),
}))

vi.mock('@/lib/arkade/arkade-dashboard-sync', () => ({
  removeArkadeDashboardSyncQueries: vi.fn(),
  invalidateArkadeDashboardQueries: vi.fn(),
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
      setArkadeSignerMigrationHint: vi.fn(),
    }),
  },
}))

import {
  awaitArkadeLoadQuiescence,
  closeArkadeSession,
  openArkadeSessionForWallet,
} from '@/lib/arkade/arkade-session-service'

describe('awaitArkadeLoadQuiescence (UNLOCK-ARK-03)', () => {
  beforeEach(async () => {
    await closeArkadeSession()
    vi.clearAllMocks()
    findActiveArkadeConnectionSummaryMock.mockResolvedValue(undefined)
    ensureArkadeOperatorConnectionMock.mockResolvedValue({
      id: TEST_CONNECTION_ID,
      networkMode: 'signet',
      operatorSignerPkHex: '02deadbeef',
    })
    refreshArkadeStoreFromLoadedWasmMock.mockResolvedValue(undefined)
    workerMocks.openSession.mockResolvedValue({
      arkadeAddress: 'tark1qtest',
      operatorSignerPkHex: '02deadbeef',
    })
  })

  it('waits for in-flight load before resolving', async () => {
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
      walletId: 1,
      networkMode: 'signet',
    })

    await vi.waitFor(() => expect(workerMocks.openSession).toHaveBeenCalled())

    let readyResolvedEarly = false
    const readyPromise = awaitArkadeLoadQuiescence().then(() => {
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
