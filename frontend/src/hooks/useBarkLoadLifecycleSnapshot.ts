import { useSyncExternalStore } from 'react'
import {
  createStableSnapshotGetter,
  shallowRecordEqual,
} from '@/hooks/lifecycle-snapshot-subscription'
import {
  getBarkLoadLifecycleSnapshot,
  subscribeBarkLoadLifecycle,
} from '@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator'
import type { BarkLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/bark-load-lifecycle-types'

const getStableBarkLoadLifecycleSnapshot = createStableSnapshotGetter(
  getBarkLoadLifecycleSnapshot,
  shallowRecordEqual<BarkLoadLifecycleSnapshot>,
)

export function useBarkLoadLifecycleSnapshot(): BarkLoadLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeBarkLoadLifecycle,
    getStableBarkLoadLifecycleSnapshot,
    getStableBarkLoadLifecycleSnapshot,
  )
}
