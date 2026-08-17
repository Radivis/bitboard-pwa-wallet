import type {
  ArkadeBatchJoinResult,
  ArkadePendingBatchIntent,
} from '@/workers/arkade-api'
import { ARKADE_PENDING_BATCH_INTENT_POLL_MS } from '@/lib/arkade/arkade-query-timings'

export const BATCH_JOIN_STATUS_COMPLETED = 'completed'
export const BATCH_JOIN_STATUS_WAITING = 'waiting_for_operator'

export function isBatchJoinWaiting(
  result: ArkadeBatchJoinResult,
): boolean {
  return result.status === BATCH_JOIN_STATUS_WAITING
}

export function isBatchJoinCompleted(
  result: ArkadeBatchJoinResult,
): boolean {
  return result.status === BATCH_JOIN_STATUS_COMPLETED
}

export function pendingBatchIntentKindLabel(kind: string): string {
  switch (kind) {
    case 'board':
      return 'boarding'
    case 'recover':
      return 'VTXO recovery'
    case 'renew':
      return 'VTXO renewal'
    case 'collaborative_exit':
      return 'collaborative exit'
    case 'migrate':
      return 'signer migration'
    default:
      return 'batch settle'
  }
}

export function pendingBatchIntentFromSources(
  boardingIntents: ArkadePendingBatchIntent[] | undefined,
  balanceIntents: ArkadePendingBatchIntent[] | undefined,
): ArkadePendingBatchIntent[] {
  return boardingIntents ?? balanceIntents ?? []
}

export function pendingBatchIntentKey(intent: ArkadePendingBatchIntent): string {
  return [
    ...intent.onchainOutpoints.map((item) => `o:${item.txid}:${item.vout}`),
    ...intent.vtxoOutpoints.map((item) => `v:${item.txid}:${item.vout}`),
  ]
    .sort()
    .join('|')
}

export function hasPendingBatchIntent(
  pendingIntents: ArkadePendingBatchIntent[],
): boolean {
  return pendingIntents.length > 0
}

export function pendingOverlapsOnchain(
  pendingIntents: ArkadePendingBatchIntent[],
): boolean {
  return pendingIntents.some((intent) => intent.onchainOutpoints.length > 0)
}

export function hasPendingKind(
  pendingIntents: ArkadePendingBatchIntent[],
  kind: string,
): boolean {
  return pendingIntents.some((intent) => intent.kind === kind)
}

export function pendingBatchIntentWaitingMessage(kind: string): string {
  return `Your ${pendingBatchIntentKindLabel(kind)} is registered. Waiting for the Arkade operator to include it in a batch.`
}

export function pendingBatchIntentClearedMessage(): string {
  return 'The Arkade operator settled your registered intent.'
}

export function arkadeRefetchIntervalWithPendingBatchIntent(
  hasPendingIntent: boolean,
  periodicInterval: number | false,
): number | false {
  if (hasPendingIntent) {
    return ARKADE_PENDING_BATCH_INTENT_POLL_MS
  }
  return periodicInterval
}
