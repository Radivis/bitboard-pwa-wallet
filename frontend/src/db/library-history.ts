import type { Kysely } from 'kysely'
import type { Database } from './schema'

/** Max rows kept after each insert; older visits are removed. */
export const LIBRARY_HISTORY_MAX_ROWS = 200

export async function recordLibraryHistoryAccess(
  walletDb: Kysely<Database>,
  accessPath: string,
): Promise<void> {
  const accessedAt = new Date().toISOString()
  await walletDb
    .insertInto('library_history')
    .values({ accessed_at: accessedAt, access_path: accessPath })
    .execute()
  await pruneLibraryHistory(walletDb, LIBRARY_HISTORY_MAX_ROWS)
}

export async function listLibraryHistory(
  walletDb: Kysely<Database>,
  limit: number,
): Promise<Array<{ library_history_id: number; accessed_at: string; access_path: string }>> {
  return walletDb
    .selectFrom('library_history')
    .select(['library_history_id', 'accessed_at', 'access_path'])
    .orderBy('accessed_at', 'desc')
    .orderBy('library_history_id', 'desc')
    .limit(limit)
    .execute()
}

/**
 * Deletes rows so at most `maxRows` remain, keeping the most recently accessed.
 */
export async function pruneLibraryHistory(
  walletDb: Kysely<Database>,
  maxRows: number,
): Promise<void> {
  const keep = await walletDb
    .selectFrom('library_history')
    .select('library_history_id')
    .orderBy('accessed_at', 'desc')
    .orderBy('library_history_id', 'desc')
    .limit(maxRows)
    .execute()

  const keepIds = keep.map((r) => r.library_history_id)
  if (keepIds.length === 0) return

  await walletDb
    .deleteFrom('library_history')
    .where('library_history_id', 'not in', keepIds)
    .execute()
}
