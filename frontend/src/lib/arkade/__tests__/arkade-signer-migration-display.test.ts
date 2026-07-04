import { describe, expect, it } from 'vitest'
import {
  formatSignerMigrationPartialStatus,
} from '@/lib/arkade/arkade-signer-migration-display'
import type { ArkadeSignerMigrationResult } from '@/workers/arkade-api'

function migrationResult(
  overrides: Partial<ArkadeSignerMigrationResult> = {},
): ArkadeSignerMigrationResult {
  return {
    vtxoLeg: {
      migratedCount: 0,
      migratedSats: 0,
      deferredCount: 0,
      deferredSats: 0,
      oversizedCount: 0,
      oversizedSats: 0,
    },
    boardingLeg: {
      migratedCount: 0,
      migratedSats: 0,
      deferredCount: 0,
      deferredSats: 0,
      oversizedCount: 0,
      oversizedSats: 0,
    },
    passCount: 0,
    migrationComplete: false,
    remainingPreCutoffVtxoCount: 0,
    remainingPreCutoffSats: 0,
    remainingPreCutoffBoardingCount: 0,
    settleTxids: [],
    ...overrides,
  }
}

describe('formatSignerMigrationPartialStatus', () => {
  it('describes migrated and remaining counts', () => {
    const message = formatSignerMigrationPartialStatus(
      migrationResult({
        vtxoLeg: {
          migratedCount: 2,
          migratedSats: 75_000,
          deferredCount: 0,
          deferredSats: 0,
          oversizedCount: 0,
          oversizedSats: 0,
        },
        remainingPreCutoffVtxoCount: 1,
        remainingPreCutoffSats: 25_000,
      }),
    )
    expect(message).toContain('Migrated 2 outputs (75000 sats)')
    expect(message).toContain('1 VTXO (25000 sats)')
    expect(message).toContain('Migrate again')
  })
})
