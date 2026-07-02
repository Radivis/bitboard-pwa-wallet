import { useSyncExternalStore } from 'react'
import {
  getLockLifecycleSnapshot,
  subscribeLockLifecycle,
} from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'
import type { LockLifecycleSnapshot } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import {
  createStableSnapshotGetter,
  shallowRecordEqual,
} from '@/hooks/lifecycle-snapshot-subscription'

const getStableLockLifecycleSnapshot = createStableSnapshotGetter(
  getLockLifecycleSnapshot,
  shallowRecordEqual,
)

export function useLockLifecycleSnapshot(): LockLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeLockLifecycle,
    getStableLockLifecycleSnapshot,
    getStableLockLifecycleSnapshot,
  )
}
