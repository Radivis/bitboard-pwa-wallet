import { describe, expect, it, vi } from 'vitest'
import {
  operatorSyncSchedulesBackgroundFull,
  persistAfterCriticalWithLightOperatorSync,
  shouldScheduleBackgroundFullVtxoReconcile,
} from '@/lib/arkade/arkade-operator-sync-policy'

describe('arkade-operator-sync-policy', () => {
  it('operator_sync_schedules_background_full_for_manual_and_signer_migration_only', () => {
    expect(operatorSyncSchedulesBackgroundFull('manual')).toBe(true)
    expect(operatorSyncSchedulesBackgroundFull('signerMigration')).toBe(true)
    expect(operatorSyncSchedulesBackgroundFull('dashboardPoll')).toBe(false)
    expect(operatorSyncSchedulesBackgroundFull('postLoad')).toBe(false)
  })

  it('schedules background full only when user-facing sync reports it due', () => {
    expect(shouldScheduleBackgroundFullVtxoReconcile(true)).toBe(true)
    expect(shouldScheduleBackgroundFullVtxoReconcile(false)).toBe(false)
    expect(shouldScheduleBackgroundFullVtxoReconcile(undefined)).toBe(false)
  })

  it('persist-after-critical does not await background full reconcile', async () => {
    let backgroundResolved = false
    const scheduleBackgroundFullReconcile = vi.fn(() => {
      void new Promise<void>(() => {
        // Intentionally never resolves — persist must not await this.
      }).then(() => {
        backgroundResolved = true
      })
    })

    await persistAfterCriticalWithLightOperatorSync({
      awaitUserFacingQuiescence: async () => {},
      autonomousActive: false,
      runLightOperatorSync: async () => ({ fullReconcileDue: true }),
      scheduleBackgroundFullReconcile,
      flushPersistence: async () => {
        throw new Error('flush must not run after a light operator sync')
      },
    })

    expect(scheduleBackgroundFullReconcile).toHaveBeenCalledTimes(1)
    expect(backgroundResolved).toBe(false)
  })
})
