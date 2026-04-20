import { Kysely } from 'kysely'
import { WaSqliteWorkerDialect } from 'kysely-wasqlite-worker'
import type { LabDatabase } from './lab-schema'
import { runLabMigrations } from './migrations/run-lab-migrations'
import { LAB_SQLITE_OPFS_BASENAME } from './opfs-sqlite-database-names'
import { isBenignSqliteWorkerCloseFailure } from './sqlite-worker-close-error'

let labInstance: Kysely<LabDatabase> | null = null
let labMigrated = false
let labMigrationPromise: Promise<void> | null = null

export function getLabDatabase(): Kysely<LabDatabase> {
  if (!labInstance) {
    labInstance = new Kysely<LabDatabase>({
      dialect: new WaSqliteWorkerDialect({
        fileName: LAB_SQLITE_OPFS_BASENAME,
        preferOPFS: true,
      }),
    })
  }
  return labInstance
}

/**
 * Runs Kysely {@link Migrator} for the lab SQLite file in OPFS.
 * Legacy lab DBs may still list INTEGER for boolean columns in PRAGMA table_info until recreated; behavior is unchanged.
 */
export async function ensureLabMigrated(): Promise<void> {
  if (labMigrated) return
  if (labMigrationPromise) {
    await labMigrationPromise
    return
  }
  labMigrationPromise = runLabMigrations(getLabDatabase())
  await labMigrationPromise
  labMigrationPromise = null
  labMigrated = true
}

export async function destroyLabDatabase(): Promise<void> {
  if (labMigrationPromise) {
    try {
      await labMigrationPromise
    } catch (err) {
      console.error(
        '[destroyLabDatabase] labMigrationPromise rejected while awaiting teardown (continuing):',
        err,
      )
    }
    labMigrationPromise = null
  }
  if (!labInstance) {
    return
  }
  try {
    await labInstance.destroy()
  } catch (err) {
    console.error('[destroyLabDatabase] Kysely instance.destroy() failed:', err)
    if (isBenignSqliteWorkerCloseFailure(err)) {
      console.warn(
        '[destroyLabDatabase] Non-fatal close error (worker dialect still tears down the worker). Clearing singleton so OPFS files can be removed.',
      )
    } else {
      throw err
    }
  } finally {
    labInstance = null
    labMigrated = false
  }
}
