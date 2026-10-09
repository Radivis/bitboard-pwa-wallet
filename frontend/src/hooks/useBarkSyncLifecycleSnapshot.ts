import { useSyncExternalStore } from 'react'
import {
  createStableSnapshotGetter,
  shallowRecordEqual,
} from '@/hooks/lifecycle-snapshot-subscription'
import {
  getBarkSyncLifecycleSnapshot,
  subscribeBarkSyncLifecycle,
} from '@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator'
import type { BarkSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator'

const getStableBarkSyncLifecycleSnapshot = createStableSnapshotGetter(
  getBarkSyncLifecycleSnapshot,
  shallowRecordEqual<BarkSyncLifecycleSnapshot>,
)

export function useBarkSyncLifecycleSnapshot(): BarkSyncLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeBarkSyncLifecycle,
    getStableBarkSyncLifecycleSnapshot,
    getStableBarkSyncLifecycleSnapshot,
  )
}
