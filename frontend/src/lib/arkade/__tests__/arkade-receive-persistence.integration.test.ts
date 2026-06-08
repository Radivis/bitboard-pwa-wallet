import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'
import {
  loadSdkPersistenceJsonForConnection,
  readOffchainNextDerivationIndex,
  saveSdkPersistenceJsonForConnection,
} from '@/lib/arkade/arkade-sdk-persistence'
import {
  flushSdkPersistenceNow,
  setArkadeSdkPersistenceBridge,
  setArkadeSdkPersistenceExporter,
  setArkadeSdkPersistenceFlushContext,
} from '@/lib/arkade/storage/arkade-sdk-persistence-flush'
import {
  loadWalletSecretsPayload,
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'

vi.mock('@/db/database', () => ({
  getDatabase: vi.fn(() => ({})),
}))

vi.mock('@/db/wallet-persistence', () => ({
  loadWalletSecretsPayload: vi.fn(),
  updateWalletSecretsPayloadWithRetry: vi.fn(),
}))

const CONNECTION_ID = 'conn-receive-persist-test'
const WALLET_ID = 9
const PASSWORD = 'test-password'

function persistenceJsonWithReceiveIndex(index: number): string {
  return JSON.stringify({
    version: 3,
    wallet_db: { offchain_next_derivation_index: index },
  })
}

function emptyPayload(): WalletSecretsPayload {
  return {
    descriptorWallets: [],
    lightningNwcConnections: [],
    arkadeOperatorConnections: [
      {
        id: CONNECTION_ID,
        label: 'signet',
        networkMode: 'signet',
        operatorUrl: 'https://signet.arkade.example/v1',
        operatorSignerPkHex: '02abc',
        createdAt: '2020-01-01T00:00:00.000Z',
      },
    ],
    activeArkadeConnectionIdByNetwork: { signet: CONNECTION_ID },
  }
}

describe('arkade receive persistence (integration)', () => {
  let payload: WalletSecretsPayload

  beforeEach(() => {
    vi.clearAllMocks()
    payload = emptyPayload()

    vi.mocked(updateWalletSecretsPayloadWithRetry).mockImplementation(async ({ transform }) => {
      payload = await transform(payload)
    })
    vi.mocked(loadWalletSecretsPayload).mockImplementation(async () => payload)

    setArkadeSdkPersistenceExporter(async () => persistenceJsonWithReceiveIndex(2))
    setArkadeSdkPersistenceBridge({
      persistSdkPersistence: async (params) => {
        await saveSdkPersistenceJsonForConnection({
          password: params.password,
          walletId: params.walletId,
          connectionId: params.connectionId,
          sdkPersistenceJson: params.sdkPersistenceJson,
          lastSuccessfulOperatorSyncAt: params.lastSuccessfulOperatorSyncAt,
        })
      },
    })
    setArkadeSdkPersistenceFlushContext({
      walletId: WALLET_ID,
      networkMode: 'signet',
      connectionId: CONNECTION_ID,
      password: PASSWORD,
    })
  })

  afterEach(() => {
    setArkadeSdkPersistenceExporter(null)
    setArkadeSdkPersistenceBridge(null)
    setArkadeSdkPersistenceFlushContext(null)
  })

  it('RCV-PERSIST-01 lock-path flushes write the revealed receive cursor to wallet secrets', async () => {
    await flushSdkPersistenceNow()
    await flushSdkPersistenceNow()

    const loaded = await loadSdkPersistenceJsonForConnection({
      password: PASSWORD,
      walletId: WALLET_ID,
      connectionId: CONNECTION_ID,
    })

    expect(readOffchainNextDerivationIndex(loaded)).toBe(2)
  })

  it('RCV-PERSIST-02 stale lower-index flush cannot regress a newer receive cursor', async () => {
    await saveSdkPersistenceJsonForConnection({
      password: PASSWORD,
      walletId: WALLET_ID,
      connectionId: CONNECTION_ID,
      sdkPersistenceJson: persistenceJsonWithReceiveIndex(2),
    })

    setArkadeSdkPersistenceExporter(async () => persistenceJsonWithReceiveIndex(1))
    await flushSdkPersistenceNow()

    const loaded = await loadSdkPersistenceJsonForConnection({
      password: PASSWORD,
      walletId: WALLET_ID,
      connectionId: CONNECTION_ID,
    })

    expect(readOffchainNextDerivationIndex(loaded)).toBe(2)
  })

  it('RCV-PERSIST-03 flushSdkPersistenceNow is a no-op when flush context is missing', async () => {
    setArkadeSdkPersistenceFlushContext(null)

    const flushed = await flushSdkPersistenceNow()

    expect(flushed).toBe(false)
    expect(payload.arkadeOperatorConnections[0].sdkPersistenceJson).toBeUndefined()
  })
})
