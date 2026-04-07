import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../schema'
import { APP_SETTINGS_LAST_OPENED_AT_KEY } from '@/lib/app-session-metadata'
import { createTestDatabase } from '../test-helpers'

describe('SQLite Database', () => {
  let walletDb: Kysely<Database>

  beforeEach(async () => {
    walletDb = await createTestDatabase()
  })

  afterEach(async () => {
    await walletDb.destroy()
  })

  describe('wallets table', () => {
    function createWalletValues(overrides: Partial<{ name: string; created_at: string }> = {}) {
      return {
        name: 'My Test Wallet',
        created_at: new Date().toISOString(),
        ...overrides,
      }
    }

    it('adds a wallet and retrieves it by wallet_id', async () => {
      const result = await walletDb
        .insertInto('wallets')
        .values(createWalletValues())
        .executeTakeFirstOrThrow()
      const id = Number(result.insertId)

      const retrieved = await walletDb
        .selectFrom('wallets')
        .selectAll()
        .where('wallet_id', '=', id)
        .executeTakeFirst()

      expect(retrieved).toBeDefined()
      expect(retrieved!.name).toBe('My Test Wallet')
    })

    it('lists all wallets', async () => {
      await walletDb.insertInto('wallets').values(createWalletValues({ name: 'First Wallet' })).execute()
      await walletDb.insertInto('wallets').values(createWalletValues({ name: 'Second Wallet' })).execute()

      const all = await walletDb.selectFrom('wallets').selectAll().execute()

      expect(all).toHaveLength(2)
    })

    it('updates a wallet', async () => {
      const result = await walletDb
        .insertInto('wallets')
        .values(createWalletValues())
        .executeTakeFirstOrThrow()
      const id = Number(result.insertId)

      await walletDb.updateTable('wallets').set({ name: 'Renamed Wallet' }).where('wallet_id', '=', id).execute()
      const updated = await walletDb.selectFrom('wallets').selectAll().where('wallet_id', '=', id).executeTakeFirst()

      expect(updated!.name).toBe('Renamed Wallet')
    })

    it('deletes a wallet', async () => {
      const result = await walletDb
        .insertInto('wallets')
        .values(createWalletValues())
        .executeTakeFirstOrThrow()
      const id = Number(result.insertId)

      await walletDb.deleteFrom('wallets').where('wallet_id', '=', id).execute()
      const deleted = await walletDb.selectFrom('wallets').selectAll().where('wallet_id', '=', id).executeTakeFirst()

      expect(deleted).toBeUndefined()
    })

    it('transaction rolls back both inserts when callback throws', async () => {
      const now = new Date().toISOString()
      try {
        await walletDb.transaction().execute(async (trx) => {
          const result = await trx
            .insertInto('wallets')
            .values({ name: 'Rollback Wallet', created_at: now })
            .executeTakeFirstOrThrow()
          const walletId = Number(result.insertId)
          await trx.insertInto('wallet_secrets').values({
            wallet_id: walletId,
            revision: 0,
            encrypted_data: new Uint8Array(0),
            iv: new Uint8Array(12),
            salt: new Uint8Array(16),
            kdf_version: 1,
            mnemonic_encrypted_data: new Uint8Array(0),
            mnemonic_iv: new Uint8Array(12),
            mnemonic_salt: new Uint8Array(16),
            mnemonic_kdf_version: 1,
            created_at: now,
            updated_at: now,
          }).execute()
          throw new Error('rollback')
        })
      } catch (e) {
        expect((e as Error).message).toBe('rollback')
      }
      const wallets = await walletDb.selectFrom('wallets').selectAll().execute()
      const secrets = await walletDb.selectFrom('wallet_secrets').selectAll().execute()
      expect(wallets).toHaveLength(0)
      expect(secrets).toHaveLength(0)
    })
  })

  describe('settings table', () => {
    it('stores and retrieves a setting by key', async () => {
      await walletDb.insertInto('settings').values({ key: 'theme-storage', value: '{"themeMode":"dark"}' }).execute()

      const setting = await walletDb.selectFrom('settings').selectAll().where('key', '=', 'theme-storage').executeTakeFirst()

      expect(setting).toBeDefined()
      expect(setting!.value).toBe('{"themeMode":"dark"}')
    })

    it('upserts a setting with onConflict', async () => {
      await walletDb.insertInto('settings').values({ key: 'app-version', value: '0.1.0' }).execute()
      await walletDb
        .insertInto('settings')
        .values({ key: 'app-version', value: '0.2.0' })
        .onConflict((oc) => oc.column('key').doUpdateSet({ value: '0.2.0' }))
        .execute()

      const setting = await walletDb.selectFrom('settings').selectAll().where('key', '=', 'app-version').executeTakeFirst()

      expect(setting!.value).toBe('0.2.0')
    })

    it('deletes a setting', async () => {
      await walletDb.insertInto('settings').values({ key: 'temp-key', value: 'temp-value' }).execute()

      await walletDb.deleteFrom('settings').where('key', '=', 'temp-key').execute()
      const deleted = await walletDb.selectFrom('settings').selectAll().where('key', '=', 'temp-key').executeTakeFirst()

      expect(deleted).toBeUndefined()
    })

    it('returns undefined for a non-existent key', async () => {
      const missing = await walletDb.selectFrom('settings').selectAll().where('key', '=', 'does-not-exist').executeTakeFirst()

      expect(missing).toBeUndefined()
    })

    it('stores and upserts app_last_opened_at like production metadata', async () => {
      const first = '2024-01-01T00:00:00.000Z'
      const second = '2025-06-01T12:30:00.000Z'

      await walletDb
        .insertInto('settings')
        .values({ key: APP_SETTINGS_LAST_OPENED_AT_KEY, value: first })
        .execute()

      let row = await walletDb
        .selectFrom('settings')
        .select('value')
        .where('key', '=', APP_SETTINGS_LAST_OPENED_AT_KEY)
        .executeTakeFirst()
      expect(row?.value).toBe(first)

      await walletDb
        .insertInto('settings')
        .values({ key: APP_SETTINGS_LAST_OPENED_AT_KEY, value: second })
        .onConflict((oc) => oc.column('key').doUpdateSet({ value: second }))
        .execute()

      row = await walletDb
        .selectFrom('settings')
        .select('value')
        .where('key', '=', APP_SETTINGS_LAST_OPENED_AT_KEY)
        .executeTakeFirst()
      expect(row?.value).toBe(second)
    })
  })
})
