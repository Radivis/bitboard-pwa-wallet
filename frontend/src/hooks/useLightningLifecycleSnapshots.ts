import { useMemo, useSyncExternalStore } from 'react'
import { getLightningRailSnapshot } from '@/lib/wallet/lifecycle/lightning-rail-snapshot'
import {
  getLightningLoadLifecycleSnapshot,
  subscribeLightningLoadLifecycle,
} from '@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator'
import {
  getLightningSaveLifecycleSnapshot,
  subscribeLightningSaveLifecycle,
} from '@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator'
import {
  getLightningSyncLifecycleSnapshot,
  subscribeLightningSyncLifecycle,
} from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import type { LightningLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/lightning-load-lifecycle-types'
import type { LightningSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/lightning-save-lifecycle-types'
import type { LightningSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-types'
import type { LightningRailSnapshot } from '@/lib/wallet/lifecycle/lightning-rail-snapshot'
import {
  createStableSnapshotGetter,
  shallowRecordEqual,
} from '@/hooks/lifecycle-snapshot-subscription'

const getStableLightningLoadLifecycleSnapshot = createStableSnapshotGetter(
  getLightningLoadLifecycleSnapshot,
  shallowRecordEqual,
)
const getStableLightningSyncLifecycleSnapshot = createStableSnapshotGetter(
  getLightningSyncLifecycleSnapshot,
  shallowRecordEqual,
)
const getStableLightningSaveLifecycleSnapshot = createStableSnapshotGetter(
  getLightningSaveLifecycleSnapshot,
  shallowRecordEqual,
)

export function useLightningLoadLifecycleSnapshot(): LightningLoadLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeLightningLoadLifecycle,
    getStableLightningLoadLifecycleSnapshot,
    getStableLightningLoadLifecycleSnapshot,
  )
}

export function useLightningSyncLifecycleSnapshot(): LightningSyncLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeLightningSyncLifecycle,
    getStableLightningSyncLifecycleSnapshot,
    getStableLightningSyncLifecycleSnapshot,
  )
}

export function useLightningSaveLifecycleSnapshot(): LightningSaveLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeLightningSaveLifecycle,
    getStableLightningSaveLifecycleSnapshot,
    getStableLightningSaveLifecycleSnapshot,
  )
}

export function useLightningRailSnapshot(): LightningRailSnapshot {
  const loadSnapshot = useLightningLoadLifecycleSnapshot()
  const syncSnapshot = useLightningSyncLifecycleSnapshot()
  const saveSnapshot = useLightningSaveLifecycleSnapshot()
  return useMemo(
    () => getLightningRailSnapshot(),
    [
      loadSnapshot.loadPhase,
      loadSnapshot.networkMode,
      syncSnapshot.syncPhase,
      saveSnapshot.savePhase,
    ],
  )
}

export function useIsLightningRailLoaded(): boolean {
  const { loadPhase } = useLightningLoadLifecycleSnapshot()
  return loadPhase === 'loaded'
}
