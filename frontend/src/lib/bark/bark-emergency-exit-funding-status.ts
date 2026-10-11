import type { BarkEmergencyExitProgressOutcome } from '@/lib/bark/perform-bark-emergency-exit'
import type { NetworkMode } from '@/stores/walletStore'

export type BarkEmergencyExitScope = {
  walletId: number
  networkMode: NetworkMode
}

/** The last progress run left some exit transactions without a funded child. */
export type BarkEmergencyExitFundingStatus = BarkEmergencyExitScope & BarkEmergencyExitProgressOutcome

export function barkEmergencyExitFundingStatusFor(
  status: BarkEmergencyExitFundingStatus | null,
  scope: BarkEmergencyExitScope | null,
): BarkEmergencyExitFundingStatus | null {
  if (status == null || scope == null) return null
  if (status.walletId !== scope.walletId || status.networkMode !== scope.networkMode) return null
  return status
}

/**
 * Pay-to-Anchor children spend confirmed coins only, so when none could be funded the
 * wallet is usually waiting for change from earlier children to confirm.
 */
export function formatBarkEmergencyExitFundingBanner(
  status: BarkEmergencyExitFundingStatus,
): string {
  const waitingChildren = status.requestedChildren - status.providedChildren
  if (status.providedChildren === 0) {
    const exitTransactions = waitingChildren === 1 ? 'exit transaction is' : 'exit transactions are'
    return `${waitingChildren} ${exitTransactions} waiting for confirmed funds. Change from earlier exit transactions must confirm first.`
  }
  const waitingVerb = waitingChildren === 1 ? 'is' : 'are'
  return `Broadcasting ${status.providedChildren} of ${status.requestedChildren} exit transactions. ${waitingChildren} ${waitingVerb} waiting for confirmed funds.`
}
