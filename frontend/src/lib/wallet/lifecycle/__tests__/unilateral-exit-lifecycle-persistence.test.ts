import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/wallet/lifecycle/unilateral-exit-frontend-sdk-persistence', () => ({
  scheduleUnilateralExitJobSdkWrite: vi.fn(),
}))

import { persistedUnilateralExitJobExists } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import {
  clearPersistedUnilateralExitJob,
  emptyPersistedUnilateralExitJob,
  ensurePersistedUnilateralExitJob,
  getPersistedUnilateralExitJob,
  migratePersistedUnilateralExitJob,
  persistActiveUnilateralExitJob,
  updatePersistedUnilateralExitRelayWait,
  useUnilateralExitLifecyclePersistenceStore,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'

const walletScope = {
  walletId: 1,
  networkMode: 'regtest' as const,
  connectionId: 'conn-1',
}

const leaf = { txid: 'aa'.repeat(32), vout: 0 }

describe('unilateral-exit-lifecycle-persistence', () => {
  beforeEach(() => {
    useUnilateralExitLifecyclePersistenceStore.setState({ jobsByKey: {}, hydratedByKey: {} })
  })

  it('persistedUnilateralExitJobExists is true only when outpoints are present', () => {
    expect(persistedUnilateralExitJobExists(null)).toBe(false)
    expect(persistedUnilateralExitJobExists(emptyPersistedUnilateralExitJob)).toBe(false)
    expect(
      persistedUnilateralExitJobExists({
        ...emptyPersistedUnilateralExitJob,
        selectedLeafOutpoints: [leaf],
      }),
    ).toBe(true)
  })

  it('updatePersistedUnilateralExitRelayWait round-trip', () => {
    persistActiveUnilateralExitJob(walletScope, [leaf])
    updatePersistedUnilateralExitRelayWait(walletScope, 1_700_000_000)

    const job = getPersistedUnilateralExitJob(walletScope)
    expect(job.currentStepRelayedSinceUnix).toBe(1_700_000_000)
    expect(job.selectedLeafOutpoints).toEqual([leaf])
    expect(persistedUnilateralExitJobExists(job)).toBe(true)

    updatePersistedUnilateralExitRelayWait(walletScope, null)
    expect(getPersistedUnilateralExitJob(walletScope).currentStepRelayedSinceUnix).toBeNull()
  })

  it('ensurePersistedUnilateralExitJob preserves timestamps when outpoints are unchanged', () => {
    persistActiveUnilateralExitJob(walletScope, [leaf])
    updatePersistedUnilateralExitRelayWait(walletScope, 1_700_000_000)
    const started = getPersistedUnilateralExitJob(walletScope).jobStartedAtUnix
    expect(started).not.toBeNull()

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-21T12:00:00Z'))
    try {
      ensurePersistedUnilateralExitJob(walletScope, [leaf])
      const job = getPersistedUnilateralExitJob(walletScope)
      expect(job.jobStartedAtUnix).toBe(started)
      expect(job.currentStepRelayedSinceUnix).toBe(1_700_000_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ensurePersistedUnilateralExitJob stamps a new start when outpoints change', () => {
    persistActiveUnilateralExitJob(walletScope, [leaf])
    updatePersistedUnilateralExitRelayWait(walletScope, 1_700_000_000)
    const started = getPersistedUnilateralExitJob(walletScope).jobStartedAtUnix
    const otherLeaf = { txid: 'bb'.repeat(32), vout: 1 }

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-21T12:00:00Z'))
    try {
      ensurePersistedUnilateralExitJob(walletScope, [otherLeaf])
      const job = getPersistedUnilateralExitJob(walletScope)
      expect(job.selectedLeafOutpoints).toEqual([otherLeaf])
      expect(job.jobStartedAtUnix).toBe(Math.floor(Date.now() / 1000))
      expect(job.jobStartedAtUnix).not.toBe(started)
      expect(job.currentStepRelayedSinceUnix).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('persistActiveUnilateralExitJob still rewrites timestamps for the same outpoints', () => {
    persistActiveUnilateralExitJob(walletScope, [leaf])
    updatePersistedUnilateralExitRelayWait(walletScope, 1_700_000_000)
    const started = getPersistedUnilateralExitJob(walletScope).jobStartedAtUnix

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-21T12:00:00Z'))
    try {
      persistActiveUnilateralExitJob(walletScope, [leaf])
      const job = getPersistedUnilateralExitJob(walletScope)
      expect(job.jobStartedAtUnix).toBe(Math.floor(Date.now() / 1000))
      expect(job.jobStartedAtUnix).not.toBe(started)
      expect(job.currentStepRelayedSinceUnix).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clearJob resets to an empty job bookmark', () => {
    persistActiveUnilateralExitJob(walletScope, [leaf])
    updatePersistedUnilateralExitRelayWait(walletScope, 1_700_000_000)
    clearPersistedUnilateralExitJob(walletScope)

    expect(getPersistedUnilateralExitJob(walletScope)).toEqual(emptyPersistedUnilateralExitJob)
  })

  it('migratePersistedUnilateralExitJob drops inactive v4 bookmarks even when outpoints remain', () => {
    expect(
      migratePersistedUnilateralExitJob({
        selectedLeafOutpoints: [leaf],
        jobActive: false,
        currentStepRelayedSinceUnix: 1_700_000_000,
        jobStartedAtUnix: 1_700_000_000,
      }),
    ).toEqual(emptyPersistedUnilateralExitJob)

    expect(
      migratePersistedUnilateralExitJob({
        selectedLeafOutpoints: [leaf],
        suppressHydrateResume: true,
        currentStepRelayedSinceUnix: null,
        jobStartedAtUnix: 1_700_000_000,
      }),
    ).toEqual(emptyPersistedUnilateralExitJob)
  })

  it('migratePersistedUnilateralExitJob keeps an active job with outpoints', () => {
    expect(
      migratePersistedUnilateralExitJob({
        selectedLeafOutpoints: [leaf],
        jobActive: true,
        currentStepRelayedSinceUnix: 1_700_000_000,
        jobStartedAtUnix: 1_700_000_000,
      }),
    ).toEqual({
      selectedLeafOutpoints: [leaf],
      currentStepRelayedSinceUnix: 1_700_000_000,
      jobStartedAtUnix: 1_700_000_000,
    })
  })
})
