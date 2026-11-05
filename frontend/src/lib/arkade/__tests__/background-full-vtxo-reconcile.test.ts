import { describe, expect, it } from 'vitest'
import {
  backgroundFullReconcileFinishedOutcome,
  backgroundMaintenanceDeferral,
  backgroundMaintenanceFinishedOutcome,
  backgroundWorkAfterLeavingAutonomousMode,
  createSingleFlightScheduler,
} from '@/lib/arkade/background-full-vtxo-reconcile'

describe('background full vtxo reconcile outcome', () => {
  it('maps operator trust pending to a distinct non-failure outcome', () => {
    expect(
      backgroundFullReconcileFinishedOutcome({ operatorTrustPending: true }),
    ).toEqual({ ok: true, operatorTrustPending: true })
    expect(backgroundFullReconcileFinishedOutcome({ operatorTrustPending: false })).toEqual({
      ok: true,
    })
    expect(backgroundFullReconcileFinishedOutcome(undefined)).toEqual({ ok: true })
  })

  it('keeps a catch-up warning distinct from a failed discover_keys', () => {
    expect(
      backgroundMaintenanceFinishedOutcome(
        {
          keyDiscoveryCompleted: true,
          syncWarning: 'an exiting VTXO could not be reconciled',
        },
        true,
      ),
    ).toEqual({
      ok: true,
      keyDiscoveryCompleted: true,
      exitingVtxoWarning: 'an exiting VTXO could not be reconciled',
    })
    expect(
      backgroundMaintenanceFinishedOutcome(
        {
          keyDiscoveryCompleted: false,
          keyDiscoveryWarning: 'indexer timeout',
        },
        true,
      ),
    ).toEqual({
      ok: false,
      keyDiscoveryFailed: true,
      warningMessage: 'indexer timeout',
    })
  })

  it('defers discovery and a bundled full list while autonomous mode is on', () => {
    expect(
      backgroundMaintenanceDeferral({
        runDiscovery: true,
        runFullReconcile: true,
        autonomousActive: true,
      }),
    ).toEqual({ defer: true, fullReconcileDeferred: true })
    expect(
      backgroundMaintenanceDeferral({
        runDiscovery: false,
        runFullReconcile: true,
        autonomousActive: true,
      }),
    ).toEqual({ defer: false, fullReconcileDeferred: false })
  })

  it('runs deferred discovery when autonomous mode ends and keeps a due full list behind it', () => {
    expect(
      backgroundWorkAfterLeavingAutonomousMode({
        discoveryWasDeferred: true,
        fullReconcileWasDeferred: true,
        fullReconcileDue: false,
      }),
    ).toEqual({
      scheduleKeyDiscovery: true,
      includeFullReconcile: true,
      scheduleFullReconcileOnly: false,
    })
    expect(
      backgroundWorkAfterLeavingAutonomousMode({
        discoveryWasDeferred: false,
        fullReconcileWasDeferred: false,
        fullReconcileDue: true,
      }),
    ).toEqual({
      scheduleKeyDiscovery: false,
      includeFullReconcile: false,
      scheduleFullReconcileOnly: true,
    })
  })
})

describe('background full vtxo reconcile single-flight', () => {
  it('second_schedule_while_in_flight_does_not_start_another_full_list', async () => {
    let started = 0
    const schedule = createSingleFlightScheduler(
      () =>
        new Promise<void>(() => {
          started += 1
        }),
    )

    schedule()
    schedule()

    expect(started).toBe(1)
  })

  it('queues one follow-up after the in-flight run settles', async () => {
    let started = 0
    let releaseCurrent: (() => void) | null = null
    const schedule = createSingleFlightScheduler(
      () =>
        new Promise<void>((resolve) => {
          started += 1
          releaseCurrent = resolve
        }),
    )

    schedule()
    schedule()
    schedule()
    expect(started).toBe(1)

    const releaseFirst = releaseCurrent
    releaseFirst?.()
    await Promise.resolve()
    expect(started).toBe(2)

    releaseCurrent?.()
    await Promise.resolve()
    expect(started).toBe(2)
  })
})
