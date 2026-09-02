import { useSyncExternalStore } from 'react'
import {
  createStableSnapshotGetter,
  shallowRecordEqual,
} from '@/hooks/lifecycle-snapshot-subscription'
import { defaultUnilateralExitAutomationPrefs } from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import { useUnilateralExitAutomationPrefsStore } from '@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence'
import type { UnilateralExitLifecycleSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import {
  getUnilateralExitActorSnapshot,
  subscribeUnilateralExitActor,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime'
import {
  selectIsUnilateralExitJobActive,
  selectUnilateralExitLifecycleSnapshot,
  type UnilateralExitActorSnapshot,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-selectors'
import { unilateralExitActorSnapshotEqual } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-snapshot'

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

export function useIsUnilateralExitJobActive(): boolean {
  const actorSnapshot = useUnilateralExitActorSnapshot()
  return selectIsUnilateralExitJobActive(actorSnapshot)
}

export function useUnilateralExitAutomationPrefsForActor() {
  const actorSnapshot = useUnilateralExitActorSnapshot()
  const scope = actorSnapshot.context.walletScope
  if (scope == null) {
    return defaultUnilateralExitAutomationPrefs()
  }
  return useUnilateralExitAutomationPrefsStore
    .getState()
    .getPrefs(scope.walletId, scope.networkMode, scope.arkadeAccountId)
}
