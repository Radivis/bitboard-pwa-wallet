import type { SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'

/** Default max fee cap when enabling automatic proceeding. */
export function defaultMaxFeeRateSatPerVb(highPresetSatPerVb: number): number {
  return Math.max(10, highPresetSatPerVb * 2)
}

export type ResolvedAutomatedStepFeeRate = {
  feeRateSatPerVb: number
  capExceeded: boolean
}

/**
 * Resolves the fee rate for one automated unilateral-exit step.
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
