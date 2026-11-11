import {
  blockDurationParts,
  formatApproximateDurationPhrase,
} from '@/lib/shared/block-duration'
import {
  formatCoarseDurationSeconds,
  formatDurationDaysHoursMinutesSeconds,
} from '@/lib/shared/format-duration'
import type { NetworkMode } from '@/stores/walletStore'
import {
  VTXO_EXIT_PHASE_COPY,
  type VtxoExitPhaseCopyKind,
} from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit-selectors'

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

export type UnilateralExitTimelock = {
  timelockBlocks?: number | null
  timelockSeconds?: number | null
}

function formatBlockCountAbout(
  blockCount: number,
  networkMode: NetworkMode | null | undefined,
): string {
  const parts = blockDurationParts(blockCount, networkMode)
  const noun = parts.blockCount === 1 ? 'block' : 'blocks'
  const phrase = formatApproximateDurationPhrase(parts)
  if (phrase == null) return `${parts.blockCount} ${noun}`
  return `${parts.blockCount} ${noun} (about ${phrase})`
}

function formatRemainingBlocksBeforeCompleting(
  blockCount: number,
  networkMode: NetworkMode | null | undefined,
): string {
  const parts = blockDurationParts(blockCount, networkMode)
  const noun = parts.blockCount === 1 ? 'block' : 'blocks'
  const phrase = formatApproximateDurationPhrase(parts)
  const blocks = `${parts.blockCount} more ${noun}`
  if (phrase == null) return `Wait for ${blocks} before completing.`
  return `Wait for ${blocks} (about ${phrase}) before completing.`
}

export function formatUnilateralExitTimelock(
  timelock: UnilateralExitTimelock,
  networkMode?: NetworkMode | null,
): string {
  if (timelock.timelockBlocks != null) {
    return formatBlockCountAbout(timelock.timelockBlocks, networkMode)
  }
  if (timelock.timelockSeconds != null) {
    return formatCoarseDurationSeconds(timelock.timelockSeconds)
  }
  return 'the operator CSV timelock'
}

export function unilateralExitCompleteTimelockMessage(
  timelock: UnilateralExitTimelock,
  canComplete: boolean,
  networkMode?: NetworkMode | null,
): string {
  if (canComplete) {
    return 'CSV timelock satisfied — you can complete the exit now.'
  }
  const duration = formatUnilateralExitTimelock(timelock, networkMode)
  return `After unroll confirms on-chain, wait for ${duration} (operator CSV timelock) before completing.`
}

export const UNILATERAL_EXIT_COMPLETE_HOST_BROADCAST_MESSAGE =
  'This VTXO is still waiting for the host transaction to broadcast, not the unilateral-exit timelock.'

export const UNILATERAL_EXIT_COMPLETE_FIRST_CONFIRMATION_MESSAGE =
  'This VTXO is still waiting for the first on-chain confirmation, not the unilateral-exit timelock.'

export const UNILATERAL_EXIT_COMPLETE_SIX_CONFIRMATIONS_MESSAGE =
  'This VTXO is still waiting for 6 on-chain confirmations, not the unilateral-exit timelock.'

/** Coin-select copy while the CSV has not elapsed. Not a failed complete. */
const UNILATERAL_EXIT_COMPLETION_NOT_READY_ERROR =
  'no matching unrolled VTXOs found for completion'

export function isUnilateralExitCompletionNotReadyError(
  message: string | null | undefined,
): boolean {
  return message != null && message.includes(UNILATERAL_EXIT_COMPLETION_NOT_READY_ERROR)
}

export function selectionCoveredByCompletionEstimate(params: {
  selectedTotalSats: number
  estimatedSelectedTotalSats: number | undefined
  estimateError: string | null | undefined
}): boolean {
  return (
    params.selectedTotalSats > 0 &&
    (params.estimateError == null || params.estimateError === '') &&
    params.estimatedSelectedTotalSats === params.selectedTotalSats
  )
}

export function unilateralExitWaitingTimelockProgress(
  rows: ReadonlyArray<{
    canComplete: boolean
    csvReadyAtUnixSeconds?: number
    csvConfirmationsRemaining?: number
  }>,
): {
  csvReadyAtUnixSeconds?: number
  csvConfirmationsRemaining?: number
} {
  let csvReadyAtUnixSeconds: number | undefined
  let csvConfirmationsRemaining: number | undefined
  for (const row of rows) {
    if (row.canComplete) {
      continue
    }
    if (row.csvReadyAtUnixSeconds != null) {
      csvReadyAtUnixSeconds =
        csvReadyAtUnixSeconds == null
          ? row.csvReadyAtUnixSeconds
          : Math.max(csvReadyAtUnixSeconds, row.csvReadyAtUnixSeconds)
    }
    if (row.csvConfirmationsRemaining != null) {
      csvConfirmationsRemaining =
        csvConfirmationsRemaining == null
          ? row.csvConfirmationsRemaining
          : Math.max(csvConfirmationsRemaining, row.csvConfirmationsRemaining)
    }
  }
  return { csvReadyAtUnixSeconds, csvConfirmationsRemaining }
}

export const COMPLETE_UNILATERAL_EXIT_SUCCESS_TOAST_MS = 60_000

export function completeUnilateralExitSuccessToast(txid: string): {
  title: string
  options: { description: string; duration: number; id: string }
} {
  return {
    title: 'Unilateral exit completed',
    options: {
      description: txid,
      duration: COMPLETE_UNILATERAL_EXIT_SUCCESS_TOAST_MS,
      id: `complete-unilateral-exit-${txid}`,
    },
  }
}

export function blockchainExplorerTransactionUrl(
  networkMode: string | null | undefined,
  txid: string,
): string | null {
  if (networkMode === 'mutinynet') {
    return `https://mutinynet.com/tx/${txid}`
  }
  if (networkMode === 'signet') {
    return `https://mempool.space/signet/tx/${txid}`
  }
  if (networkMode === 'mainnet') {
    return `https://mempool.space/tx/${txid}`
  }
  if (networkMode === 'testnet') {
    return `https://mempool.space/testnet4/tx/${txid}`
  }
  return null
}

function formatCsvTimelockWaitCopy(params: {
  timelock: UnilateralExitTimelock
  csvReadyAtUnixSeconds?: number
  csvConfirmationsRemaining?: number
  nowUnixSeconds?: number
  networkMode?: NetworkMode | null
}): string {
  if (params.csvReadyAtUnixSeconds != null) {
    const nowUnixSeconds = params.nowUnixSeconds ?? Math.floor(Date.now() / 1000)
    const remainingSeconds = params.csvReadyAtUnixSeconds - nowUnixSeconds
    if (remainingSeconds > 0) {
      return `CSV timelock ends in ${formatDurationDaysHoursMinutesSeconds(remainingSeconds)}. Complete exit enables on this page when it elapses.`
    }
    return 'CSV timelock has elapsed. Checking the chain so Complete exit can be enabled.'
  }
  if (params.csvConfirmationsRemaining != null) {
    return formatRemainingBlocksBeforeCompleting(
      params.csvConfirmationsRemaining,
      params.networkMode,
    )
  }
  return unilateralExitCompleteTimelockMessage(params.timelock, false, params.networkMode)
}

export function formatUnilateralExitCompleteWaitingBanner(params: {
  waitingCopyKinds: ReadonlySet<VtxoExitPhaseCopyKind>
  timelock: UnilateralExitTimelock
  waitingTxidSnippets: string[]
  csvReadyAtUnixSeconds?: number
  csvConfirmationsRemaining?: number
  nowUnixSeconds?: number
  networkMode?: NetworkMode | null
}): string | null {
  if (params.waitingCopyKinds.size === 0 && params.waitingTxidSnippets.length === 0) {
    return null
  }
  const parts: string[] = []
  if (params.waitingCopyKinds.has(VTXO_EXIT_PHASE_COPY.waitingForHostTransactionBroadcast)) {
    parts.push(UNILATERAL_EXIT_COMPLETE_HOST_BROADCAST_MESSAGE)
  }
  if (params.waitingCopyKinds.has(VTXO_EXIT_PHASE_COPY.waitingForFirstConfirmation)) {
    parts.push(UNILATERAL_EXIT_COMPLETE_FIRST_CONFIRMATION_MESSAGE)
  }
  if (params.waitingCopyKinds.has(VTXO_EXIT_PHASE_COPY.waitingForSixConfirmations)) {
    parts.push(UNILATERAL_EXIT_COMPLETE_SIX_CONFIRMATIONS_MESSAGE)
  }
  if (params.waitingCopyKinds.has(VTXO_EXIT_PHASE_COPY.waitingForTimelock)) {
    parts.push(formatCsvTimelockWaitCopy(params))
  }
  if (parts.length === 0) {
    return params.waitingTxidSnippets.length > 0
      ? `Not ready to complete yet. Waiting: ${params.waitingTxidSnippets.join(', ')}`
      : null
  }
  if (params.waitingTxidSnippets.length > 0) {
    parts.push(`Waiting: ${params.waitingTxidSnippets.join(', ')}`)
  }
  return parts.join(' ')
}

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
  const virtualSnippet = formatArkadeTxidToastSnippet(line.virtualTxid)
  if (!line.onChainDiffersFromVirtual) {
    return `${virtualSnippet} (${line.amountSats} sats)`
  }
  const onChainSnippet = `${formatArkadeTxidToastSnippet(line.onChainTxid)}:${line.onChainVout}`
  return `${virtualSnippet} (${line.amountSats} sats, on-chain ${onChainSnippet})`
}
