import type { Kysely } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import type { Database } from '../schema'
import {
  getAllFavoriteSlugs,
  getFavoriteBySlug,
  setArticleFavorite,
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

  it('getFavoriteBySlug returns false when row absent', async () => {
    walletDb = await createTestDatabase()
    await expect(getFavoriteBySlug(walletDb, 'bitcoin')).resolves.toBe(false)
  })

  it('setArticleFavorite true then getFavoriteBySlug and getAllFavoriteSlugs', async () => {
    walletDb = await createTestDatabase()
    await setArticleFavorite(walletDb, 'bitcoin', true)
    await expect(getFavoriteBySlug(walletDb, 'bitcoin')).resolves.toBe(true)
    await expect(getAllFavoriteSlugs(walletDb)).resolves.toEqual(['bitcoin'])
  })

  it('setArticleFavorite false removes row', async () => {
    walletDb = await createTestDatabase()
    await setArticleFavorite(walletDb, 'segwit', true)
    await setArticleFavorite(walletDb, 'segwit', false)
    await expect(getFavoriteBySlug(walletDb, 'segwit')).resolves.toBe(false)
    const count = await walletDb
      .selectFrom('library_articles')
      .select(walletDb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
    expect(Number(count.count)).toBe(0)
  })

  it('setArticleFavorite true twice is idempotent', async () => {
    walletDb = await createTestDatabase()
    await setArticleFavorite(walletDb, 'what-is-a-wallet', true)
    await setArticleFavorite(walletDb, 'what-is-a-wallet', true)
    await expect(getAllFavoriteSlugs(walletDb)).resolves.toEqual(['what-is-a-wallet'])
  })
})
