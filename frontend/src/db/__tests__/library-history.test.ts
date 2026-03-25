import type { Kysely } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import type { Database } from '../schema'
import { createTestDatabase } from '../test-helpers'
import {
  LIBRARY_HISTORY_MAX_ROWS,
  listLibraryHistory,
  pruneLibraryHistory,
  recordLibraryHistoryAccess,
} from '../library-history'

describe('library_history', () => {
  let walletDb: Kysely<Database>

  afterEach(async () => {
    if (walletDb) await walletDb.destroy()
  })

  it('migration creates library_history and accepts inserts', async () => {
    walletDb = await createTestDatabase()
    await recordLibraryHistoryAccess(walletDb, '/library')
    const rows = await walletDb.selectFrom('library_history').selectAll().execute()
    expect(rows).toHaveLength(1)
    expect(rows[0].access_path).toBe('/library')
    expect(rows[0].accessed_at).toMatch(/^\d{4}-/)
  })

  it('listLibraryHistory returns newest first', async () => {
    walletDb = await createTestDatabase()
    await walletDb
      .insertInto('library_history')
      .values({ accessed_at: '2020-01-01T00:00:00.000Z', access_path: '/library/old' })
      .execute()
    await walletDb
      .insertInto('library_history')
      .values({ accessed_at: '2025-01-01T00:00:00.000Z', access_path: '/library/new' })
      .execute()

    const listed = await listLibraryHistory(walletDb, 10)
    expect(listed.map((r) => r.access_path)).toEqual(['/library/new', '/library/old'])
  })

  it('recordLibraryHistoryAccess prunes to LIBRARY_HISTORY_MAX_ROWS', async () => {
    walletDb = await createTestDatabase()
    const smallMax = 5
    for (let i = 0; i < smallMax + 3; i += 1) {
      await walletDb
        .insertInto('library_history')
        .values({
          accessed_at: new Date(Date.UTC(2024, 0, 1, i)).toISOString(),
          access_path: `/library/p${i}`,
        })
        .execute()
      await pruneLibraryHistory(walletDb, smallMax)
    }

    const count = await walletDb
      .selectFrom('library_history')
      .select(walletDb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
    expect(Number(count.count)).toBe(smallMax)
  })

  it('recordLibraryHistoryAccess keeps most recent visits when over cap', async () => {
    walletDb = await createTestDatabase()
    for (let i = 0; i < LIBRARY_HISTORY_MAX_ROWS + 10; i += 1) {
      await recordLibraryHistoryAccess(walletDb, `/library/a${i}`)
    }
    const count = await walletDb
      .selectFrom('library_history')
      .select(walletDb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
    expect(Number(count.count)).toBe(LIBRARY_HISTORY_MAX_ROWS)

    const listed = await listLibraryHistory(walletDb, 3)
    expect(listed[0].access_path).toBe(`/library/a${LIBRARY_HISTORY_MAX_ROWS + 9}`)
  })
})
