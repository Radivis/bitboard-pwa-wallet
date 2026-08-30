import { describe, expect, it } from 'vitest'
import {
  shouldDeferPersistedUnilateralExitHydrate,
  shouldHydratePersistedUnilateralExitJob,
  shouldLockUnilateralExitLeafSelection,
  canSelectUnilateralExitLeafForUnroll,
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

  it('does not treat leftover WASM in-progress as control-store crash recovery', () => {
    expect(
      shouldHydratePersistedUnilateralExitJob({
        selectedLeafOutpoints: [],
        controlStoreSelectionEmpty: true,
      }),
    ).toBe(false)
  })

  it('locks leaf selection only while a frontend job exists', () => {
    expect(
      shouldLockUnilateralExitLeafSelection({
        lifecycleJobActive: false,
        persistedJobExists: false,
      }),
    ).toBe(false)
    expect(
      shouldLockUnilateralExitLeafSelection({
        lifecycleJobActive: true,
        persistedJobExists: false,
      }),
    ).toBe(true)
    expect(
      shouldLockUnilateralExitLeafSelection({
        lifecycleJobActive: false,
        persistedJobExists: true,
      }),
    ).toBe(true)
  })

  it('does not allow selecting already-unrolled leaves for a new unroll', () => {
    expect(
      canSelectUnilateralExitLeafForUnroll({
        leafOutpoints: [leafA],
        startableOutpoints: [],
        selectionLocked: false,
      }),
    ).toBe(false)
    expect(
      canSelectUnilateralExitLeafForUnroll({
        leafOutpoints: [leafA],
        startableOutpoints: [leafA],
        selectionLocked: false,
      }),
    ).toBe(true)
    expect(
      canSelectUnilateralExitLeafForUnroll({
        leafOutpoints: [leafA],
        startableOutpoints: [leafA],
        selectionLocked: true,
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
