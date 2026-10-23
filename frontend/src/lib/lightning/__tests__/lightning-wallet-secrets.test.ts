import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '@/db/schema'
import { createTestDatabase } from '@/db/test-helpers'
import {
  saveWalletSecrets,
  loadWalletSecretsPayload,
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'
import { beginWalletSecretsSession, endWalletSecretsSession } from '@/lib/wallet/wallet-secrets-session'
import {
  connectedWalletToStored,
  loadLightningConnectionsForWallet,
  updateLightningConnectionsForWallet,
} from '@/lib/lightning/lightning-wallet-secrets'
import type { WalletSecrets } from '@/db/wallet-persistence'
import type { ConnectedLightningWallet } from '@/lib/lightning/lightning-backend-service'
import { TEST_MNEMONIC_12 } from '@/test-utils/test-providers'

vi.mock('@/workers/encryption-factory', async () => {
  const { getMockEncryptionWorker } = await import('@/db/__tests__/mock-encryption-worker')
  return {
    getEncryptionWorker: () => getMockEncryptionWorker(),
  }
})

let testDb: Kysely<Database>

vi.mock('@/db/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/database')>()
  return {
    ...actual,
    getDatabase: () => testDb,
  }
})

describe('lightning-wallet-secrets persistence', () => {
  const password = 'test-password'
  let walletId: number

  const baseSecrets: WalletSecrets = {
    mnemonic: TEST_MNEMONIC_12,
    descriptorWallets: [
      {
        network: 'signet',
        addressType: 'taproot',
        accountId: 0,
        externalDescriptor: 'tr(xpub.../0/*)',
        internalDescriptor: 'tr(xpub.../1/*)',
        changeSet: '{}',
        fullScanDone: false,
      },
    ],
    lightningNwcConnections: [
      {
        id: 'conn-1',
        label: 'Conn 1',
        networkMode: 'signet',
        connectionString:
          'nostr+walletconnect://0000000000000000000000000000000000000000000000000000000000000000?relay=wss%3A%2F%2Frelay.example.com',
        createdAt: '2020-01-01T00:00:00.000Z',
        nwcSnapshot: {
          balanceSats: 100,
          balanceUpdatedAt: '2020-01-02T00:00:00.000Z',
          payments: [],
          paymentsUpdatedAt: '2020-01-02T00:00:00.000Z',
        },
      },
    ],
    arkadeAccounts: [],
    activeArkadeAccountIdByNetwork: {},
    barkAccounts: [],
  }

  beforeEach(async () => {
    testDb = await createTestDatabase()
    await beginWalletSecretsSession(password)
    const result = await testDb
      .insertInto('wallets')
      .values({ name: 'Test Wallet', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    walletId = Number(result.insertId)
    await saveWalletSecrets({
      walletDb: testDb,
      walletId,
      secrets: baseSecrets,
    })
  })

  afterEach(async () => {
    await endWalletSecretsSession()
    await testDb.destroy()
  })

  function secondConnection(): ConnectedLightningWallet {
    return {
      id: 'conn-2',
      walletId,
      label: 'Conn 2',
      networkMode: 'signet',
      config: {
        type: 'nwc',
        connectionString:
          'nostr+walletconnect://1111111111111111111111111111111111111111111111111111111111111111?relay=wss%3A%2F%2Frelay.example.com',
      },
      createdAt: '2020-01-03T00:00:00.000Z',
    }
  }

  function renameConnection(connectionId: string, label: string) {
    return (storedConnections: ConnectedLightningWallet[]) =>
      storedConnections.map((connection) =>
        connection.id === connectionId ? { ...connection, label } : connection,
      )
  }

  it('preserves existing snapshots when updating the connection list', async () => {
    await updateLightningConnectionsForWallet({
      walletId,
      updateConnections: (storedConnections) => [
        ...renameConnection('conn-1', 'Conn 1 renamed')(storedConnections),
        secondConnection(),
      ],
    })

    const payload = await loadWalletSecretsPayload(testDb, walletId)
    expect(payload.descriptorWallets).toEqual(baseSecrets.descriptorWallets)
    expect(payload.lightningNwcConnections).toHaveLength(2)
    const preserved = payload.lightningNwcConnections.find((c) => c.id === 'conn-1')
    expect(preserved?.label).toBe('Conn 1 renamed')
    expect(preserved?.nwcSnapshot?.balanceSats).toBe(100)
  })

  it('removes connections without touching descriptor payload', async () => {
    await updateLightningConnectionsForWallet({
      walletId,
      updateConnections: () => [],
    })

    const payload = await loadWalletSecretsPayload(testDb, walletId)
    expect(payload.lightningNwcConnections).toEqual([])
    expect(payload.descriptorWallets).toEqual(baseSecrets.descriptorWallets)
  })

  it('keeps a connection another writer added after the caller read the list', async () => {
    const readBeforeOtherWriter = await loadLightningConnectionsForWallet({ walletId })
    expect(readBeforeOtherWriter.map((connection) => connection.id)).toEqual(['conn-1'])
    await updateWalletSecretsPayloadWithRetry({
      walletDb: testDb,
      walletId,
      transform: (payload) => ({
        ...payload,
        lightningNwcConnections: [
          ...payload.lightningNwcConnections,
          connectedWalletToStored(secondConnection()),
        ],
      }),
    })

    await updateLightningConnectionsForWallet({
      walletId,
      updateConnections: renameConnection('conn-1', 'Conn 1 renamed'),
    })

    const payload = await loadWalletSecretsPayload(testDb, walletId)
    expect(payload.lightningNwcConnections.map((connection) => connection.id)).toEqual([
      'conn-1',
      'conn-2',
    ])
    expect(payload.lightningNwcConnections[0]?.label).toBe('Conn 1 renamed')
  })

  it('returns the connection list it wrote', async () => {
    const written = await updateLightningConnectionsForWallet({
      walletId,
      updateConnections: (storedConnections) => [...storedConnections, secondConnection()],
    })

    expect(written.map((connection) => connection.id)).toEqual(['conn-1', 'conn-2'])
    expect(written.every((connection) => connection.walletId === walletId)).toBe(true)
  })
})
