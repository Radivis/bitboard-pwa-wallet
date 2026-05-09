/**
 * Esplora `/fee-estimates` + send preset mapping (targets 144 / 6 / 1 blocks).
 * @see https://github.com/Blockstream/esplora/blob/master/API.md
 */

/** Lab or failed-fetch fallback (sat/vB), aligned with mempool-style scale. */
export const NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB = {
  Low: 0.5,
  Medium: 2,
  High: 10,
} as const

export type SendFeePresetLabel =
  keyof typeof NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB

export const MAX_FEE_RATE_SAT_PER_VB = 1_000_000

function isValidPositiveFeeRateSatPerVb(
  maybeRateSatPerVb: unknown,
): maybeRateSatPerVb is number {
  return (
    typeof maybeRateSatPerVb === 'number' &&
    Number.isFinite(maybeRateSatPerVb) &&
    maybeRateSatPerVb > 0
  )
}

/**
 * Parses Esplora `fee-estimates` JSON into strict positive numeric estimates.
 */
export function parseFeeEstimatesJson(raw: unknown): Record<string, number> {
  if (raw === null || typeof raw !== 'object') {
    return {}
  }
  const estimatesByTargetBlocksKey: Record<string, number> = {}
  for (const [confirmationTargetKey, rawFeerate] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (
      /^\d+$/.test(confirmationTargetKey) &&
      isValidPositiveFeeRateSatPerVb(rawFeerate)
    ) {
      const clampedRateSatPerVb = Math.min(
        rawFeerate,
        MAX_FEE_RATE_SAT_PER_VB,
      )
      estimatesByTargetBlocksKey[confirmationTargetKey] = clampedRateSatPerVb
    }
  }
  return estimatesByTargetBlocksKey
}

/**
 * GET `/fee-estimates` from Esplora base URL. Throws on HTTP or JSON failure.
 */
export async function fetchFeeEstimates(esploraBaseUrl: string): Promise<
  Record<string, number>
> {
  const esploraBaseUrlTrimmed = esploraBaseUrl.replace(/\/$/, '')
  const feeEstimatesUrl = `${esploraBaseUrlTrimmed}/fee-estimates`
  const httpResponse = await fetch(feeEstimatesUrl)
  if (!httpResponse.ok) {
    throw new Error(`Fee estimates failed: HTTP ${httpResponse.status}`)
  }
  const responseJson: unknown = await httpResponse.json()
  return parseFeeEstimatesJson(responseJson)
}

/** One entry: confirmation target (blocks) and feerate in sat/vB from Esplora. */
type ConfirmationTargetBlocksAndFeerate = readonly [
  confirmationTargetBlocks: number,
  feerateSatPerVb: number,
]

/**
 * Returns feerate (sat/vB) for confirmation target ~`targetBlocks`:
 * exact key → else smallest available target ≥ requested → else max target’s rate.
 */
export function estimateSatPerVbForTarget(
  estimatesByConfirmationTargetKey: Record<string, number>,
  requestedConfirmationTargetBlocks: number,
): number | null {
  if (
    !Number.isFinite(requestedConfirmationTargetBlocks) ||
    requestedConfirmationTargetBlocks < 1 ||
    requestedConfirmationTargetBlocks !==
      Math.floor(requestedConfirmationTargetBlocks)
  ) {
    return null
  }
  const parsedTargetRatePairs: ConfirmationTargetBlocksAndFeerate[] = []
  for (const [targetBlocksStringKey, feerateSatPerVb] of Object.entries(
    estimatesByConfirmationTargetKey,
  )) {
    const confirmationTargetBlocks = Number(targetBlocksStringKey)
    if (
      Number.isFinite(confirmationTargetBlocks) &&
      Number.isInteger(confirmationTargetBlocks) &&
      confirmationTargetBlocks > 0 &&
      isValidPositiveFeeRateSatPerVb(feerateSatPerVb)
    ) {
      parsedTargetRatePairs.push([confirmationTargetBlocks, feerateSatPerVb])
    }
  }
  if (parsedTargetRatePairs.length === 0) return null

  const exactMatch = parsedTargetRatePairs.find(
    ([confirmationTargetBlocks]) =>
      confirmationTargetBlocks === requestedConfirmationTargetBlocks,
  )
  if (exactMatch != null) return exactMatch[1]

  const targetRatePairsSortedByBlocks = [...parsedTargetRatePairs].sort(
    (pairA, pairB) => pairA[0] - pairB[0],
  )
  const smallestTargetAtOrAboveRequest = targetRatePairsSortedByBlocks.find(
    ([confirmationTargetBlocks]) =>
      confirmationTargetBlocks >= requestedConfirmationTargetBlocks,
  )
  if (smallestTargetAtOrAboveRequest != null) {
    return smallestTargetAtOrAboveRequest[1]
  }

  const highestConfirmationTargetPair =
    targetRatePairsSortedByBlocks[targetRatePairsSortedByBlocks.length - 1]!
  return highestConfirmationTargetPair[1]
}

/** Preset sat/vB for Live (+ regtest/signet/etc. with Esplora) from map or fallback for any missing preset. */
export function pickPresetRatesFromEsploraOrFallback(
  estimatesByConfirmationTargetKey: Record<string, number> | null | undefined,
): Record<SendFeePresetLabel, number> {
  const fallbackRatesSatPerVbByPreset = NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB
  if (
    estimatesByConfirmationTargetKey == null ||
    Object.keys(estimatesByConfirmationTargetKey).length === 0
  ) {
    return {
      Low: fallbackRatesSatPerVbByPreset.Low,
      Medium: fallbackRatesSatPerVbByPreset.Medium,
      High: fallbackRatesSatPerVbByPreset.High,
    }
  }
  return {
    Low:
      estimateSatPerVbForTarget(estimatesByConfirmationTargetKey, 144) ??
      fallbackRatesSatPerVbByPreset.Low,
    Medium:
      estimateSatPerVbForTarget(estimatesByConfirmationTargetKey, 6) ??
      fallbackRatesSatPerVbByPreset.Medium,
    High:
      estimateSatPerVbForTarget(estimatesByConfirmationTargetKey, 1) ??
      fallbackRatesSatPerVbByPreset.High,
  }
}

export function formatSatPerVbTwoDecimals(feerateSatPerVb: number): string {
  if (!Number.isFinite(feerateSatPerVb) || feerateSatPerVb <= 0) {
    return '?'
  }
  return feerateSatPerVb.toFixed(2)
}
