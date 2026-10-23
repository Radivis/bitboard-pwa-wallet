import type { Kysely } from 'kysely'

/**
 * Bookkeeping for data migrations (rewrites of stored data, not schema).
 * No `down`: rolling back wallet DDL is unsafe; use new forward migrations instead.
 *
 * `wallet_data_migrations` is plaintext next to encrypted wallet data, so it
 * deliberately has no result column. Every wallet gets every marker whether or
 * not the migration changed anything, so the markers reveal nothing about a
 * wallet's contents. Per-wallet results belong in the encrypted payload.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations run over multiple DB shapes
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('device_data_migrations')
    .ifNotExists()
    .addColumn('migration_name', 'text', (col) => col.primaryKey())
    .addColumn('applied_at', 'text', (col) => col.notNull())
    .addColumn('result', 'text')
    .execute()

  await db.schema
    .createTable('wallet_data_migrations')
    .ifNotExists()
    .addColumn('wallet_id', 'integer', (col) => col.notNull())
    .addColumn('migration_name', 'text', (col) => col.notNull())
    .addColumn('applied_at', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('wallet_data_migrations_pk', ['wallet_id', 'migration_name'])
    .execute()
}
