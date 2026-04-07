import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '@/db/schema'
import { createTestDatabase } from '@/db/test-helpers'
import { saveWalletSecrets, loadWalletSecretsPayload } from '@/db/wallet-persistence'
import { saveLightningConnectionsForWallet } from '@/lib/lightning-wallet-secrets'
import type { WalletSecrets } from '@/db/wallet-persistence'
import type { ConnectedLightningWallet } from '@/lib/lightning-backend-service'
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
  }

  beforeEach(async () => {
    testDb = await createTestDatabase()
    const result = await testDb
      .insertInto('wallets')
      .values({ name: 'Test Wallet', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    walletId = Number(result.insertId)
    await saveWalletSecrets({
      walletDb: testDb,
      password,
      walletId,
      secrets: baseSecrets,
    })
  })

  afterEach(async () => {
    await testDb.destroy()
  })

  it('preserves existing snapshots when saving updated connection list', async () => {
    const nextConnections: ConnectedLightningWallet[] = [
      {
        id: 'conn-1',
        walletId,
        label: 'Conn 1 renamed',
        networkMode: 'signet',
        config: {
          type: 'nwc',
          connectionString:
            'nostr+walletconnect://0000000000000000000000000000000000000000000000000000000000000000?relay=wss%3A%2F%2Frelay.example.com',
        },
        createdAt: '2020-01-01T00:00:00.000Z',
      },
      {
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
      },
    ]

    await saveLightningConnectionsForWallet({
      password,
      walletId,
      connections: nextConnections,
    })

    const payload = await loadWalletSecretsPayload(testDb, password, walletId)
    expect(payload.descriptorWallets).toEqual(baseSecrets.descriptorWallets)
    expect(payload.lightningNwcConnections).toHaveLength(2)
    const preserved = payload.lightningNwcConnections.find((c) => c.id === 'conn-1')
    expect(preserved?.nwcSnapshot?.balanceSats).toBe(100)
  })

  it('removes connections without touching descriptor payload', async () => {
    await saveLightningConnectionsForWallet({
      password,
      walletId,
      connections: [],
    })

    const payload = await loadWalletSecretsPayload(testDb, password, walletId)
    expect(payload.lightningNwcConnections).toEqual([])
    expect(payload.descriptorWallets).toEqual(baseSecrets.descriptorWallets)
  })
})
