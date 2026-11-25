import type { MigrationProvider } from 'kysely/migration'
import * as initialWalletSchema from './wallet/20260417120000_initial_wallet_schema'
import * as dataMigrationTables from './wallet/20261011120000_data_migration_tables'
import * as renameLibraryArticleFavoriteToBookmark from './wallet/20261125120000_rename_library_article_favorite_to_bookmark'

export const walletMigrationProvider: MigrationProvider = {
  async getMigrations() {
    return {
      '20260417120000_initial_wallet_schema': initialWalletSchema,
      '20261011120000_data_migration_tables': dataMigrationTables,
      '20261125120000_rename_library_article_favorite_to_bookmark':
        renameLibraryArticleFavoriteToBookmark,
    }
  },
}
