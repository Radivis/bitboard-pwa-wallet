import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { BitboardDatabase } from '../database'
import type { StateStorage } from 'zustand/middleware'

/**
 * Creates a storage adapter backed by the given database instance,
 * mirroring the production indexedDbStorage implementation.
 */
function createStorageAdapter(db: BitboardDatabase): StateStorage {
  return {
    async getItem(key: string): Promise<string | null> {
      const setting = await db.settings.get(key)
      return setting?.value ?? null
    },
    async setItem(key: string, value: string): Promise<void> {
      await db.settings.put({ key, value })
    },
    async removeItem(key: string): Promise<void> {
      await db.settings.delete(key)
    },
  }
}

describe('indexedDbStorage adapter', () => {
  const db = new BitboardDatabase()
  let storage: StateStorage

  beforeEach(async () => {
    await db.settings.clear()
    storage = createStorageAdapter(db)
  })

  afterAll(async () => {
    await db.delete()
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
