import { beforeEach, describe, expect, it, vi } from 'vitest'

const workerMocks = vi.hoisted(() => ({
  openSession: vi.fn(),
  flushSdkPersistence: vi.fn().mockResolvedValue(undefined),
  closeSession: vi.fn(),
  finalizePendingTransactions: vi.fn().mockResolvedValue({ finalized: 0, pending: 0 }),
  delegateSpendableVtxos: vi.fn(),
  setSdkPersistenceBridge: vi.fn(),
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
  getWalletSecretsEncrypted: vi.fn().mockResolvedValue({ mnemonic: 'encrypted' }),
}))

vi.mock('@/lib/arkade/arkade-sdk-persistence', () => ({
  loadSdkPersistenceJsonForNetwork: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/arkade/arkade-wallet-secrets', () => ({
  upsertArkadeWalletState: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/arkade/arkade-query-keys', () => ({
  removeArkadeDashboardQueries: vi.fn(),
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

import {
  awaitArkadeSessionReady,
  closeArkadeSession,
  openArkadeSessionForWallet,
} from '@/lib/arkade/arkade-session-service'

describe('awaitArkadeSessionReady (UNLOCK-ARK-03)', () => {
  beforeEach(async () => {
    await closeArkadeSession()
    vi.clearAllMocks()
  })

  it('waits for in-flight session open before resolving', async () => {
    let resolveOpen: ((value: { arkadeAddress: string }) => void) | undefined
    workerMocks.openSession.mockImplementation(
      () =>
        new Promise<{ arkadeAddress: string }>((resolve) => {
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

    resolveOpen!({ arkadeAddress: 'tark1qtest' })
    await Promise.all([openPromise, readyPromise])
    expect(readyResolvedEarly).toBe(true)
    expect(workerMocks.openSession).toHaveBeenCalledTimes(1)
  })
})
