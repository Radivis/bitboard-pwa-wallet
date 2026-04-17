import type { Kysely } from 'kysely'
import { runMigrationsToLatest } from './run-migrator'
import { labMigrationProvider } from './lab-migration-provider'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lab migrator accepts evolving schema
export async function runLabMigrations(db: Kysely<any>): Promise<void> {
  await runMigrationsToLatest(db, labMigrationProvider)
}
