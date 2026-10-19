import type { SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'

/** Shown when the live preset for automatic proceeding is above the user's max. */
export const AUTOMATIC_PROCEEDING_FEE_CAP_EXCEEDED_LABEL =
  'Automatic proceeding paused: live fee rate exceeds your maximum.'

/** Default max fee cap when enabling automatic proceeding. */
export function defaultMaxFeeRateSatPerVb(highPresetSatPerVb: number): number {
  return Math.max(10, highPresetSatPerVb * 2)
}

export type ResolvedAutomatedStepFeeRate = {
  feeRateSatPerVb: number
  capExceeded: boolean
}

/**
 * Resolves the fee rate for one automated step.
 * Pauses (capExceeded) when the live preset for the selected degree exceeds the max cap.
 */
export function resolveAutomatedStepFeeRateSatPerVb(
  presetLabel: SendFeePresetLabel,
  presetSatPerVbByLabel: Record<SendFeePresetLabel, number>,
  maxFeeRateSatPerVb: number,
): ResolvedAutomatedStepFeeRate {
  const livePresetRate = presetSatPerVbByLabel[presetLabel]
  if (livePresetRate > maxFeeRateSatPerVb) {
    return { feeRateSatPerVb: livePresetRate, capExceeded: true }
  }
  return { feeRateSatPerVb: livePresetRate, capExceeded: false }
}
