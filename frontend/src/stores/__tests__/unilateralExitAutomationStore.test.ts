import { beforeEach, describe, expect, it } from 'vitest'
import {
  unilateralExitAutomationJobKey,
  useUnilateralExitAutomationStore,
} from '@/stores/unilateralExitAutomationStore'

const walletId = 1
const networkMode = 'regtest' as const
const arkadeConnectionId = 'conn-a'
const leafA = { txid: 'aa'.repeat(32), vout: 0 }

describe('unilateralExitAutomationStore', () => {
  beforeEach(() => {
    useUnilateralExitAutomationStore.setState({ jobsByKey: {} })
  })

  it('builds stable job keys', () => {
    expect(unilateralExitAutomationJobKey(walletId, networkMode, arkadeConnectionId)).toBe(
      '1:regtest:conn-a',
    )
  })

  it('sets default max fee when enabling proceed automatically', () => {
    const store = useUnilateralExitAutomationStore.getState()
    store.setProceedAutomatically(walletId, networkMode, arkadeConnectionId, true, 20)

    const job = store.getJob(walletId, networkMode, arkadeConnectionId)
    expect(job.proceedAutomatically).toBe(true)
    expect(job.maxFeeRateSatPerVb).toBe(20)
  })

  it('starts job with sorted outpoints and clears pause', () => {
    const store = useUnilateralExitAutomationStore.getState()
    store.pauseJob(walletId, networkMode, arkadeConnectionId, 'feeCapExceeded', 'too high')
    store.startJob(walletId, networkMode, arkadeConnectionId, [leafA], false)

    const job = store.getJob(walletId, networkMode, arkadeConnectionId)
    expect(job.jobStarted).toBe(true)
    expect(job.proceedAutomatically).toBe(false)
    expect(job.selectedLeafOutpoints).toEqual([leafA])
    expect(job.pausedReason).toBeUndefined()
  })

  it('startJob records explicit proceed automatically flag', () => {
    const store = useUnilateralExitAutomationStore.getState()
    store.setProceedAutomatically(walletId, networkMode, arkadeConnectionId, true, 20)
    store.startJob(walletId, networkMode, arkadeConnectionId, [leafA], false)

    const job = store.getJob(walletId, networkMode, arkadeConnectionId)
    expect(job.proceedAutomatically).toBe(false)
    expect(job.jobStarted).toBe(true)
  })

  it('disabling proceed automatically while job is active records userDisabled pause', () => {
    const store = useUnilateralExitAutomationStore.getState()
    store.setProceedAutomatically(walletId, networkMode, arkadeConnectionId, true, 20)
    store.startJob(walletId, networkMode, arkadeConnectionId, [leafA], true)
    store.setProceedAutomatically(walletId, networkMode, arkadeConnectionId, false)

    const job = store.getJob(walletId, networkMode, arkadeConnectionId)
    expect(job.proceedAutomatically).toBe(false)
    expect(job.pausedReason).toBe('userDisabled')
  })

  it('pauseJob records reason and message', () => {
    const store = useUnilateralExitAutomationStore.getState()
    store.startJob(walletId, networkMode, arkadeConnectionId, [leafA], false)
    store.pauseJob(walletId, networkMode, arkadeConnectionId, 'bumperInsufficient')

    const job = store.getJob(walletId, networkMode, arkadeConnectionId)
    expect(job.pausedReason).toBe('bumperInsufficient')
  })

  it('completeJob resets automation flags', () => {
    const store = useUnilateralExitAutomationStore.getState()
    store.setProceedAutomatically(walletId, networkMode, arkadeConnectionId, true, 20)
    store.startJob(walletId, networkMode, arkadeConnectionId, [leafA], false)
    store.completeJob(walletId, networkMode, arkadeConnectionId)

    const job = store.getJob(walletId, networkMode, arkadeConnectionId)
    expect(job.jobStarted).toBe(false)
    expect(job.proceedAutomatically).toBe(false)
  })

  it('hydrateJobFromPersisted returns active jobs only', () => {
    const store = useUnilateralExitAutomationStore.getState()
    expect(store.hydrateJobFromPersisted(walletId, networkMode, arkadeConnectionId)).toBeNull()

    store.startJob(walletId, networkMode, arkadeConnectionId, [leafA], false)
    const hydrated = store.hydrateJobFromPersisted(walletId, networkMode, arkadeConnectionId)
    expect(hydrated?.selectedLeafOutpoints).toEqual([leafA])
  })

  it('keeps proceed automatically preference across persisted job state', () => {
    const store = useUnilateralExitAutomationStore.getState()
    store.setProceedAutomatically(walletId, networkMode, arkadeConnectionId, true, 20)
    store.startJob(walletId, networkMode, arkadeConnectionId, [leafA], true)

    const persisted = useUnilateralExitAutomationStore.getState().jobsByKey[
      unilateralExitAutomationJobKey(walletId, networkMode, arkadeConnectionId)
    ]

    useUnilateralExitAutomationStore.setState({ jobsByKey: {} })
    useUnilateralExitAutomationStore.setState({
      jobsByKey: {
        [unilateralExitAutomationJobKey(walletId, networkMode, arkadeConnectionId)]: persisted,
      },
    })

    const job = store.getJob(walletId, networkMode, arkadeConnectionId)
    expect(job.proceedAutomatically).toBe(true)
    expect(job.jobStarted).toBe(true)
  })
})
