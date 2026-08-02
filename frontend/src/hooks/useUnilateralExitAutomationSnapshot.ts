import { useSyncExternalStore } from 'react'
import { createStableSnapshotGetter } from '@/hooks/lifecycle-snapshot-subscription'
import { defaultUnilateralExitAutomationPrefs } from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import { useUnilateralExitAutomationPrefsStore } from '@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence'
import type { UnilateralExitAutomationSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import {
  getUnilateralExitActorSnapshot,
  subscribeUnilateralExitActor,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime'
import { selectUnilateralExitAutomationSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-selectors'

function unilateralExitAutomationSnapshotEqual(
  previous: UnilateralExitAutomationSnapshot,
  next: UnilateralExitAutomationSnapshot,
): boolean {
  return (
    previous.pausedReason === next.pausedReason &&
    previous.lastErrorMessage === next.lastErrorMessage &&
    previous.scheduling === next.scheduling &&
    previous.prefs.enabled === next.prefs.enabled &&
    previous.prefs.feePresetLabel === next.prefs.feePresetLabel &&
    previous.prefs.maxFeeRateSatPerVb === next.prefs.maxFeeRateSatPerVb
  )
}

function readAutomationSnapshot(): UnilateralExitAutomationSnapshot {
  const actorSnapshot = getUnilateralExitActorSnapshot()
  const scope = actorSnapshot.context.walletScope
  const prefs =
    scope != null
      ? useUnilateralExitAutomationPrefsStore
          .getState()
          .getPrefs(scope.walletId, scope.networkMode, scope.connectionId)
      : defaultUnilateralExitAutomationPrefs()
  return selectUnilateralExitAutomationSnapshot(actorSnapshot, prefs)
}

const getStableUnilateralExitAutomationSnapshot =
  createStableSnapshotGetter<UnilateralExitAutomationSnapshot>(
    readAutomationSnapshot,
    unilateralExitAutomationSnapshotEqual,
  )

export function useUnilateralExitAutomationSnapshot(): UnilateralExitAutomationSnapshot {
  return useSyncExternalStore(
    subscribeUnilateralExitActor,
    getStableUnilateralExitAutomationSnapshot,
    getStableUnilateralExitAutomationSnapshot,
  )
}
