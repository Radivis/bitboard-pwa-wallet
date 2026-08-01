import { useSyncExternalStore } from 'react'
import {
  createStableSnapshotGetter,
  shallowRecordEqual,
} from '@/hooks/lifecycle-snapshot-subscription'
import {
  getUnilateralExitLifecycleSnapshot,
  subscribeUnilateralExitLifecycle,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-orchestrator'
import type { UnilateralExitLifecycleSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'

const getStableUnilateralExitLifecycleSnapshot =
  createStableSnapshotGetter<UnilateralExitLifecycleSnapshot>(
    getUnilateralExitLifecycleSnapshot,
    shallowRecordEqual,
  )

export function useUnilateralExitLifecycleSnapshot(): UnilateralExitLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeUnilateralExitLifecycle,
    getStableUnilateralExitLifecycleSnapshot,
    getStableUnilateralExitLifecycleSnapshot,
  )
}

export function useIsUnilateralExitJobActive(): boolean {
  const snapshot = useUnilateralExitLifecycleSnapshot()
  return (
    snapshot.phase === 'advancing' ||
    snapshot.phase === 'waiting-confirm' ||
    (snapshot.phase === 'idle' && snapshot.selectedLeafOutpoints.length > 0)
  )
}
