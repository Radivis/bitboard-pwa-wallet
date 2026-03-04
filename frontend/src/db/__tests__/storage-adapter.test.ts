import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { StateStorage } from 'zustand/middleware'
import type { Database } from '../schema'
import { createTestDatabase } from '../test-helpers'

function createStorageAdapter(db: Kysely<Database>): StateStorage {
  return {
    async getItem(key: string): Promise<string | null> {
      const row = await db
        .selectFrom('settings')
        .select('value')
        .where('key', '=', key)
        .executeTakeFirst()
      return row?.value ?? null
    },
    async setItem(key: string, value: string): Promise<void> {
      await db
        .insertInto('settings')
        .values({ key, value })
        .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
        .execute()
    },
    async removeItem(key: string): Promise<void> {
      await db
        .deleteFrom('settings')
        .where('key', '=', key)
        .execute()
    },
  }
}

describe('sqliteStorage adapter', () => {
  let db: Kysely<Database>
  let storage: StateStorage

  beforeEach(async () => {
    db = await createTestDatabase()
    storage = createStorageAdapter(db)
  })

  afterEach(async () => {
    await db.destroy()
  })

  it('returns null for a missing key', async () => {
    const result = await storage.getItem('non-existent')

    expect(result).toBeNull()
  })

  it('stores and retrieves a value', async () => {
    const stateJson = JSON.stringify({ state: { themeMode: 'dark' }, version: 0 })

    await storage.setItem('theme-storage', stateJson)
    const retrieved = await storage.getItem('theme-storage')

    expect(retrieved).toBe(stateJson)
  })

  it('overwrites an existing value', async () => {
    await storage.setItem('wallet-storage', '{"state":{"networkMode":"signet"}}')
    await storage.setItem('wallet-storage', '{"state":{"networkMode":"mainnet"}}')

    const retrieved = await storage.getItem('wallet-storage')

    expect(retrieved).toBe('{"state":{"networkMode":"mainnet"}}')
  })

  it('removes a stored value', async () => {
    await storage.setItem('temp-key', 'temp-value')

    await storage.removeItem('temp-key')
    const result = await storage.getItem('temp-key')

    expect(result).toBeNull()
  })

  it('handles removing a non-existent key without error', async () => {
    await expect(storage.removeItem('ghost-key')).resolves.toBeUndefined()
  })
})
