import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertSdkPersistenceJsonWithinSizeLimit,
  mergeSdkPersistenceJsonMonotonic,
  readOffchainNextDerivationIndex,
  saveLastSuccessfulOperatorSyncAtForConnection,
  saveSdkPersistenceJsonForConnection,
} from '@/lib/arkade/arkade-sdk-persistence'
import { ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES } from '@/lib/arkade/arkade-sdk-persistence-types'
import {
  loadWalletSecretsPayload,
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'

vi.mock('@/db/database', () => ({
  getDatabase: vi.fn(() => ({})),
}))

vi.mock('@/db/wallet-persistence', () => ({
  loadWalletSecretsPayload: vi.fn(),
  updateWalletSecretsPayloadWithRetry: vi.fn(),
}))

function persistenceJsonWithReceiveIndex(index: number): string {
  return JSON.stringify({
    version: 3,
    wallet_db: { offchain_next_derivation_index: index },
  })
}

describe('arkade-sdk-persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateWalletSecretsPayloadWithRetry).mockImplementation(
      async ({ transform }) => {
        const payload = await vi.mocked(loadWalletSecretsPayload).mock.results.at(-1)!
          .value
        await transform(payload)
      },
    )
    vi.mocked(loadWalletSecretsPayload).mockResolvedValue({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeOperatorConnections: [
        {
          id: 'conn-1',
          label: 'Mutinynet',
          networkMode: 'signet',
          operatorUrl: 'https://signet.arkade.example/v1',
          operatorSignerPkHex: '02abc',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      activeArkadeConnectionIdByNetwork: { signet: 'conn-1' },
    })
  })

  it('rejects persistence JSON over size limit', () => {
    const oversized = 'x'.repeat(ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES + 1)
    expect(() => assertSdkPersistenceJsonWithinSizeLimit(oversized)).toThrow(/exceeds/)
  })

  it('readOffchainNextDerivationIndex reads wallet_db scalar', () => {
    expect(readOffchainNextDerivationIndex(persistenceJsonWithReceiveIndex(2))).toBe(2)
    expect(readOffchainNextDerivationIndex(undefined)).toBe(0)
  })

  it('mergeSdkPersistenceJsonMonotonic keeps the higher receive cursor', () => {
    const indexOne = persistenceJsonWithReceiveIndex(1)
    const indexTwo = persistenceJsonWithReceiveIndex(2)

    expect(mergeSdkPersistenceJsonMonotonic(indexOne, indexTwo)).toBe(indexTwo)
    expect(mergeSdkPersistenceJsonMonotonic(indexTwo, indexOne)).toBe(indexTwo)
  })

  it('saveLastSuccessfulOperatorSyncAtForConnection updates sync timestamp only', async () => {
    const existingJson = persistenceJsonWithReceiveIndex(2)
    vi.mocked(loadWalletSecretsPayload).mockResolvedValue({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeOperatorConnections: [
        {
          id: 'conn-1',
          label: 'Mutinynet',
          networkMode: 'signet',
          operatorUrl: 'https://signet.arkade.example/v1',
          operatorSignerPkHex: '02abc',
          createdAt: '2020-01-01T00:00:00.000Z',
          sdkPersistenceJson: existingJson,
          lastSuccessfulOperatorSyncAt: '2020-01-02T00:00:00.000Z',
        },
      ],
      activeArkadeConnectionIdByNetwork: { signet: 'conn-1' },
    })

    let savedPayload: WalletSecretsPayload | undefined
    vi.mocked(updateWalletSecretsPayloadWithRetry).mockImplementation(
      async ({ transform }) => {
        const payload = await vi.mocked(loadWalletSecretsPayload).mock.results.at(-1)!
          .value
        savedPayload = await transform(payload)
      },
    )

    await saveLastSuccessfulOperatorSyncAtForConnection({
      password: 'pw',
      walletId: 2,
      connectionId: 'conn-1',
      lastSuccessfulOperatorSyncAt: '2020-01-03T00:00:00.000Z',
    })

    expect(savedPayload!.arkadeOperatorConnections[0].sdkPersistenceJson).toBe(existingJson)
    expect(savedPayload!.arkadeOperatorConnections[0].lastSuccessfulOperatorSyncAt).toBe(
      '2020-01-03T00:00:00.000Z',
    )
  })

  it('merges sdkPersistenceJson into active operator connection via CAS', async () => {
    const sdkPersistenceJson = JSON.stringify({ version: 3, wallet_db: {} })
    let savedPayload: WalletSecretsPayload | undefined
    vi.mocked(updateWalletSecretsPayloadWithRetry).mockImplementation(
      async ({ transform }) => {
        const payload = await vi.mocked(loadWalletSecretsPayload).mock.results.at(-1)!
          .value
        savedPayload = await transform(payload)
      },
    )

    await saveSdkPersistenceJsonForConnection({
      password: 'pw',
      walletId: 2,
      connectionId: 'conn-1',
      sdkPersistenceJson,
      lastSuccessfulOperatorSyncAt: '2020-01-02T00:00:00.000Z',
    })

    expect(updateWalletSecretsPayloadWithRetry).toHaveBeenCalledTimes(1)
    expect(savedPayload!.arkadeOperatorConnections).toHaveLength(1)
    expect(savedPayload!.arkadeOperatorConnections[0].sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(savedPayload!.arkadeOperatorConnections[0].lastSuccessfulOperatorSyncAt).toBe(
      '2020-01-02T00:00:00.000Z',
    )
  })

  it('saveSdkPersistenceJsonForConnection keeps higher receive cursor on concurrent writes', async () => {
    const existingJson = persistenceJsonWithReceiveIndex(2)
    const staleIncomingJson = persistenceJsonWithReceiveIndex(1)
    vi.mocked(loadWalletSecretsPayload).mockResolvedValue({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeOperatorConnections: [
        {
          id: 'conn-1',
          label: 'Mutinynet',
          networkMode: 'signet',
          operatorUrl: 'https://signet.arkade.example/v1',
          operatorSignerPkHex: '02abc',
          createdAt: '2020-01-01T00:00:00.000Z',
          sdkPersistenceJson: existingJson,
        },
      ],
      activeArkadeConnectionIdByNetwork: { signet: 'conn-1' },
    })

    let savedPayload: WalletSecretsPayload | undefined
    vi.mocked(updateWalletSecretsPayloadWithRetry).mockImplementation(
      async ({ transform }) => {
        const payload = await vi.mocked(loadWalletSecretsPayload).mock.results.at(-1)!
          .value
        savedPayload = await transform(payload)
      },
    )

    await saveSdkPersistenceJsonForConnection({
      password: 'pw',
      walletId: 2,
      connectionId: 'conn-1',
      sdkPersistenceJson: staleIncomingJson,
    })

    expect(savedPayload!.arkadeOperatorConnections[0].sdkPersistenceJson).toBe(existingJson)
  })
})
