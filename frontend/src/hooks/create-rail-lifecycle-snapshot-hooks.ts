import { useSyncExternalStore } from 'react'
import {
  createStableSnapshotGetter,
  shallowRecordEqual,
} from '@/hooks/lifecycle-snapshot-subscription'
import type {
  LoadLifecyclePhase,
  SaveLifecyclePhase,
  SyncLifecyclePhase,
} from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import type { NetworkMode } from '@/stores/walletStore'

type LoadSnapshotWithPhase = {
  loadPhase: LoadLifecyclePhase
  networkMode: NetworkMode | null
}

type SyncSnapshotWithPhase = {
  syncPhase: SyncLifecyclePhase
}

type SaveSnapshotWithPhase = {
  savePhase: SaveLifecyclePhase
}

export type RailLifecycleSnapshotHookBindings<
  TLoad extends LoadSnapshotWithPhase,
  TSync extends SyncSnapshotWithPhase,
  TSave extends SaveSnapshotWithPhase,
  TRail,
> = {
  getLoadLifecycleSnapshot: () => TLoad
  subscribeLoadLifecycle: (listener: (next: TLoad) => void) => () => void
  getSyncLifecycleSnapshot: () => TSync
  subscribeSyncLifecycle: (listener: (next: TSync) => void) => () => void
  getSaveLifecycleSnapshot: () => TSave
  subscribeSaveLifecycle: (listener: (next: TSave) => void) => () => void
  getRailSnapshot: () => TRail
}

export function createRailLifecycleSnapshotHooks<
  TLoad extends LoadSnapshotWithPhase,
  TSync extends SyncSnapshotWithPhase,
  TSave extends SaveSnapshotWithPhase,
  TRail,
>(
  bindings: RailLifecycleSnapshotHookBindings<TLoad, TSync, TSave, TRail>,
) {
  const getStableLoadLifecycleSnapshot = createStableSnapshotGetter(
    bindings.getLoadLifecycleSnapshot,
    shallowRecordEqual,
  )
  const getStableSyncLifecycleSnapshot = createStableSnapshotGetter(
    bindings.getSyncLifecycleSnapshot,
    shallowRecordEqual,
  )
  const getStableSaveLifecycleSnapshot = createStableSnapshotGetter(
    bindings.getSaveLifecycleSnapshot,
    shallowRecordEqual,
  )

  function useLoadLifecycleSnapshot(): TLoad {
    return useSyncExternalStore(
      bindings.subscribeLoadLifecycle,
      getStableLoadLifecycleSnapshot,
      getStableLoadLifecycleSnapshot,
    )
  }

  function useSyncLifecycleSnapshot(): TSync {
    return useSyncExternalStore(
      bindings.subscribeSyncLifecycle,
      getStableSyncLifecycleSnapshot,
      getStableSyncLifecycleSnapshot,
    )
  }

  function useSaveLifecycleSnapshot(): TSave {
    return useSyncExternalStore(
      bindings.subscribeSaveLifecycle,
      getStableSaveLifecycleSnapshot,
      getStableSaveLifecycleSnapshot,
    )
  }

  function useRailSnapshot(): TRail {
    useLoadLifecycleSnapshot()
    useSyncLifecycleSnapshot()
    useSaveLifecycleSnapshot()
    return bindings.getRailSnapshot()
  }

  function useIsRailLoaded(): boolean {
    const { loadPhase } = useLoadLifecycleSnapshot()
    return loadPhase === 'loaded'
  }

  return {
    useLoadLifecycleSnapshot,
    useSyncLifecycleSnapshot,
    useSaveLifecycleSnapshot,
    useRailSnapshot,
    useIsRailLoaded,
  }
}
