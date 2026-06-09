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

const COLLABORATIVE_EXIT_AMOUNT_HELP =
  'Enter a whole number of satoshis, or leave empty for full balance.'

export type CollaborativeExitAmountParseResult =
  | { ok: true; amountSats: number | undefined }
  | { ok: false; message: string }

export function parseCollaborativeExitAmountSats(
  rawAmount: string,
): CollaborativeExitAmountParseResult {
  const trimmed = rawAmount.trim()
  if (trimmed === '') {
    return { ok: true, amountSats: undefined }
  }

  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, message: COLLABORATIVE_EXIT_AMOUNT_HELP }
  }

  const amountSats = Number(trimmed)
  if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
    return { ok: false, message: COLLABORATIVE_EXIT_AMOUNT_HELP }
  }

  return { ok: true, amountSats }
}

export function formatUnilateralUnrollSuccessMessage(vtxoTxid: string): string {
  return `Unroll complete (${vtxoTxid.slice(0, 12)}…) — complete exit after the timelock`
}

/** Sonner toast id so in-progress unroll updates one notification per on-chain tx. */
export function unilateralUnrollProgressToastId(
  event: Pick<{ type: string; txid?: string }, 'type' | 'txid'>,
): string {
  return `arkade-unroll-${event.txid ?? event.type}`
}

export function shouldShowUnilateralUnrollProgressToast(event: { type: string }): boolean {
  return event.type === 'unroll' || event.type === 'wait'
}
