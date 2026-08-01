import { useSyncExternalStore } from 'react'
import {
  createStableSnapshotGetter,
} from '@/hooks/lifecycle-snapshot-subscription'
import {
  getUnilateralExitAutomationSnapshot,
  subscribeUnilateralExitAutomation,
} from '@/lib/wallet/lifecycle/unilateral-exit-automation-controller'
import type { UnilateralExitAutomationSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'

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

const getStableUnilateralExitAutomationSnapshot =
  createStableSnapshotGetter<UnilateralExitAutomationSnapshot>(
    getUnilateralExitAutomationSnapshot,
    unilateralExitAutomationSnapshotEqual,
  )

export function useUnilateralExitAutomationSnapshot(): UnilateralExitAutomationSnapshot {
  return useSyncExternalStore(
    subscribeUnilateralExitAutomation,
    getStableUnilateralExitAutomationSnapshot,
    getStableUnilateralExitAutomationSnapshot,
  )
}
