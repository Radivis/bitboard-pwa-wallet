import type { Kysely } from 'kysely'

/**
 * Renames `library_articles.is_favorite` to `is_bookmarked`.
 * No `down`: rolling back wallet DDL is unsafe; use new forward migrations instead.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations run over multiple DB shapes
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('library_articles')
    .renameColumn('is_favorite', 'is_bookmarked')
    .execute()
}
