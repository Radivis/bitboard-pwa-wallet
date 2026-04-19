import { describe, expect, it } from 'vitest'
import {
  buildWalletMigrationFailureReportV1,
  extractMigrationNameFromErrorMessage,
} from '../wallet-migration-failure-report'

describe('extractMigrationNameFromErrorMessage', () => {
  it('parses migration name from Migration "..." failed', () => {
    expect(extractMigrationNameFromErrorMessage('Migration "20260417120000_initial_wallet_schema" failed')).toBe(
      '20260417120000_initial_wallet_schema',
    )
    expect(extractMigrationNameFromErrorMessage('other')).toBeUndefined()
  })
})

describe('buildWalletMigrationFailureReportV1', () => {
  it('serializes error chain and records attempts', () => {
    const root = new Error('Migration "m1" failed', { cause: new Error('sqlite: locked') })
    const report = buildWalletMigrationFailureReportV1({ attempts: 3, lastError: root })

    expect(report.schemaVersion).toBe(1)
    expect(report.kind).toBe('wallet_migration_failure')
    expect(report.attempts).toBe(3)
    expect(report.migrationNameFromMessage).toBe('m1')
    expect(report.error.message).toContain('Migration')
    expect(report.error.cause).toBeDefined()
    if (typeof report.error.cause === 'object' && report.error.cause !== null) {
      expect((report.error.cause as { message: string }).message).toBe('sqlite: locked')
    }
  })
})
