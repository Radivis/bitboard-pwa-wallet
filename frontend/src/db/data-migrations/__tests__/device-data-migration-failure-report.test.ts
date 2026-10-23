import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from '@/db/schema'
import { createTestDatabase } from '@/db/test-helpers'
import {
  WALLET_MIGRATION_FAILURE_OPFS_FILENAME,
  type WalletMigrationFailureReportV1,
} from '@/db/migrations/wallet-migration-failure-report'
import { SCHEMA_MIGRATION_RETRY_MAX_ATTEMPTS } from '@/db/migrations/retry-async'
import { SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME } from '@/db/data-migrations/data-migration-names'
import { runDeviceDataMigrationsWithFailureReport } from '@/db/data-migrations/device-data-migrations'

const writeTextFileToOpfsRoot = vi.hoisted(() => vi.fn())
vi.mock('@/db/opfs/opfs-root-file', () => ({
  writeTextFileToOpfsRoot: (...args: unknown[]) => writeTextFileToOpfsRoot(...args),
}))

vi.mock('@/db/migrations/retry-async', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/migrations/retry-async')>()),
  SCHEMA_MIGRATION_RETRY_DELAY_MS: 0,
}))

async function makeDeviceMigrationMarkerInsertFail(walletDb: Kysely<Database>): Promise<void> {
  await sql`
    CREATE TRIGGER fail_device_data_migration_marker
    BEFORE INSERT ON device_data_migrations
    BEGIN
      SELECT RAISE(ABORT, 'device marker insert failed');
    END
  `.execute(walletDb)
}

function writtenFailureReport(): WalletMigrationFailureReportV1 {
  const [fileName, reportJson] = writeTextFileToOpfsRoot.mock.calls[0] as [string, string]
  expect(fileName).toBe(WALLET_MIGRATION_FAILURE_OPFS_FILENAME)
  return JSON.parse(reportJson) as WalletMigrationFailureReportV1
}

describe('device data migration failure report', () => {
  let walletDb: Kysely<Database>

  beforeEach(async () => {
    writeTextFileToOpfsRoot.mockReset()
    walletDb = await createTestDatabase()
  })

  afterEach(async () => {
    await walletDb.destroy()
  })

  it('writes a failure report naming the device migration after retries are exhausted', async () => {
    await makeDeviceMigrationMarkerInsertFail(walletDb)

    await expect(runDeviceDataMigrationsWithFailureReport(walletDb)).rejects.toThrow(
      `Migration "${SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME}" failed`,
    )

    expect(writeTextFileToOpfsRoot).toHaveBeenCalledTimes(1)
    const report = writtenFailureReport()
    expect(report.migrationNameFromMessage).toBe(SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME)
    expect(report.attempts).toBe(SCHEMA_MIGRATION_RETRY_MAX_ATTEMPTS)
    expect(JSON.stringify(report.error)).toContain('device marker insert failed')
  })

  it('does not write a failure report when device migrations succeed', async () => {
    await runDeviceDataMigrationsWithFailureReport(walletDb)

    expect(writeTextFileToOpfsRoot).not.toHaveBeenCalled()
    const appliedRow = await walletDb
      .selectFrom('device_data_migrations')
      .select('migration_name')
      .executeTakeFirst()
    expect(appliedRow?.migration_name).toBe(SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME)
  })
})
