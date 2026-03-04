import { Kysely } from 'kysely'
import { WaSqliteWorkerDialect } from 'kysely-wasqlite-worker'
import type { Database } from './schema'
import { migrateToLatest } from './migrations'

const DATABASE_FILE_NAME = 'bitboard-wallet'

let instance: Kysely<Database> | null = null
let migrated = false

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
  await migrateToLatest(getDatabase())
  migrated = true
}

export async function destroyDatabase(): Promise<void> {
  if (instance) {
    await instance.destroy()
    instance = null
    migrated = false
  }
}
