import type { Kysely } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import type { Database } from '../schema'
import {
  getAllBookmarkSlugs,
  getBookmarkBySlug,
  setArticleBookmark,
} from '../library-articles'
import { createTestDatabase } from '../test-helpers'

describe('library_articles', () => {
  let walletDb: Kysely<Database>

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
})
