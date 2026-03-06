import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../schema'
import { createTestDatabase } from '../test-helpers'

describe('SQLite Database', () => {
  let db: Kysely<Database>

  beforeEach(async () => {
    db = await createTestDatabase()
  })

  afterEach(async () => {
    await db.destroy()
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
      const result = await db
        .insertInto('wallets')
        .values(createWalletValues())
        .executeTakeFirstOrThrow()
      const id = Number(result.insertId)

      const retrieved = await db
        .selectFrom('wallets')
        .selectAll()
        .where('wallet_id', '=', id)
        .executeTakeFirst()

      expect(retrieved).toBeDefined()
      expect(retrieved!.name).toBe('My Test Wallet')
    })

    it('lists all wallets', async () => {
      await db.insertInto('wallets').values(createWalletValues({ name: 'First Wallet' })).execute()
      await db.insertInto('wallets').values(createWalletValues({ name: 'Second Wallet' })).execute()

      const all = await db.selectFrom('wallets').selectAll().execute()

      expect(all).toHaveLength(2)
    })

    it('updates a wallet', async () => {
      const result = await db
        .insertInto('wallets')
        .values(createWalletValues())
        .executeTakeFirstOrThrow()
      const id = Number(result.insertId)

      await db.updateTable('wallets').set({ name: 'Renamed Wallet' }).where('wallet_id', '=', id).execute()
      const updated = await db.selectFrom('wallets').selectAll().where('wallet_id', '=', id).executeTakeFirst()

      expect(updated!.name).toBe('Renamed Wallet')
    })

    it('deletes a wallet', async () => {
      const result = await db
        .insertInto('wallets')
        .values(createWalletValues())
        .executeTakeFirstOrThrow()
      const id = Number(result.insertId)

      await db.deleteFrom('wallets').where('wallet_id', '=', id).execute()
      const deleted = await db.selectFrom('wallets').selectAll().where('wallet_id', '=', id).executeTakeFirst()

      expect(deleted).toBeUndefined()
    })
  })

  describe('settings table', () => {
    it('stores and retrieves a setting by key', async () => {
      await db.insertInto('settings').values({ key: 'theme-storage', value: '{"themeMode":"dark"}' }).execute()

      const setting = await db.selectFrom('settings').selectAll().where('key', '=', 'theme-storage').executeTakeFirst()

      expect(setting).toBeDefined()
      expect(setting!.value).toBe('{"themeMode":"dark"}')
    })

    it('upserts a setting with onConflict', async () => {
      await db.insertInto('settings').values({ key: 'app-version', value: '0.1.0' }).execute()
      await db
        .insertInto('settings')
        .values({ key: 'app-version', value: '0.2.0' })
        .onConflict((oc) => oc.column('key').doUpdateSet({ value: '0.2.0' }))
        .execute()

      const setting = await db.selectFrom('settings').selectAll().where('key', '=', 'app-version').executeTakeFirst()

      expect(setting!.value).toBe('0.2.0')
    })

    it('deletes a setting', async () => {
      await db.insertInto('settings').values({ key: 'temp-key', value: 'temp-value' }).execute()

      await db.deleteFrom('settings').where('key', '=', 'temp-key').execute()
      const deleted = await db.selectFrom('settings').selectAll().where('key', '=', 'temp-key').executeTakeFirst()

      expect(deleted).toBeUndefined()
    })

    it('returns undefined for a non-existent key', async () => {
      const missing = await db.selectFrom('settings').selectAll().where('key', '=', 'does-not-exist').executeTakeFirst()

      expect(missing).toBeUndefined()
    })
  })
})
