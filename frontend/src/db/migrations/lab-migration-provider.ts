import type { MigrationProvider } from 'kysely'
import * as initialLabSchema from './lab/20260417120000_initial_lab_schema'

export const labMigrationProvider: MigrationProvider = {
  async getMigrations() {
    return {
      '20260417120000_initial_lab_schema': initialLabSchema,
    }
  },
}
