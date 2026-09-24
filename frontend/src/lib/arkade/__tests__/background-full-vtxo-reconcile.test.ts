import { describe, expect, it } from 'vitest'
import {
  backgroundFullReconcileFinishedOutcome,
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
