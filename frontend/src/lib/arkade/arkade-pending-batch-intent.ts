import type {
  ArkadeBatchJoinResult,
  ArkadePendingBatchIntent,
} from '@/workers/arkade-api'
import { ARKADE_PENDING_BATCH_INTENT_POLL_MS } from '@/lib/arkade/arkade-query-timings'

export const BATCH_JOIN_STATUS_COMPLETED = 'completed'
export const BATCH_JOIN_STATUS_WAITING = 'waiting_for_operator'

export const ARKADE_INTENT_KINDS = [
  'board',
  'recover',
  'renew',
  'collaborative_exit',
  'migrate',
] as const

export type ArkadeIntentKind = (typeof ARKADE_INTENT_KINDS)[number]

export const ARKADE_INTENT_LIFECYCLE_PHASES = {
  submission: 'submission',
  processing: 'processing',
  timedOut: 'timed_out',
  succeeded: 'succeeded',
} as const

export type ArkadeIntentLifecyclePhase =
  (typeof ARKADE_INTENT_LIFECYCLE_PHASES)[keyof typeof ARKADE_INTENT_LIFECYCLE_PHASES]

export type ArkadePendingIntentPhase = Extract<
  ArkadeIntentLifecyclePhase,
  'processing' | 'timed_out'
>

const cancelledPendingIntentKeys = new Set<string>()
const inFlightRegisteredIntentKeys = new Set<string>()
const settledByMutationIntentKeys = new Set<string>()

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

export function pendingIntentBannerPhase(
  intent: ArkadePendingBatchIntent,
): ArkadePendingIntentPhase {
  return intent.lifecyclePhase === ARKADE_INTENT_LIFECYCLE_PHASES.processing
    ? ARKADE_INTENT_LIFECYCLE_PHASES.processing
    : ARKADE_INTENT_LIFECYCLE_PHASES.timedOut
}

export function isIntentSubmitPhase1(options: {
  mutationPending: boolean
  pendingForAction: boolean
}): boolean {
  return options.mutationPending && !options.pendingForAction
}

export function isBoardingOnlyPendingIntent(intent: ArkadePendingBatchIntent): boolean {
  return intent.kind === 'board' && intent.vtxoOutpoints.length === 0
}

export function pendingIntentAllowsCancel(intent: ArkadePendingBatchIntent): boolean {
  return !isBoardingOnlyPendingIntent(intent)
}

export function pendingIntentAllowsRetry(intent: ArkadePendingBatchIntent): boolean {
  if (!isBoardingOnlyPendingIntent(intent)) {
    return true
  }
  return pendingIntentBannerPhase(intent) === ARKADE_INTENT_LIFECYCLE_PHASES.timedOut
}

export function pendingBatchIntentProcessingMessage(kind: string): string {
  return `The Arkade server is processing your ${pendingBatchIntentKindLabel(kind)}.`
}

export function pendingBatchIntentWaitingMessage(kind: string): string {
  return `Your ${pendingBatchIntentKindLabel(kind)} is registered. Waiting for the Arkade operator to include it in a batch.`
}

export function pendingBatchIntentSucceededMessage(kind: string): string {
  switch (kind) {
    case 'board':
      return 'Boarding settlement completed'
    case 'recover':
      return 'Recoverable VTXOs settled'
    case 'renew':
      return 'VTXOs renewed'
    case 'collaborative_exit':
      return 'Collaborative exit completed'
    case 'migrate':
      return 'Signer migration batch completed'
    default:
      return 'Arkade batch intent completed'
  }
}

export function pendingBatchIntentCancelledMessage(): string {
  return 'Intent cancelled'
}

export function markPendingBatchIntentCancelled(intent: ArkadePendingBatchIntent): void {
  cancelledPendingIntentKeys.add(pendingBatchIntentKey(intent))
}

export function consumePendingBatchIntentCancelled(intentKey: string): boolean {
  if (!cancelledPendingIntentKeys.has(intentKey)) {
    return false
  }
  cancelledPendingIntentKeys.delete(intentKey)
  return true
}

export function rememberInFlightRegisteredIntent(intent: ArkadePendingBatchIntent): void {
  inFlightRegisteredIntentKeys.add(pendingBatchIntentKey(intent))
}

export function settleInFlightRegisteredIntents(): void {
  for (const intentKey of inFlightRegisteredIntentKeys) {
    settledByMutationIntentKeys.add(intentKey)
  }
  inFlightRegisteredIntentKeys.clear()
}

export function abandonInFlightRegisteredIntents(): void {
  inFlightRegisteredIntentKeys.clear()
}

export function consumePendingBatchIntentSettledByMutation(intentKey: string): boolean {
  if (!settledByMutationIntentKeys.has(intentKey)) {
    return false
  }
  settledByMutationIntentKeys.delete(intentKey)
  return true
}

export function hasInFlightRegisteredIntent(): boolean {
  return inFlightRegisteredIntentKeys.size > 0
}

export function resetPendingBatchIntentSessionTracking(): void {
  cancelledPendingIntentKeys.clear()
  inFlightRegisteredIntentKeys.clear()
  settledByMutationIntentKeys.clear()
}

export function clearedPendingBatchIntents(
  previousIntents: ArkadePendingBatchIntent[],
  currentIntents: ArkadePendingBatchIntent[],
): ArkadePendingBatchIntent[] {
  const currentKeys = new Set(currentIntents.map(pendingBatchIntentKey))
  return previousIntents.filter(
    (intent) => !currentKeys.has(pendingBatchIntentKey(intent)),
  )
}

export type PendingIntentDisappearanceToast =
  | { type: 'cancelled' }
  | { type: 'succeeded'; kind: string }
  | { type: 'silent' }

export function classifyPendingIntentDisappearance(options: {
  previousIntent: ArkadePendingBatchIntent
  cancelled: boolean
  settledByMutation: boolean
  boardingExpiredSats: number
}): PendingIntentDisappearanceToast {
  if (options.cancelled) {
    return { type: 'cancelled' }
  }
  if (options.settledByMutation) {
    return { type: 'silent' }
  }
  if (options.previousIntent.kind === 'board' && options.boardingExpiredSats > 0) {
    return { type: 'silent' }
  }
  return { type: 'succeeded', kind: options.previousIntent.kind }
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
