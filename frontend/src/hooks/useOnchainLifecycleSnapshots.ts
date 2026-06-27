import { useMemo, useSyncExternalStore } from 'react'
import { createRailLifecycleSnapshotHooks } from '@/hooks/create-rail-lifecycle-snapshot-hooks'
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

const onchainLifecycleSnapshotHooks = createRailLifecycleSnapshotHooks<
  OnchainLoadLifecycleSnapshot,
  OnchainSyncLifecycleSnapshot,
  OnchainSaveLifecycleSnapshot,
  OnchainRailSnapshot
>({
  getLoadLifecycleSnapshot: getOnchainLoadLifecycleSnapshot,
  subscribeLoadLifecycle: subscribeOnchainLoadLifecycle,
  getSyncLifecycleSnapshot: getOnchainSyncLifecycleSnapshot,
  subscribeSyncLifecycle: subscribeOnchainSyncLifecycle,
  getSaveLifecycleSnapshot: getOnchainSaveLifecycleSnapshot,
  subscribeSaveLifecycle: subscribeOnchainSaveLifecycle,
  getRailSnapshot: getOnchainRailSnapshot,
})

export const useOnchainLoadLifecycleSnapshot =
  onchainLifecycleSnapshotHooks.useLoadLifecycleSnapshot
export const useOnchainSyncLifecycleSnapshot =
  onchainLifecycleSnapshotHooks.useSyncLifecycleSnapshot
export const useOnchainSaveLifecycleSnapshot =
  onchainLifecycleSnapshotHooks.useSaveLifecycleSnapshot
export const useOnchainRailSnapshot = onchainLifecycleSnapshotHooks.useRailSnapshot
export const useIsOnchainRailLoaded = onchainLifecycleSnapshotHooks.useIsRailLoaded
