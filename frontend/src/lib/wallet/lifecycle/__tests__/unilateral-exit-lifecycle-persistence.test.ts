import { beforeEach, describe, expect, it } from 'vitest'
import { persistedUnilateralExitJobExists } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import {
  clearPersistedUnilateralExitJob,
  emptyPersistedUnilateralExitJob,
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
    useUnilateralExitLifecyclePersistenceStore.setState({ jobsByKey: {} })
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
