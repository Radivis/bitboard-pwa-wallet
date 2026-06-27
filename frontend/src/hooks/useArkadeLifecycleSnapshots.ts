import { createRailLifecycleSnapshotHooks } from '@/hooks/create-rail-lifecycle-snapshot-hooks'
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

const arkadeLifecycleSnapshotHooks = createRailLifecycleSnapshotHooks<
  ArkadeLoadLifecycleSnapshot,
  ArkadeSyncLifecycleSnapshot,
  ArkadeSaveLifecycleSnapshot,
  ArkadeRailSnapshot
>({
  getLoadLifecycleSnapshot: getArkadeLoadLifecycleSnapshot,
  subscribeLoadLifecycle: subscribeArkadeLoadLifecycle,
  getSyncLifecycleSnapshot: getArkadeSyncLifecycleSnapshot,
  subscribeSyncLifecycle: subscribeArkadeSyncLifecycle,
  getSaveLifecycleSnapshot: getArkadeSaveLifecycleSnapshot,
  subscribeSaveLifecycle: subscribeArkadeSaveLifecycle,
  getRailSnapshot: getArkadeRailSnapshot,
})

export const useArkadeLoadLifecycleSnapshot =
  arkadeLifecycleSnapshotHooks.useLoadLifecycleSnapshot
export const useArkadeSyncLifecycleSnapshot =
  arkadeLifecycleSnapshotHooks.useSyncLifecycleSnapshot
export const useArkadeSaveLifecycleSnapshot =
  arkadeLifecycleSnapshotHooks.useSaveLifecycleSnapshot
export const useArkadeRailSnapshot = arkadeLifecycleSnapshotHooks.useRailSnapshot
export const useIsArkadeSessionReady = arkadeLifecycleSnapshotHooks.useIsRailLoaded
