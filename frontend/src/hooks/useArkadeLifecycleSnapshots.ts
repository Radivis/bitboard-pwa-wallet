import { useMemo, useSyncExternalStore } from 'react'
import { getArkadeRailSnapshot } from '@/lib/wallet/lifecycle/arkade-rail-snapshot'
import {
  getArkadeLoadLifecycleSnapshot,
  subscribeArkadeLoadLifecycle,
} from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import {
  getArkadeSaveLifecycleSnapshot,
  subscribeArkadeSaveLifecycle,
} from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import {
  getArkadeSyncLifecycleSnapshot,
  subscribeArkadeSyncLifecycle,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import type { ArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-types'
import type { ArkadeSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-types'
import type { ArkadeSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-types'
import type { ArkadeRailSnapshot } from '@/lib/wallet/lifecycle/arkade-rail-snapshot'
import {
  createStableSnapshotGetter,
  shallowRecordEqual,
} from '@/hooks/lifecycle-snapshot-subscription'

const getStableArkadeLoadLifecycleSnapshot = createStableSnapshotGetter(
  getArkadeLoadLifecycleSnapshot,
  shallowRecordEqual,
)
const getStableArkadeSyncLifecycleSnapshot = createStableSnapshotGetter(
  getArkadeSyncLifecycleSnapshot,
  shallowRecordEqual,
)
const getStableArkadeSaveLifecycleSnapshot = createStableSnapshotGetter(
  getArkadeSaveLifecycleSnapshot,
  shallowRecordEqual,
)

export function useArkadeLoadLifecycleSnapshot(): ArkadeLoadLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeArkadeLoadLifecycle,
    getStableArkadeLoadLifecycleSnapshot,
    getStableArkadeLoadLifecycleSnapshot,
  )
}

export function useArkadeSyncLifecycleSnapshot(): ArkadeSyncLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeArkadeSyncLifecycle,
    getStableArkadeSyncLifecycleSnapshot,
    getStableArkadeSyncLifecycleSnapshot,
  )
}

export function useArkadeSaveLifecycleSnapshot(): ArkadeSaveLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeArkadeSaveLifecycle,
    getStableArkadeSaveLifecycleSnapshot,
    getStableArkadeSaveLifecycleSnapshot,
  )
}

export function useArkadeRailSnapshot(): ArkadeRailSnapshot {
  const loadSnapshot = useArkadeLoadLifecycleSnapshot()
  const syncSnapshot = useArkadeSyncLifecycleSnapshot()
  const saveSnapshot = useArkadeSaveLifecycleSnapshot()
  return useMemo(
    () => getArkadeRailSnapshot(),
    [
      loadSnapshot.loadPhase,
      loadSnapshot.networkMode,
      syncSnapshot.syncPhase,
      saveSnapshot.savePhase,
    ],
  )
}

export function useIsArkadeSessionReady(): boolean {
  const { loadPhase } = useArkadeLoadLifecycleSnapshot()
  return loadPhase === 'loaded'
}
