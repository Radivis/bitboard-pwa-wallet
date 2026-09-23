import { describe, expect, it } from 'vitest'
import { createSingleFlightScheduler } from '@/lib/arkade/background-full-vtxo-reconcile'

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
})
