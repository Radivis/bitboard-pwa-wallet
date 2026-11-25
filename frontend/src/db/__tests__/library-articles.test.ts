import { Kysely, SqliteDialect, sql } from 'kysely'
import { Migrator } from 'kysely/migration'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import type { Database as WalletDatabase } from '../schema'
import {
  getAllBookmarkSlugs,
  getBookmarkBySlug,
  setArticleBookmark,
} from '../library-articles'
import {
  SCHEMA_MIGRATIONS_LOCK_TABLE,
  SCHEMA_MIGRATIONS_TABLE,
} from '../migrations/run-migrator'
import { walletMigrationProvider } from '../migrations/wallet-migration-provider'
import { runWalletMigrations } from '../migrations/run-wallet-migrations'
import { createTestDatabase } from '../test-helpers'

/** Last wallet migration that still stores bookmarks as `is_favorite`. */
const WALLET_SCHEMA_BEFORE_BOOKMARK_RENAME = '20261011120000_data_migration_tables'

function openInMemoryWalletDatabase(): Kysely<WalletDatabase> {
  return new Kysely<WalletDatabase>({
    dialect: new SqliteDialect({
      database: new Database(':memory:'),
    }),
  })
}

async function migrateWalletDatabaseTo(
  walletDb: Kysely<WalletDatabase>,
  migrationName: string,
): Promise<void> {
  const migrator = new Migrator({
    db: walletDb,
    provider: walletMigrationProvider,
    migrationTableName: SCHEMA_MIGRATIONS_TABLE,
    migrationLockTableName: SCHEMA_MIGRATIONS_LOCK_TABLE,
  })
  const { error } = await migrator.migrateTo(migrationName)
  if (error) throw error
}

describe('library_articles', () => {
  let walletDb: Kysely<WalletDatabase>

  afterEach(async () => {
    if (walletDb) await walletDb.destroy()
  })

  it('migration creates library_articles', async () => {
    walletDb = await createTestDatabase()
    const rows = await walletDb.selectFrom('library_articles').selectAll().execute()
    expect(rows).toEqual([])
  })

  it('getBookmarkBySlug returns false when row absent', async () => {
    walletDb = await createTestDatabase()
    await expect(getBookmarkBySlug(walletDb, 'bitcoin')).resolves.toBe(false)
  })

  it('setArticleBookmark true then getBookmarkBySlug and getAllBookmarkSlugs', async () => {
    walletDb = await createTestDatabase()
    await setArticleBookmark(walletDb, 'bitcoin', true)
    await expect(getBookmarkBySlug(walletDb, 'bitcoin')).resolves.toBe(true)
    await expect(getAllBookmarkSlugs(walletDb)).resolves.toEqual(['bitcoin'])
  })

  it('setArticleBookmark false removes row', async () => {
    walletDb = await createTestDatabase()
    await setArticleBookmark(walletDb, 'segwit', true)
    await setArticleBookmark(walletDb, 'segwit', false)
    await expect(getBookmarkBySlug(walletDb, 'segwit')).resolves.toBe(false)
    const count = await walletDb
      .selectFrom('library_articles')
      .select(walletDb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
    expect(Number(count.count)).toBe(0)
  })

  it('setArticleBookmark true twice is idempotent', async () => {
    walletDb = await createTestDatabase()
    await setArticleBookmark(walletDb, 'what-is-a-wallet', true)
    await setArticleBookmark(walletDb, 'what-is-a-wallet', true)
    await expect(getAllBookmarkSlugs(walletDb)).resolves.toEqual(['what-is-a-wallet'])
  })

  it('keeps a favorite row as a bookmark after the column rename', async () => {
    walletDb = openInMemoryWalletDatabase()
    await migrateWalletDatabaseTo(walletDb, WALLET_SCHEMA_BEFORE_BOOKMARK_RENAME)
    await sql`
      INSERT INTO library_articles (article_slug, is_favorite)
      VALUES ('what-is-a-wallet', 1)
    `.execute(walletDb)

    await runWalletMigrations(walletDb)

    await expect(getBookmarkBySlug(walletDb, 'what-is-a-wallet')).resolves.toBe(true)
    await expect(getAllBookmarkSlugs(walletDb)).resolves.toEqual(['what-is-a-wallet'])
  })
})
