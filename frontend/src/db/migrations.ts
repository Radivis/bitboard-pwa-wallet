import type { Kysely } from 'kysely'

/**
 * Migration strategy: additive only; no destructive changes. No version table.
 * Fresh installs get the full schema from createTable; no separate ALTER steps.
 * Legacy DBs may still list INTEGER for boolean columns in PRAGMA table_info until recreated; behavior is unchanged.
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
    .addColumn('revision', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('encrypted_data', 'blob', (col) => col.notNull())
    .addColumn('iv', 'blob', (col) => col.notNull())
    .addColumn('salt', 'blob', (col) => col.notNull())
    .addColumn('kdf_version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addColumn('mnemonic_encrypted_data', 'blob', (col) => col.notNull())
    .addColumn('mnemonic_iv', 'blob', (col) => col.notNull())
    .addColumn('mnemonic_salt', 'blob', (col) => col.notNull())
    .addColumn('mnemonic_kdf_version', 'integer', (col) => col.notNull())
    .execute()

  // Additive migration for already-existing databases created before `revision`.
  try {
    await db.schema
      .alterTable('wallet_secrets')
      .addColumn('revision', 'integer', (col) => col.notNull().defaultTo(0))
      .execute()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.toLowerCase().includes('duplicate column')) {
      throw error
    }
  }

  await db.schema
    .createTable('library_history')
    .ifNotExists()
    .addColumn('library_history_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('accessed_at', 'text', (col) => col.notNull())
    .addColumn('access_path', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('library_articles')
    .ifNotExists()
    .addColumn('article_slug', 'text', (col) => col.primaryKey())
    .addColumn('is_favorite', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute()
}
