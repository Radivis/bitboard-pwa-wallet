import { Kysely } from 'kysely'
import { WaSqliteWorkerDialect } from 'kysely-wasqlite-worker'
import type { Database } from './schema'
import { migrateToLatest } from './migrations'

const DATABASE_FILE_NAME = 'bitboard-wallet'

let instance: Kysely<Database> | null = null
let migrated = false
let migrationPromise: Promise<void> | null = null

export function getDatabase(): Kysely<Database> {
  if (!instance) {
    instance = new Kysely<Database>({
      dialect: new WaSqliteWorkerDialect({
        fileName: DATABASE_FILE_NAME,
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
  migrationPromise = migrateToLatest(getDatabase())
  await migrationPromise
  migrationPromise = null
  migrated = true
}

export async function destroyDatabase(): Promise<void> {
  if (instance) {
    await instance.destroy()
    instance = null
    migrated = false
    migrationPromise = null
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
