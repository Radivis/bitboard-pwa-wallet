/**
 * wa-sqlite may reject `sqlite3_close` with this message when work is still pending.
 * `kysely-generic-sqlite`'s worker driver still runs `finally` and terminates the Worker,
 * so the OPFS DB file can usually be removed after; we clear the Kysely singleton either way.
 */
export function isBenignSqliteWorkerCloseFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /unfinalized|unfinished backups|unable to close/i.test(msg)
}
