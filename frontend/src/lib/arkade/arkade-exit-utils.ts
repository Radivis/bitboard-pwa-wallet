import { wasmArkErrorCode } from '@/lib/shared/wasm-ark-error'

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

/**
 * Fallback bumper low-balance threshold when the unilateral fee estimate is unavailable (sats).
 * Roughly one child-package fee at minimum fee rate (~0.1 sat/vB × 140 vB); prompts funding the
 * bumper before unroll when we cannot query Esplora for a tighter estimate.
 */
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

/** Characters shown before the ellipsis in Arkade txid toast snippets. */
export const ARKADE_TXID_DISPLAY_PREFIX_LENGTH = 12

export function formatArkadeTxidToastSnippet(txid: string): string {
  return `${txid.slice(0, ARKADE_TXID_DISPLAY_PREFIX_LENGTH)}…`
}

export function formatUnilateralUnrollSuccessMessage(
  vtxoTxid: string,
  options?: { indexerWarning?: string | null },
): string {
  const base = `Unroll complete (${formatArkadeTxidToastSnippet(vtxoTxid)}). Use Complete unilateral exit when the timelock elapses.`
  if (options?.indexerWarning) {
    return `${base} Operator indexer is still catching up — complete exit may take longer.`
  }
  return base
}

/** Sonner toast id so in-progress unroll updates one notification per on-chain tx. */
export function unilateralUnrollProgressToastId(
  event: Pick<{ type: string; txid?: string }, 'type' | 'txid'>,
): string {
  return `arkade-unroll-${event.txid ?? event.type}`
}

export function shouldShowUnilateralUnrollProgressToast(event: { type: string }): boolean {
  return event.type === 'unroll' || event.type === 'wait' || event.type === 'indexer'
}

export type UnilateralExitTimelock = {
  timelockBlocks?: number | null
  timelockSeconds?: number | null
}

function formatDurationSeconds(totalSeconds: number): string {
  if (totalSeconds < 3_600) {
    const minutes = Math.max(1, Math.round(totalSeconds / 60))
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  }
  if (totalSeconds < 86_400) {
    const hours = Math.max(1, Math.round(totalSeconds / 3_600))
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  const days = Math.max(1, Math.round(totalSeconds / 86_400))
  return `${days} day${days === 1 ? '' : 's'}`
}

export function formatUnilateralExitTimelock(timelock: UnilateralExitTimelock): string {
  if (timelock.timelockBlocks != null) {
    const blocks = timelock.timelockBlocks
    return `${blocks} block confirmation${blocks === 1 ? '' : 's'}`
  }
  if (timelock.timelockSeconds != null) {
    return formatDurationSeconds(timelock.timelockSeconds)
  }
  return 'the operator CSV timelock'
}

export function unilateralExitCompleteTimelockMessage(
  timelock: UnilateralExitTimelock,
  canComplete: boolean,
): string {
  if (canComplete) {
    return 'CSV timelock satisfied — you can complete the exit now.'
  }
  const duration = formatUnilateralExitTimelock(timelock)
  return `After unroll confirms on-chain, wait for ${duration} (operator CSV timelock) before completing.`
}

export const OPERATOR_INDEXER_CATCHING_UP_CODE = 'operator_indexer_catching_up'

/** Shown when completion coin-select used a permissive blocktime fallback (see wallet model doc). */
export const MISSING_BLOCKTIME_COMPLETION_WARNING_SUMMARY =
  'Esplora did not report a confirmation time for the VTXO(s) below. Timelock eligibility is estimated conservatively.'

export type MissingBlocktimeCompletionWarningLine = {
  virtualTxid: string
  amountSats: number
  onChainTxid: string
  onChainVout: number
  onChainDiffersFromVirtual: boolean
}

export function formatMissingBlocktimeCompletionWarning(
  inputs: ReadonlyArray<{
    virtualTxid: string
    onChainTxid: string
    onChainVout: number
    amountSats: number
  }>,
): { summary: string; lines: MissingBlocktimeCompletionWarningLine[] } {
  const lines = inputs.map((input) => ({
    virtualTxid: input.virtualTxid,
    amountSats: input.amountSats,
    onChainTxid: input.onChainTxid,
    onChainVout: input.onChainVout,
    onChainDiffersFromVirtual: input.onChainTxid !== input.virtualTxid,
  }))
  return {
    summary: MISSING_BLOCKTIME_COMPLETION_WARNING_SUMMARY,
    lines,
  }
}

export function formatMissingBlocktimeCompletionWarningLine(
  line: MissingBlocktimeCompletionWarningLine,
): string {
  const virtualSnippet = `${line.virtualTxid.slice(0, 12)}…`
  if (!line.onChainDiffersFromVirtual) {
    return `${virtualSnippet} (${line.amountSats} sats)`
  }
  const onChainSnippet = `${line.onChainTxid.slice(0, 12)}…:${line.onChainVout}`
  return `${virtualSnippet} (${line.amountSats} sats, on-chain ${onChainSnippet})`
}

export function isOperatorIndexerCatchingUpError(error: unknown): boolean {
  return wasmArkErrorCode(error) === OPERATOR_INDEXER_CATCHING_UP_CODE
}
