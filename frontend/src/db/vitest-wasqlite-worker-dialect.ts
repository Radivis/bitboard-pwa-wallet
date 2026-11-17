import Database from 'better-sqlite3'
import { SqliteDialect } from 'kysely'

/**
 * Vitest stand-in for `kysely-wasqlite-worker`.
 *
 * The real dialect starts a Web Worker on the first query. jsdom does not
 * define `Worker`, so wallet and lab migrations throw
 * `ReferenceError: Worker is not defined`. Component tests that reach
 * `getDatabase()` or `getLabDatabase()` get an in-memory SQLite connection
 * instead. Vite aliases this module only when Vitest loads the config.
 */
export class WaSqliteWorkerDialect extends SqliteDialect {
  constructor(_config?: { fileName?: string; preferOPFS?: boolean }) {
    super({
      database: new Database(':memory:'),
    })
  }
}
