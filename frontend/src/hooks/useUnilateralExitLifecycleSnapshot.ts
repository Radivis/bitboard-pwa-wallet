import { useSyncExternalStore } from 'react'
import {
  createStableSnapshotGetter,
  shallowRecordEqual,
} from '@/hooks/lifecycle-snapshot-subscription'
import type { UnilateralExitLifecycleSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import {
  getUnilateralExitActorSnapshot,
  getVtxoExitChildSnapshotMap,
  subscribeUnilateralExitActor,
  subscribeVtxoExitChildren,
  vtxoExitChildSnapshotMapEqual,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime'
import {
  selectIsUnilateralExitJobActive,
  selectUnilateralExitLifecycleSnapshot,
  type UnilateralExitActorSnapshot,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-selectors'
import { unilateralExitActorSnapshotEqual } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-snapshot'
import type { VtxoExitChildSnapshotMap } from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit-machine-types'

function readLifecycleSnapshot(): UnilateralExitLifecycleSnapshot {
  return selectUnilateralExitLifecycleSnapshot(getUnilateralExitActorSnapshot())
}

const getStableUnilateralExitLifecycleSnapshot =
  createStableSnapshotGetter<UnilateralExitLifecycleSnapshot>(
    readLifecycleSnapshot,
    shallowRecordEqual,
  )

const getStableUnilateralExitActorSnapshot =
  createStableSnapshotGetter<UnilateralExitActorSnapshot>(
    getUnilateralExitActorSnapshot,
    unilateralExitActorSnapshotEqual,
  )

const getStableVtxoExitChildSnapshotMap =
  createStableSnapshotGetter<VtxoExitChildSnapshotMap>(
    getVtxoExitChildSnapshotMap,
    vtxoExitChildSnapshotMapEqual,
  )

export function useUnilateralExitLifecycleSnapshot(): UnilateralExitLifecycleSnapshot {
  return useSyncExternalStore(
    subscribeUnilateralExitActor,
    getStableUnilateralExitLifecycleSnapshot,
    getStableUnilateralExitLifecycleSnapshot,
  )
}

export function useUnilateralExitActorSnapshot(): UnilateralExitActorSnapshot {
  return useSyncExternalStore(
    subscribeUnilateralExitActor,
    getStableUnilateralExitActorSnapshot,
    getStableUnilateralExitActorSnapshot,
  )
}

export function useVtxoExitSnapshots(): VtxoExitChildSnapshotMap {
  return useSyncExternalStore(
    subscribeVtxoExitChildren,
    getStableVtxoExitChildSnapshotMap,
    getStableVtxoExitChildSnapshotMap,
  )
}

export function useIsUnilateralExitJobActive(): boolean {
  const actorSnapshot = useUnilateralExitActorSnapshot()
  return selectIsUnilateralExitJobActive(actorSnapshot)
}
