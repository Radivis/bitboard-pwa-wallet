import type { SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'
import { arkadeWalletScopeKey, type ArkadeWalletScope } from '@/lib/arkade/arkade-session-scope'

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
  scope: Pick<ArkadeWalletScope, 'walletId' | 'networkMode' | 'arkadeAccountId'>,
): string {
  return arkadeWalletScopeKey(scope)
}
