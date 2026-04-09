export const LAB_DUST_LIMIT_SATS = 546
export const LAB_ESTIMATE_TX_VSIZE_BASE = 10
export const LAB_ESTIMATE_P2WPKH_INPUT_VSIZE = 68
export const LAB_ESTIMATE_P2WPKH_OUTPUT_VSIZE = 34
export const LAB_ESTIMATE_P2WPKH_OUTPUT_COUNT = 2
export const LAB_RANDOM_FEE_RATE_TENTHS_MIN = 1
export const LAB_RANDOM_FEE_RATE_TENTHS_MAX = 100
export const LAB_RANDOM_PPM_MIN = 1
export const LAB_RANDOM_PPM_MAX = 1_000_000

/** Default cap for random lab entity transaction generation attempts (see lab worker). */
export const LAB_RANDOM_TX_MAX_ATTEMPTS_DEFAULT = 500

export function feeRateSatPerVbFromRandomRoll(roll: number): number {
  return roll / 10
}

export function amountSatsFromPpm(totalInputSats: number, ppm: number): number {
  return Math.floor((totalInputSats * ppm) / LAB_RANDOM_PPM_MAX)
}

export function estimateRequiredFeeSats(inputCount: number, feeRateSatPerVb: number): number {
  const estimatedVsize =
    LAB_ESTIMATE_TX_VSIZE_BASE +
    LAB_ESTIMATE_P2WPKH_INPUT_VSIZE * inputCount +
    LAB_ESTIMATE_P2WPKH_OUTPUT_VSIZE * LAB_ESTIMATE_P2WPKH_OUTPUT_COUNT
  return Math.ceil(estimatedVsize * feeRateSatPerVb) + 1
}

export function isRandomAmountViable(
  amountSats: number,
  totalInputSats: number,
  requiredFeeSats: number,
): boolean {
  return amountSats >= LAB_DUST_LIMIT_SATS + requiredFeeSats && amountSats < totalInputSats
}
