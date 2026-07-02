import { createRailLifecycleSnapshotHooks } from '@/hooks/create-rail-lifecycle-snapshot-hooks'
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

const lightningLifecycleSnapshotHooks = createRailLifecycleSnapshotHooks<
  LightningLoadLifecycleSnapshot,
  LightningSyncLifecycleSnapshot,
  LightningSaveLifecycleSnapshot,
  LightningRailSnapshot
>({
  getLoadLifecycleSnapshot: getLightningLoadLifecycleSnapshot,
  subscribeLoadLifecycle: subscribeLightningLoadLifecycle,
  getSyncLifecycleSnapshot: getLightningSyncLifecycleSnapshot,
  subscribeSyncLifecycle: subscribeLightningSyncLifecycle,
  getSaveLifecycleSnapshot: getLightningSaveLifecycleSnapshot,
  subscribeSaveLifecycle: subscribeLightningSaveLifecycle,
  getRailSnapshot: getLightningRailSnapshot,
})

export const useLightningLoadLifecycleSnapshot =
  lightningLifecycleSnapshotHooks.useLoadLifecycleSnapshot
export const useLightningSyncLifecycleSnapshot =
  lightningLifecycleSnapshotHooks.useSyncLifecycleSnapshot
export const useLightningSaveLifecycleSnapshot =
  lightningLifecycleSnapshotHooks.useSaveLifecycleSnapshot
export const useLightningRailSnapshot = lightningLifecycleSnapshotHooks.useRailSnapshot
export const useIsLightningRailLoaded = lightningLifecycleSnapshotHooks.useIsRailLoaded
