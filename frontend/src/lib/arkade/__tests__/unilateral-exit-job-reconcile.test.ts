import { describe, expect, it } from 'vitest'
import {
  isPersistedUnilateralExitJobStale,
  shouldHydratePersistedUnilateralExitJob,
} from '@/lib/arkade/unilateral-exit-job-reconcile'

const leafA = { txid: 'aa'.repeat(32), vout: 0 }
const leafB = { txid: 'bb'.repeat(32), vout: 1 }

describe('unilateral-exit-job-reconcile', () => {
  it('treats persisted job as stale when nothing is in progress', () => {
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

  it('treats persisted job as stale when in-progress outpoints do not match selection', () => {
    expect(
      isPersistedUnilateralExitJobStale({
        jobStarted: true,
        selectedLeafOutpoints: [leafA],
        inProgressOutpoints: [leafB],
        unilateralExitInProgressSats: 50_000,
      }),
    ).toBe(true)
  })

  it('hydrates only when job is active and overlaps in-progress selection', () => {
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
        inProgressOutpoints: [],
        unilateralExitInProgressSats: 0,
        controlStoreSelectionEmpty: true,
      }),
    ).toBe(false)
  })
})
