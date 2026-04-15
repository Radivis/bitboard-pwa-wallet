import type { Kysely } from 'kysely'
import { SQLITE_TRUE, type Database } from './schema'

export async function getFavoriteBySlug(
  walletDb: Kysely<Database>,
  articleSlug: string,
): Promise<boolean> {
  const row = await walletDb
    .selectFrom('library_articles')
    .select('is_favorite')
    .where('article_slug', '=', articleSlug)
    .executeTakeFirst()
  if (!row) return false
  // `== true` matches both boolean true and legacy INTEGER 1 from older DBs / drivers.
  return row.is_favorite == true
}

export async function getAllFavoriteSlugs(walletDb: Kysely<Database>): Promise<string[]> {
  const rows = await walletDb
    .selectFrom('library_articles')
    .select('article_slug')
    // Runtime binds `1` (SQLite); `as boolean` satisfies Kysely OperandValue for ColumnType<boolean, …>.
    .where('is_favorite', '=', SQLITE_TRUE as unknown as boolean)
    .execute()
  return rows.map((r) => r.article_slug)
}

/**
 * Persists favorite state. When `isFavorite` is false, the row is removed so absent slug means not favorite.
 */
export async function setArticleFavorite(
  walletDb: Kysely<Database>,
  articleSlug: string,
  isFavorite: boolean,
): Promise<void> {
  if (!isFavorite) {
    await walletDb
      .deleteFrom('library_articles')
      .where('article_slug', '=', articleSlug)
      .execute()
    return
  }

  const existing = await walletDb
    .selectFrom('library_articles')
    .select('article_slug')
    .where('article_slug', '=', articleSlug)
    .executeTakeFirst()

  if (existing) {
    await walletDb
      .updateTable('library_articles')
      .set({ is_favorite: SQLITE_TRUE })
      .where('article_slug', '=', articleSlug)
      .execute()
    return
  }

  await walletDb
    .insertInto('library_articles')
    .values({ article_slug: articleSlug, is_favorite: SQLITE_TRUE })
    .execute()
}
