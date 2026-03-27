import type { Kysely } from 'kysely'
import type { Database } from './schema'

/** SQLite `is_favorite` flag for “favorite” rows (absent or `0` means not favorite). */
export const FAVORITE_SQLITE_TRUE = 1

function isFavoriteValue(value: number): boolean {
  return value === FAVORITE_SQLITE_TRUE
}

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
  return isFavoriteValue(row.is_favorite)
}

export async function getAllFavoriteSlugs(walletDb: Kysely<Database>): Promise<string[]> {
  const rows = await walletDb
    .selectFrom('library_articles')
    .select('article_slug')
    .where('is_favorite', '=', FAVORITE_SQLITE_TRUE)
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
      .set({ is_favorite: FAVORITE_SQLITE_TRUE })
      .where('article_slug', '=', articleSlug)
      .execute()
    return
  }

  await walletDb
    .insertInto('library_articles')
    .values({ article_slug: articleSlug, is_favorite: FAVORITE_SQLITE_TRUE })
    .execute()
}
