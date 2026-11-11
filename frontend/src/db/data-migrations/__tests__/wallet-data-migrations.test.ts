import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from '@/db/schema'
import { createTestDatabase } from '@/db/test-helpers'
import {
  beginWalletSecretsSession,
  endWalletSecretsSession,
} from '@/lib/wallet/wallet-secrets-session'

vi.mock('@/workers/encryption-factory', async () => {
  const { getMockEncryptionWorker } = await import('@/db/__tests__/mock-encryption-worker')
  return {
    getEncryptionWorker: () => getMockEncryptionWorker(),
  }
})

import { TEST_MNEMONIC_12 } from '@/test-utils/test-providers'
import { ARGON2_KDF_PHC_CI } from '@/lib/shared/kdf-phc-constants'
import {
  deleteWalletCompletely,
  getWalletSecretsEncryptedWithRevision,
  loadWalletSecretsPayload,
  persistNewWalletWithSecrets,
  saveWalletSecrets,
  updateWalletSecretsPayloadWithRetry,
  type WalletSecrets,
} from '@/db/wallet-persistence'
import {
  MUTINYNET_ARKADE_OPERATOR_URL_REPAIR_DATA_MIGRATION_NAME,
  SIGNET_MUTINYNET_CHAIN_REPAIR_DATA_MIGRATION_NAME,
  SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME,
} from '@/db/data-migrations/data-migration-names'
import { WALLET_DATA_MIGRATIONS } from '@/db/data-migrations/wallet-data-migration-registry'
import { runPendingWalletDataMigrations } from '@/db/data-migrations/run-pending-wallet-data-migrations'
import {
  recordAllWalletDataMigrationsApplied,
  recordWalletDataMigrationsApplied,
} from '@/db/data-migrations/wallet-data-migration-markers'
import {
  MUTINYNET_ESPLORA_SETTINGS_KEY,
  setConfiguredHistoricalSignetOnchainChain,
  SIGNET_ESPLORA_SETTINGS_KEY,
} from '@/lib/wallet/historical-signet-onchain-chain'
import { AddressType } from '@/lib/wallet/wallet-domain-types'
import {
  bdkChangesetJson,
  MUTINYNET_TIP_HEIGHT,
  PUBLIC_SIGNET_ANCHOR_HEIGHT,
  PUBLIC_SIGNET_TIP_HEIGHT,
} from '@/test-utils/bdk-changeset-json-fixtures'

const SESSION_PASSWORD = 'test-password-12345'

const publicSignetHistoryChangeset = bdkChangesetJson({
  blockHeights: [0, PUBLIC_SIGNET_ANCHOR_HEIGHT, PUBLIC_SIGNET_TIP_HEIGHT],
  anchorHeights: [PUBLIC_SIGNET_ANCHOR_HEIGHT],
})

const publicSignetAnchorsUnderMutinynetTipChangeset = bdkChangesetJson({
  blockHeights: [0, PUBLIC_SIGNET_ANCHOR_HEIGHT, MUTINYNET_TIP_HEIGHT],
  anchorHeights: [PUBLIC_SIGNET_ANCHOR_HEIGHT],
})

const HISTORICAL_SIGNET_OPERATOR_PROXY_URL = 'http://127.0.0.1:5173/api/arkade/operator/signet'
const MUTINYNET_OPERATOR_PROXY_URL = 'http://127.0.0.1:5173/api/arkade/operator/mutinynet'

const signetArkadeAccount = {
  id: 'acct-signet',
  label: 'Arkade',
  networkMode: 'signet' as const,
  operatorUrl: HISTORICAL_SIGNET_OPERATOR_PROXY_URL,
  operatorSignerPkHex: '02abc',
  createdAt: '2020-01-01T00:00:00.000Z',
}

function createSignetWalletSecrets(): WalletSecrets {
  return {
    mnemonic: TEST_MNEMONIC_12,
    descriptorWallets: [
      {
        network: 'signet',
        addressType: AddressType.Taproot,
        accountId: 0,
        externalDescriptor: 'tr(xpub.../0/*)',
        internalDescriptor: 'tr(xpub.../1/*)',
        changeSet: '{}',
        fullScanDone: false,
      },
    ],
    lightningNwcConnections: [],
    arkadeAccounts: [{ ...signetArkadeAccount }],
    activeArkadeAccountIdByNetwork: { signet: signetArkadeAccount.id },
    barkAccounts: [],
  }
}

function createTestnetWalletSecrets(): WalletSecrets {
  return {
    ...createSignetWalletSecrets(),
    descriptorWallets: [
      { ...createSignetWalletSecrets().descriptorWallets[0], network: 'testnet' },
    ],
    arkadeAccounts: [],
    activeArkadeAccountIdByNetwork: {},
  }
}

const dummyEncryptedBlob = {
  ciphertext: new Uint8Array(0),
  iv: new Uint8Array(12),
  salt: new Uint8Array(16),
  kdfPhc: ARGON2_KDF_PHC_CI,
}

async function insertWalletRow(walletDb: Kysely<Database>, name: string): Promise<number> {
  const insertResult = await walletDb
    .insertInto('wallets')
    .values({ name, created_at: new Date().toISOString() })
    .executeTakeFirstOrThrow()
  return Number(insertResult.insertId)
}

async function createWalletWithSecrets(
  walletDb: Kysely<Database>,
  name: string,
  secrets: WalletSecrets,
): Promise<number> {
  const walletId = await insertWalletRow(walletDb, name)
  await saveWalletSecrets({ walletDb, walletId, secrets })
  return walletId
}

async function listMarkerNames(
  walletDb: Kysely<Database>,
  walletId: number,
): Promise<string[]> {
  const markerRows = await walletDb
    .selectFrom('wallet_data_migrations')
    .select('migration_name')
    .where('wallet_id', '=', walletId)
    .orderBy('migration_name')
    .execute()
  return markerRows.map((markerRow) => markerRow.migration_name)
}

async function readRevision(walletDb: Kysely<Database>, walletId: number): Promise<number> {
  return (await getWalletSecretsEncryptedWithRevision(walletDb, walletId)).revision
}

const ALL_WALLET_MIGRATION_NAMES = WALLET_DATA_MIGRATIONS.map((migration) => migration.name).sort()

describe('wallet data migrations', () => {
  let walletDb: Kysely<Database>

  beforeEach(async () => {
    walletDb = await createTestDatabase()
    await beginWalletSecretsSession(SESSION_PASSWORD)
  })

  afterEach(async () => {
    setConfiguredHistoricalSignetOnchainChain(null)
    await endWalletSecretsSession()
    await walletDb.destroy()
  })

  describe('runPendingWalletDataMigrations', () => {
    it('writes a marker for every wallet even when nothing changed and bumps the revision', async () => {
      const signetWalletId = await createWalletWithSecrets(
        walletDb,
        'Signet wallet',
        createSignetWalletSecrets(),
      )
      const testnetWalletId = await createWalletWithSecrets(
        walletDb,
        'Testnet wallet',
        createTestnetWalletSecrets(),
      )
      const testnetRevisionBefore = await readRevision(walletDb, testnetWalletId)

      await runPendingWalletDataMigrations(walletDb)

      expect(await listMarkerNames(walletDb, signetWalletId)).toEqual(ALL_WALLET_MIGRATION_NAMES)
      expect(await listMarkerNames(walletDb, testnetWalletId)).toEqual(ALL_WALLET_MIGRATION_NAMES)
      expect(await readRevision(walletDb, testnetWalletId)).toBe(testnetRevisionBefore + 1)
      const testnetPayload = await loadWalletSecretsPayload(walletDb, testnetWalletId)
      expect(testnetPayload.descriptorWallets[0].network).toBe('testnet')
    })

    it('rewrites historical signet rows using the device classification', async () => {
      await walletDb
        .insertInto('settings')
        .values({ key: SIGNET_ESPLORA_SETTINGS_KEY, value: 'https://mutinynet.com/api' })
        .execute()
      const walletId = await createWalletWithSecrets(
        walletDb,
        'Signet wallet',
        createSignetWalletSecrets(),
      )

      await runPendingWalletDataMigrations(walletDb)

      const migratedPayload = await loadWalletSecretsPayload(walletDb, walletId)
      expect(migratedPayload.descriptorWallets[0].network).toBe('mutinynet')
      expect(migratedPayload.arkadeAccounts[0].networkMode).toBe('mutinynet')
      expect(migratedPayload.arkadeAccounts[0].operatorUrl).toBe(MUTINYNET_OPERATOR_PROXY_URL)
      expect(migratedPayload.activeArkadeAccountIdByNetwork).toEqual({
        mutinynet: signetArkadeAccount.id,
      })
      const mutinynetUrlRow = await walletDb
        .selectFrom('settings')
        .select('value')
        .where('key', '=', MUTINYNET_ESPLORA_SETTINGS_KEY)
        .executeTakeFirst()
      expect(mutinynetUrlRow?.value).toBe('https://mutinynet.com/api')
    })

    it('skips wallets that already have the marker', async () => {
      const walletId = await createWalletWithSecrets(
        walletDb,
        'Signet wallet',
        createSignetWalletSecrets(),
      )
      await runPendingWalletDataMigrations(walletDb)
      await updateWalletSecretsPayloadWithRetry({
        walletDb,
        walletId,
        transform: (payload) => ({
          ...payload,
          arkadeAccounts: [
            ...payload.arkadeAccounts,
            { ...signetArkadeAccount, id: 'acct-public-signet' },
          ],
        }),
      })
      const revisionBeforeSecondRun = await readRevision(walletDb, walletId)

      await runPendingWalletDataMigrations(walletDb)

      const payload = await loadWalletSecretsPayload(walletDb, walletId)
      const publicSignetAccount = payload.arkadeAccounts.find(
        (account) => account.id === 'acct-public-signet',
      )
      expect(publicSignetAccount?.networkMode).toBe('signet')
      expect(publicSignetAccount?.operatorUrl).toBe(HISTORICAL_SIGNET_OPERATOR_PROXY_URL)
      expect(await readRevision(walletDb, walletId)).toBe(revisionBeforeSecondRun)
    })

    it('rewrites a v0.3.6 Mutinynet account that still uses the Signet operator proxy', async () => {
      const walletId = await createWalletWithSecrets(walletDb, 'Upgraded wallet', {
        ...createSignetWalletSecrets(),
        descriptorWallets: [
          { ...createSignetWalletSecrets().descriptorWallets[0], network: 'mutinynet' },
        ],
        arkadeAccounts: [{ ...signetArkadeAccount, networkMode: 'mutinynet' }],
        activeArkadeAccountIdByNetwork: { mutinynet: signetArkadeAccount.id },
      })
      await recordWalletDataMigrationsApplied(walletDb, walletId, [
        SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME,
      ])

      await runPendingWalletDataMigrations(walletDb)

      const migratedPayload = await loadWalletSecretsPayload(walletDb, walletId)
      expect(migratedPayload.arkadeAccounts[0].networkMode).toBe('mutinynet')
      expect(migratedPayload.arkadeAccounts[0].operatorUrl).toBe(MUTINYNET_OPERATOR_PROXY_URL)
      expect(await listMarkerNames(walletDb, walletId)).toEqual(ALL_WALLET_MIGRATION_NAMES)
      expect(await listMarkerNames(walletDb, walletId)).toContain(
        MUTINYNET_ARKADE_OPERATOR_URL_REPAIR_DATA_MIGRATION_NAME,
      )
    })

    it('keeps a public Signet row on signet when the device classified public Signet', async () => {
      await walletDb
        .insertInto('settings')
        .values({ key: SIGNET_ESPLORA_SETTINGS_KEY, value: 'https://mempool.space/signet/api' })
        .execute()
      const publicSignetSecrets = createSignetWalletSecrets()
      publicSignetSecrets.descriptorWallets[0].changeSet = publicSignetHistoryChangeset
      const walletId = await createWalletWithSecrets(walletDb, 'Signet wallet', publicSignetSecrets)

      await runPendingWalletDataMigrations(walletDb)

      const migratedPayload = await loadWalletSecretsPayload(walletDb, walletId)
      expect(migratedPayload.descriptorWallets).toHaveLength(1)
      expect(migratedPayload.descriptorWallets[0].network).toBe('signet')
      expect(migratedPayload.descriptorWallets[0].changeSet).toBe(publicSignetHistoryChangeset)
    })

    it('drops a public Signet row that the split moved to mutinynet in the same pass', async () => {
      const publicSignetSecrets = createSignetWalletSecrets()
      publicSignetSecrets.descriptorWallets[0].changeSet = publicSignetHistoryChangeset
      const walletId = await createWalletWithSecrets(walletDb, 'Signet wallet', publicSignetSecrets)

      await runPendingWalletDataMigrations(walletDb)

      const migratedPayload = await loadWalletSecretsPayload(walletDb, walletId)
      expect(migratedPayload.descriptorWallets).toEqual([])
      expect(migratedPayload.arkadeAccounts[0].networkMode).toBe('mutinynet')
    })

    it('drops a v0.3.6 mutinynet row whose public Signet anchors sit under a Mutinynet tip', async () => {
      const walletId = await createWalletWithSecrets(walletDb, 'Upgraded wallet', {
        ...createSignetWalletSecrets(),
        descriptorWallets: [
          {
            ...createSignetWalletSecrets().descriptorWallets[0],
            network: 'mutinynet',
            changeSet: publicSignetAnchorsUnderMutinynetTipChangeset,
            fullScanDone: true,
          },
        ],
        arkadeAccounts: [{ ...signetArkadeAccount, networkMode: 'mutinynet' }],
        activeArkadeAccountIdByNetwork: { mutinynet: signetArkadeAccount.id },
      })
      await recordWalletDataMigrationsApplied(walletDb, walletId, [
        SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME,
        MUTINYNET_ARKADE_OPERATOR_URL_REPAIR_DATA_MIGRATION_NAME,
      ])

      await runPendingWalletDataMigrations(walletDb)

      const migratedPayload = await loadWalletSecretsPayload(walletDb, walletId)
      expect(migratedPayload.descriptorWallets).toEqual([])
      expect(migratedPayload.arkadeAccounts[0].networkMode).toBe('mutinynet')
      expect(await listMarkerNames(walletDb, walletId)).toContain(
        SIGNET_MUTINYNET_CHAIN_REPAIR_DATA_MIGRATION_NAME,
      )
    })

    it('keeps payload and revision unchanged when the marker insert fails', async () => {
      const walletId = await createWalletWithSecrets(
        walletDb,
        'Signet wallet',
        createSignetWalletSecrets(),
      )
      const revisionBefore = await readRevision(walletDb, walletId)
      await sql`
        CREATE TRIGGER reject_wallet_data_migration_marker
        BEFORE INSERT ON wallet_data_migrations
        BEGIN SELECT RAISE(ABORT, 'marker insert failed'); END
      `.execute(walletDb)

      await expect(runPendingWalletDataMigrations(walletDb)).rejects.toThrow(
        'marker insert failed',
      )

      expect(await readRevision(walletDb, walletId)).toBe(revisionBefore)
      const payload = await loadWalletSecretsPayload(walletDb, walletId)
      expect(payload.arkadeAccounts[0].networkMode).toBe('signet')
      expect(await listMarkerNames(walletDb, walletId)).toEqual([])
    })
  })

  describe('persistNewWalletWithSecrets', () => {
    it('records all wallet data migration markers', async () => {
      const walletId = await persistNewWalletWithSecrets({
        walletDb,
        insertWalletRow: () => insertWalletRow(walletDb, 'New wallet'),
        encryptedBlobs: { payload: dummyEncryptedBlob, mnemonic: dummyEncryptedBlob },
      })

      expect(await listMarkerNames(walletDb, walletId)).toEqual(ALL_WALLET_MIGRATION_NAMES)
      expect(ALL_WALLET_MIGRATION_NAMES).toContain(SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME)
      expect(ALL_WALLET_MIGRATION_NAMES).toContain(
        SIGNET_MUTINYNET_CHAIN_REPAIR_DATA_MIGRATION_NAME,
      )
    })

    it('rolls back wallet, secrets and markers when the marker insert fails', async () => {
      await sql`
        CREATE TRIGGER reject_wallet_data_migration_marker
        BEFORE INSERT ON wallet_data_migrations
        BEGIN SELECT RAISE(ABORT, 'marker insert failed'); END
      `.execute(walletDb)

      await expect(
        persistNewWalletWithSecrets({
          walletDb,
          insertWalletRow: () => insertWalletRow(walletDb, 'New wallet'),
          encryptedBlobs: { payload: dummyEncryptedBlob, mnemonic: dummyEncryptedBlob },
        }),
      ).rejects.toThrow('marker insert failed')

      expect(await walletDb.selectFrom('wallets').selectAll().execute()).toEqual([])
      expect(await walletDb.selectFrom('wallet_secrets').selectAll().execute()).toEqual([])
      expect(await walletDb.selectFrom('wallet_data_migrations').selectAll().execute()).toEqual(
        [],
      )
    })
  })

  describe('deleteWalletCompletely', () => {
    it('removes wallet data migration markers', async () => {
      const walletId = await createWalletWithSecrets(
        walletDb,
        'Doomed wallet',
        createTestnetWalletSecrets(),
      )
      await recordAllWalletDataMigrationsApplied(walletDb, walletId)

      await deleteWalletCompletely(walletDb, walletId)

      expect(await listMarkerNames(walletDb, walletId)).toEqual([])
    })
  })
})
