import { useMemo, useSyncExternalStore } from 'react'
import { getOnchainRailSnapshot } from '@/lib/wallet/lifecycle/onchain-rail-snapshot'
import {
  getOnchainLoadLifecycleSnapshot,
  subscribeOnchainLoadLifecycle,
} from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import {
  getOnchainSaveLifecycleSnapshot,
  subscribeOnchainSaveLifecycle,
} from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import {
  getOnchainSyncLifecycleSnapshot,
  subscribeOnchainSyncLifecycle,
} from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import type { OnchainLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-types'
import type { OnchainSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-types'
import type { OnchainSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-types'
import type { OnchainRailSnapshot } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import {
  createStableSnapshotGetter,
  shallowRecordEqual,
} from '@/hooks/lifecycle-snapshot-subscription'

const getStableOnchainLoadLifecycleSnapshot = createStableSnapshotGetter(
  getOnchainLoadLifecycleSnapshot,
  shallowRecordEqual,
)
const getStableOnchainSyncLifecycleSnapshot = createStableSnapshotGetter(
  getOnchainSyncLifecycleSnapshot,
  shallowRecordEqual,
)
const getStableOnchainSaveLifecycleSnapshot = createStableSnapshotGetter(
  getOnchainSaveLifecycleSnapshot,
  shallowRecordEqual,
)

export function useOnchainLoadLifecycleSnapshot(): OnchainLoadLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeOnchainLoadLifecycle,
    getStableOnchainLoadLifecycleSnapshot,
    getStableOnchainLoadLifecycleSnapshot,
  )
}

export function useOnchainSyncLifecycleSnapshot(): OnchainSyncLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeOnchainSyncLifecycle,
    getStableOnchainSyncLifecycleSnapshot,
    getStableOnchainSyncLifecycleSnapshot,
  )
}

export function useOnchainSaveLifecycleSnapshot(): OnchainSaveLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeOnchainSaveLifecycle,
    getStableOnchainSaveLifecycleSnapshot,
    getStableOnchainSaveLifecycleSnapshot,
  )
}

export function useOnchainRailSnapshot(): OnchainRailSnapshot {
  const loadSnapshot = useOnchainLoadLifecycleSnapshot()
  const syncSnapshot = useOnchainSyncLifecycleSnapshot()
  const saveSnapshot = useOnchainSaveLifecycleSnapshot()
  return useMemo(
    () => getOnchainRailSnapshot(),
    [
      loadSnapshot.loadPhase,
      loadSnapshot.networkMode,
      syncSnapshot.syncPhase,
      saveSnapshot.savePhase,
    ],
  )
}

export function useIsOnchainRailLoaded(): boolean {
  const { loadPhase } = useOnchainLoadLifecycleSnapshot()
  return loadPhase === 'loaded'
}
