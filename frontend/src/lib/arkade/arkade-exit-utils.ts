export interface ArkadeIntentFeeConfigured {
  offchainInput: boolean
  onchainInput: boolean
  offchainOutput: boolean
  onchainOutput: boolean
}

export function formatIntentFeePrograms(configured: ArkadeIntentFeeConfigured): string {
  const labels: string[] = []
  if (configured.offchainInput) labels.push('offchain inputs')
  if (configured.onchainInput) labels.push('onchain inputs')
  if (configured.offchainOutput) labels.push('offchain outputs')
  if (configured.onchainOutput) labels.push('onchain outputs')
  if (labels.length === 0) return 'none configured'
  return labels.join(', ')
}

/** Fallback bumper threshold when unilateral fee estimate is unavailable (sats). */
export const ARKADE_BUMPER_LOW_BALANCE_FALLBACK_SATS = 1_000
