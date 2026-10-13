import type { SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'
import {
  defaultMaxFeeRateSatPerVb,
  resolveAutomatedStepFeeRateSatPerVb,
} from '@/lib/onchain/automated-step-fee-rate'
import type { BarkEmergencyExitAutomationPauseReason } from '@/stores/barkEmergencyExitAutomationStore'

export const BARK_EMERGENCY_EXIT_AUTOMATION_PAUSE_LABELS: Record<
  BarkEmergencyExitAutomationPauseReason,
  string
> = {
  feeCapExceeded: 'Automatic proceeding paused: live fee rate exceeds your maximum.',
  fundsInsufficient: 'Automatic proceeding paused: insufficient on-chain funds.',
}

export function effectiveBarkEmergencyExitMaxFeeRate(
  storedMaxFeeRateSatPerVb: number | null,
  highPresetSatPerVb: number,
): number {
  return storedMaxFeeRateSatPerVb ?? defaultMaxFeeRateSatPerVb(highPresetSatPerVb)
}

export type BarkEmergencyExitAutomatedFeeDecision =
  | { action: 'progress'; feeRateSatPerVb: number }
  | { action: 'paused'; pausedReason: BarkEmergencyExitAutomationPauseReason }

/**
 * One automatic step. An existing pause is kept without re-reading Esplora.
 * Otherwise the live preset is locked for this call, or the step pauses when
 * that preset is above the max.
 */
export function decideBarkEmergencyExitAutomatedFee(params: {
  pausedReason: BarkEmergencyExitAutomationPauseReason | null
  feePresetLabel: SendFeePresetLabel
  presetSatPerVbByLabel: Record<SendFeePresetLabel, number>
  storedMaxFeeRateSatPerVb: number | null
}): BarkEmergencyExitAutomatedFeeDecision {
  if (params.pausedReason != null) {
    return { action: 'paused', pausedReason: params.pausedReason }
  }
  const maxFeeRateSatPerVb = effectiveBarkEmergencyExitMaxFeeRate(
    params.storedMaxFeeRateSatPerVb,
    params.presetSatPerVbByLabel.High,
  )
  const resolution = resolveAutomatedStepFeeRateSatPerVb(
    params.feePresetLabel,
    params.presetSatPerVbByLabel,
    maxFeeRateSatPerVb,
  )
  if (resolution.capExceeded) {
    return { action: 'paused', pausedReason: 'feeCapExceeded' }
  }
  return { action: 'progress', feeRateSatPerVb: resolution.feeRateSatPerVb }
}
