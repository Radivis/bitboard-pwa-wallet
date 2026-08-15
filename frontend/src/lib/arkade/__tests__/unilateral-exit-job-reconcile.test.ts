import { describe, expect, it } from 'vitest'
import {
  isPersistedUnilateralExitJobStale,
  shouldDeferPersistedUnilateralExitStaleCheck,
  shouldHydratePersistedUnilateralExitJob,
} from '@/lib/arkade/unilateral-exit-job-reconcile'

const leafA = { txid: 'aa'.repeat(32), vout: 0 }
const leafB = { txid: 'bb'.repeat(32), vout: 1 }

describe('unilateral-exit-job-reconcile', () => {
  it('treats persisted job as stale when nothing is in progress after sync settled', () => {
    expect(
      isPersistedUnilateralExitJobStale({
        jobStarted: true,
        selectedLeafOutpoints: [leafA],
        inProgressOutpoints: [],
        unilateralExitInProgressSats: 0,
      }),
    ).toBe(true)
  })

  it('keeps persisted job when selection overlaps in-progress outpoints', () => {
    expect(
      isPersistedUnilateralExitJobStale({
        jobStarted: true,
        selectedLeafOutpoints: [leafA],
        inProgressOutpoints: [leafA],
        unilateralExitInProgressSats: 50_000,
      }),
    ).toBe(false)
  })

  it('keeps persisted job when in-progress outpoints differ from original leaves', () => {
    expect(
      isPersistedUnilateralExitJobStale({
        jobStarted: true,
        selectedLeafOutpoints: [leafA],
        inProgressOutpoints: [leafB],
        unilateralExitInProgressSats: 50_000,
      }),
    ).toBe(false)
  })

  it('keeps persisted job when in-progress sats exist before outpoints load', () => {
    expect(
      isPersistedUnilateralExitJobStale({
        jobStarted: true,
        selectedLeafOutpoints: [leafA],
        inProgressOutpoints: [],
        unilateralExitInProgressSats: 300_000,
      }),
    ).toBe(false)
  })

  it('hydrates when job is active and not stale even if outpoints differ', () => {
    expect(
      shouldHydratePersistedUnilateralExitJob({
        jobStarted: true,
        selectedLeafOutpoints: [leafA],
        inProgressOutpoints: [leafA],
        unilateralExitInProgressSats: 50_000,
        controlStoreSelectionEmpty: true,
      }),
    ).toBe(true)

    expect(
      shouldHydratePersistedUnilateralExitJob({
        jobStarted: true,
        selectedLeafOutpoints: [leafA],
        inProgressOutpoints: [leafB],
        unilateralExitInProgressSats: 50_000,
        controlStoreSelectionEmpty: true,
      }),
    ).toBe(true)

    expect(
      shouldHydratePersistedUnilateralExitJob({
        jobStarted: true,
        selectedLeafOutpoints: [leafA],
        inProgressOutpoints: [],
        unilateralExitInProgressSats: 0,
        controlStoreSelectionEmpty: true,
      }),
    ).toBe(false)
  })

  it('defers stale check while arkade sync is still running', () => {
    expect(
      shouldDeferPersistedUnilateralExitStaleCheck({
        jobStarted: true,
        inProgressOutpoints: [],
        unilateralExitInProgressSats: 0,
        arkadeLoadPhase: 'loaded',
        arkadeSyncPhase: 'syncing',
      }),
    ).toBe(true)
  })

  it('defers stale check when in-progress sats exist before outpoints load', () => {
    expect(
      shouldDeferPersistedUnilateralExitStaleCheck({
        jobStarted: true,
        inProgressOutpoints: [],
        unilateralExitInProgressSats: 300_000,
        arkadeLoadPhase: 'loaded',
        arkadeSyncPhase: 'not-syncing',
      }),
    ).toBe(true)
  })
})
