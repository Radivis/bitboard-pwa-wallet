import type { StateStorage } from 'zustand/middleware'
import {
  blockWalletDatabaseAccessForTeardown,
  getDatabase,
  ensureSchemaMigrated,
  resetWalletDatabaseAccessTeardownGuard,
} from './database'
import {
  LIGHTNING_PERSIST_STORAGE_KEY,
  WALLET_PERSIST_STORAGE_KEY,
} from '@/lib/wallet/historical-signet-onchain-chain'
import { ensureSchemaAndDataMigrated } from './data-migrations/device-data-migrations'
import {
  blockLabDatabaseAccessForTeardown,
  resetLabDatabaseAccessTeardownGuard,
} from './lab-database'

/** When true, {@link sqliteStorage} must not touch SQLite (factory reset is closing the DB). */
let sqliteStorageTeardownBlocked = false

/**
 * Stops persisted Zustand I/O through {@link sqliteStorage} without blocking {@link getDatabase}.
 * Use during factory reset so in-flight rail teardown can still finish durable writes.
 */
export function blockSqliteStoragePersistForTeardown(): void {
  sqliteStorageTeardownBlocked = true
}

/** Prevents {@link getDatabase} / lab DB accessors from opening or reusing SQLite. */
export function blockWalletAndLabDatabaseAccessForTeardown(): void {
  blockWalletDatabaseAccessForTeardown()
  blockLabDatabaseAccessForTeardown()
}

/**
 * Stops persisted Zustand I/O and hard-blocks Kysely accessors (combined teardown).
 */
export function blockSqliteStorageForTeardown(): void {
  blockSqliteStoragePersistForTeardown()
  blockWalletAndLabDatabaseAccessForTeardown()
}

/** Clears persist and hard-block teardown guards. Safe only when destroy has not completed. */
export function resetSqliteStorageTeardownGuard(): void {
  sqliteStorageTeardownBlocked = false
  resetWalletDatabaseAccessTeardownGuard()
  resetLabDatabaseAccessTeardownGuard()
}

/**
 * The wallet and Lightning stores' persist `migrate` reads a device data
 * migration result. If device migrations fail, those stores still hydrate.
 */
async function ensureMigratedBeforePersistedRead(key: string): Promise<void> {
  if (key !== WALLET_PERSIST_STORAGE_KEY && key !== LIGHTNING_PERSIST_STORAGE_KEY) {
    await ensureSchemaMigrated()
    return
  }
  try {
    await ensureSchemaAndDataMigrated()
  } catch (migrationError) {
    console.error('Schema or device data migrations failed:', migrationError)
    await ensureSchemaMigrated()
  }
}

export const sqliteStorage: StateStorage = {
  async getItem(key: string): Promise<string | null> {
    if (sqliteStorageTeardownBlocked) return null
    await ensureMigratedBeforePersistedRead(key)
    const settingsRecord = await getDatabase()
      .selectFrom('settings')
      .select('value')
      .where('key', '=', key)
      .executeTakeFirst()
    return settingsRecord?.value ?? null
  },

  async setItem(key: string, value: string): Promise<void> {
    if (sqliteStorageTeardownBlocked) return
    await ensureSchemaMigrated()
    await getDatabase()
      .insertInto('settings')
      .values({ key, value })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
      .execute()
  },

  async removeItem(key: string): Promise<void> {
    if (sqliteStorageTeardownBlocked) return
    await ensureSchemaMigrated()
    await getDatabase()
      .deleteFrom('settings')
      .where('key', '=', key)
      .execute()
  },
}
