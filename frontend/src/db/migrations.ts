import type { Kysely } from 'kysely'
import { sql } from 'kysely'

/**
 * Migration strategy: additive only; no destructive changes. No version table.
 * kdf_version backfill is best-effort (catch duplicate column for existing DBs).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations run over multiple DB shapes
export async function migrateToLatest(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('wallets')
    .ifNotExists()
    .addColumn('wallet_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('settings')
    .ifNotExists()
    .addColumn('key', 'text', (col) => col.primaryKey())
    .addColumn('value', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('wallet_secrets')
    .ifNotExists()
    .addColumn('wallet_secrets_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('wallet_id', 'integer', (col) => col.notNull().unique())
    .addColumn('encrypted_data', 'blob', (col) => col.notNull())
    .addColumn('iv', 'blob', (col) => col.notNull())
    .addColumn('salt', 'blob', (col) => col.notNull())
    .addColumn('kdf_version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute()

  // Add kdf_version for existing DBs created before this column existed. Ignore if column exists.
  try {
    await sql`ALTER TABLE wallet_secrets ADD COLUMN kdf_version INTEGER NOT NULL DEFAULT 1`.execute(db)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw e
  }
}
