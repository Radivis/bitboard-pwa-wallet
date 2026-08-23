import { describe, expect, it } from 'vitest'
import {
  shouldDeferPersistedUnilateralExitHydrate,
  shouldHydratePersistedUnilateralExitJob,
} from '@/lib/arkade/unilateral-exit-job-reconcile'

const leafA = { txid: 'aa'.repeat(32), vout: 0 }

describe('unilateral-exit-job-reconcile', () => {
  it('hydrates when persisted outpoints exist and the job is not stale', () => {
    expect(
      shouldHydratePersistedUnilateralExitJob({
        selectedLeafOutpoints: [leafA],
        controlStoreSelectionEmpty: true,
      }),
    ).toBe(true)
  })

  it('shouldHydratePersistedUnilateralExitJob is true for a pre-broadcast job', () => {
    expect(
      shouldHydratePersistedUnilateralExitJob({
        selectedLeafOutpoints: [leafA],
        controlStoreSelectionEmpty: true,
      }),
    ).toBe(true)
  })

  it('does not hydrate when persisted outpoints are empty', () => {
    expect(
      shouldHydratePersistedUnilateralExitJob({
        selectedLeafOutpoints: [],
        controlStoreSelectionEmpty: true,
      }),
    ).toBe(false)
  })

  it('defers hydrate while arkade sync is still running', () => {
    expect(
      shouldDeferPersistedUnilateralExitHydrate({
        selectedLeafOutpoints: [leafA],
        inProgressOutpoints: [],
        unilateralExitInProgressSats: 0,
        arkadeLoadPhase: 'loaded',
        arkadeSyncPhase: 'syncing',
      }),
    ).toBe(true)
  })

  it('defers hydrate when in-progress sats exist before outpoints load', () => {
    expect(
      shouldDeferPersistedUnilateralExitHydrate({
        selectedLeafOutpoints: [leafA],
        inProgressOutpoints: [],
        unilateralExitInProgressSats: 300_000,
        arkadeLoadPhase: 'loaded',
        arkadeSyncPhase: 'not-syncing',
      }),
    ).toBe(true)
  })
})
