import type { Kysely } from 'kysely'
import { SQLITE_TRUE, type Database } from './schema'

export async function getBookmarkBySlug(
  walletDb: Kysely<Database>,
  articleSlug: string,
): Promise<boolean> {
  const articleRecord = await walletDb
    .selectFrom('library_articles')
    .select('is_bookmarked')
    .where('article_slug', '=', articleSlug)
    .executeTakeFirst()
  if (!articleRecord) return false
  // `== true` matches both boolean true and legacy INTEGER 1 from older DBs / drivers.
  return articleRecord.is_bookmarked == true
}

export async function getAllBookmarkSlugs(walletDb: Kysely<Database>): Promise<string[]> {
  const rows = await walletDb
    .selectFrom('library_articles')
    .select('article_slug')
    // Runtime binds `1` (SQLite); `as boolean` satisfies Kysely OperandValue for ColumnType<boolean, …>.
    .where('is_bookmarked', '=', SQLITE_TRUE as unknown as boolean)
    .execute()
  return rows.map((bookmarkRow) => bookmarkRow.article_slug)
}

/**
 * Persists bookmark state. When `isBookmarked` is false, the row is removed so an absent slug means not bookmarked.
 */
export async function setArticleBookmark(
  walletDb: Kysely<Database>,
  articleSlug: string,
  isBookmarked: boolean,
): Promise<void> {
  if (!isBookmarked) {
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
      .set({ is_bookmarked: SQLITE_TRUE })
      .where('article_slug', '=', articleSlug)
      .execute()
    return
  }

  await walletDb
    .insertInto('library_articles')
    .values({ article_slug: articleSlug, is_bookmarked: SQLITE_TRUE })
    .execute()
}
