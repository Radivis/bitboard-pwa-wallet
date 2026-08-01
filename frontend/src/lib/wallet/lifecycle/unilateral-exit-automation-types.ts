import type { SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'
import type { UnilateralExitWalletScope } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import { unilateralExitWalletScopeKey } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'

export type UnilateralExitAutomationPausedReason =
  | 'feeCapExceeded'
  | 'bumperInsufficient'
  | 'error'
  | 'userDisabled'

export type UnilateralExitAutomationPrefs = {
  enabled: boolean
  feePresetLabel: SendFeePresetLabel
  maxFeeRateSatPerVb: number
}

export type UnilateralExitAutomationSnapshot = {
  prefs: UnilateralExitAutomationPrefs
  pausedReason: UnilateralExitAutomationPausedReason | null
  lastErrorMessage: string | null
  scheduling: 'idle' | 'scheduled' | 'paused'
}

export function defaultUnilateralExitAutomationPrefs(): UnilateralExitAutomationPrefs {
  return {
    enabled: false,
    feePresetLabel: 'Medium',
    maxFeeRateSatPerVb: 10,
  }
}

export function unilateralExitAutomationPrefsKey(
  scope: Pick<UnilateralExitWalletScope, 'walletId' | 'networkMode' | 'connectionId'>,
): string {
  return unilateralExitWalletScopeKey(scope)
}
