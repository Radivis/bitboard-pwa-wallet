import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPersistedUnilateralExitJob,
  getPersistedUnilateralExitJob,
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

  it('updatePersistedUnilateralExitRelayWait round-trip', () => {
    persistActiveUnilateralExitJob(walletScope, [leaf])
    updatePersistedUnilateralExitRelayWait(walletScope, 1_700_000_000)

    const job = getPersistedUnilateralExitJob(walletScope)
    expect(job.currentStepRelayedSinceUnix).toBe(1_700_000_000)
    expect(job.selectedLeafOutpoints).toEqual([leaf])
    expect(job.jobActive).toBe(true)

    updatePersistedUnilateralExitRelayWait(walletScope, null)
    expect(getPersistedUnilateralExitJob(walletScope).currentStepRelayedSinceUnix).toBeNull()
  })

  it('clearJob resets relay wait timestamp', () => {
    persistActiveUnilateralExitJob(walletScope, [leaf])
    updatePersistedUnilateralExitRelayWait(walletScope, 1_700_000_000)
    clearPersistedUnilateralExitJob(walletScope)

    const job = getPersistedUnilateralExitJob(walletScope)
    expect(job).toEqual({
      selectedLeafOutpoints: [],
      jobActive: false,
      currentStepRelayedSinceUnix: null,
    })
  })
})
