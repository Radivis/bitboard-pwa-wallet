import type { StateStorage } from 'zustand/middleware'
import { getDatabase, ensureMigrated } from './database'

/** When true, {@link sqliteStorage} must not touch SQLite (factory reset is closing the DB). */
let sqliteStorageTeardownBlocked = false

/**
 * Stops all persisted Zustand I/O through {@link sqliteStorage} before `destroyDatabase()`.
 * Prevents new statements from opening while Kysely tears down the wa-sqlite worker.
 */
export function blockSqliteStorageForTeardown(): void {
  sqliteStorageTeardownBlocked = true
}

export const sqliteStorage: StateStorage = {
  async getItem(key: string): Promise<string | null> {
    if (sqliteStorageTeardownBlocked) return null
    await ensureMigrated()
    const row = await getDatabase()
      .selectFrom('settings')
      .select('value')
      .where('key', '=', key)
      .executeTakeFirst()
    return row?.value ?? null
  },

  async setItem(key: string, value: string): Promise<void> {
    if (sqliteStorageTeardownBlocked) return
    await ensureMigrated()
    await getDatabase()
      .insertInto('settings')
      .values({ key, value })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
      .execute()
  },

  async removeItem(key: string): Promise<void> {
    if (sqliteStorageTeardownBlocked) return
    await ensureMigrated()
    await getDatabase()
      .deleteFrom('settings')
      .where('key', '=', key)
      .execute()
  },
}
