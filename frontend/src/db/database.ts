import { Kysely } from 'kysely'
import { WaSqliteWorkerDialect } from 'kysely-wasqlite-worker'
import type { Database } from './schema'
import { runWalletMigrations } from './migrations/run-wallet-migrations'
import { WALLET_SQLITE_OPFS_BASENAME } from './opfs-sqlite-database-names'
import { isBenignSqliteWorkerCloseFailure } from './sqlite-worker-close-error'

let instance: Kysely<Database> | null = null
let migrated = false
let migrationPromise: Promise<void> | null = null

export function getDatabase(): Kysely<Database> {
  if (!instance) {
    instance = new Kysely<Database>({
      dialect: new WaSqliteWorkerDialect({
        fileName: WALLET_SQLITE_OPFS_BASENAME,
        preferOPFS: true,
      }),
    })
  }
  return instance
}

export async function ensureMigrated(): Promise<void> {
  if (migrated) return
  if (migrationPromise) {
    await migrationPromise
    return
  }
  migrationPromise = runWalletMigrations(getDatabase())
  await migrationPromise
  migrationPromise = null
  migrated = true
}

export async function destroyDatabase(): Promise<void> {
  if (migrationPromise) {
    try {
      await migrationPromise
    } catch (err) {
      console.error(
        '[destroyDatabase] migrationPromise rejected while awaiting teardown (continuing):',
        err,
      )
    }
    migrationPromise = null
  }
  if (!instance) {
    return
  }
  try {
    await instance.destroy()
  } catch (err) {
    console.error('[destroyDatabase] Kysely instance.destroy() failed:', err)
    if (isBenignSqliteWorkerCloseFailure(err)) {
      console.warn(
        '[destroyDatabase] Non-fatal close error (worker dialect still tears down the worker). Clearing singleton so OPFS files can be removed.',
      )
    } else {
      throw err
    }
  } finally {
    instance = null
    migrated = false
  }
}

export type DatabaseHealthResult =
  | { ok: true }
  | { ok: false; error: Error }

/**
 * Verifies the database connection and migrations.
 * Use this to detect OPFS/IndexedDB access failures early.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  try {
    await ensureMigrated()
    await getDatabase()
      .selectFrom('settings')
      .select('key')
      .limit(1)
      .executeTakeFirst()
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

let initialDatabaseHealthPromise: Promise<DatabaseHealthResult> | null = null

/**
 * Runs {@link checkDatabaseHealth} once per page load and returns the same promise
 * to every caller (avoids duplicate migration/OPFS work from the gate and shell).
 */
export function getInitialDatabaseHealth(): Promise<DatabaseHealthResult> {
  if (!initialDatabaseHealthPromise) {
    initialDatabaseHealthPromise = checkDatabaseHealth()
  }
  return initialDatabaseHealthPromise
}
