import type { StateStorage } from 'zustand/middleware'
import { db } from './database'

/**
 * Zustand-compatible storage adapter that persists state to IndexedDB
 * via the Dexie `settings` table instead of localStorage.
 *
 * Each Zustand store is stored as a single row keyed by its store name
 * (e.g. "wallet-storage", "theme-storage").
 */
export const indexedDbStorage: StateStorage = {
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
