import { Kysely } from 'kysely'
import { WaSqliteWorkerDialect } from 'kysely-wasqlite-worker'
import type { LabDatabase } from './lab-schema'
import { runLabMigrations } from './migrations/run-lab-migrations'
import { LAB_SQLITE_OPFS_BASENAME } from './opfs-sqlite-database-names'

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
  if (labInstance) {
    await labInstance.destroy()
    labInstance = null
    labMigrated = false
    labMigrationPromise = null
  }
}
