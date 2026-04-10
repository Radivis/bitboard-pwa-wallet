export const LAB_DUST_LIMIT_SATS = 546
export const LAB_ESTIMATE_TX_VSIZE_BASE = 10
export const LAB_ESTIMATE_P2WPKH_INPUT_VSIZE = 68
export const LAB_ESTIMATE_P2WPKH_OUTPUT_VSIZE = 34
export const LAB_ESTIMATE_P2WPKH_OUTPUT_COUNT = 2
export const LAB_RANDOM_FEE_RATE_TENTHS_MIN = 1
export const LAB_RANDOM_FEE_RATE_TENTHS_MAX = 100

/** Scales log-span to σ; larger divisor ⇒ tighter spread. */
export const LAB_RANDOM_AMOUNT_LOG_SIGMA_DIVISOR = 4
export const LAB_RANDOM_AMOUNT_LOG_SIGMA_MIN = 0.15
export const LAB_RANDOM_AMOUNT_LOG_SIGMA_MAX = 2

/** Default cap for random lab entity transaction generation attempts (see lab worker). */
export const LAB_RANDOM_TX_MAX_ATTEMPTS_DEFAULT = 500

export function feeRateSatPerVbFromRandomRoll(roll: number): number {
  return roll / 10
}

/** Standard normal N(0,1) via Box–Muller (uses `Math.random`). */
export function randomStandardNormal(): number {
  const u1 = Math.max(Number.EPSILON, Math.random())
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/**
 * One log-normal draw for recipient amount (sats). Returns null if the feasible range is empty
 * or the draw falls outside [dust+fee, totalInput−fee] (caller rerolls the whole random tx).
 */
export function sampleRandomLabAmountSats(
  totalInputSats: number,
  requiredFeeSats: number,
): number | null {
  const minAmount = LAB_DUST_LIMIT_SATS + requiredFeeSats
  const maxAmount = totalInputSats - requiredFeeSats
  if (minAmount > maxAmount) return null

  const logMin = Math.log(minAmount)
  const logMax = Math.log(maxAmount)
  const mu = (logMin + logMax) / 2
  const logSpan = logMax - logMin
  const sigma = Math.max(
    LAB_RANDOM_AMOUNT_LOG_SIGMA_MIN,
    Math.min(
      LAB_RANDOM_AMOUNT_LOG_SIGMA_MAX,
      logSpan / LAB_RANDOM_AMOUNT_LOG_SIGMA_DIVISOR,
    ),
  )

  const z = randomStandardNormal()
  const candidate = Math.floor(Math.exp(mu + sigma * z))

  if (candidate < minAmount || candidate > maxAmount) return null
  return candidate
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
  const minAmount = LAB_DUST_LIMIT_SATS + requiredFeeSats
  const maxAmount = totalInputSats - requiredFeeSats
  return amountSats >= minAmount && amountSats <= maxAmount
}
