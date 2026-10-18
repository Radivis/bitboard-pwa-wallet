import type { BarkEmergencyExitProgressOutcome } from '@/lib/bark/perform-bark-emergency-exit'
import type { NetworkMode } from '@/stores/walletStore'

export type BarkEmergencyExitScope<TNetworkMode extends NetworkMode = NetworkMode> = {
  walletId: number
  networkMode: TNetworkMode
}

export function barkEmergencyExitScopeFor<TNetworkMode extends NetworkMode>(
  walletId: number | null,
  networkMode: TNetworkMode,
): BarkEmergencyExitScope<TNetworkMode> | null {
  return walletId == null ? null : { walletId, networkMode }
}

/** The last progress run left some exit transactions without a funded child. */
export type BarkEmergencyExitFundingStatus = BarkEmergencyExitScope & BarkEmergencyExitProgressOutcome

/** Parents still waiting for a confirmed coin, kept when the funding banner is cleared. */
export type BarkEmergencyExitUnfundedParents = BarkEmergencyExitScope & {
  txids: readonly string[]
}

export function barkEmergencyExitFundingStatusFor(
  status: BarkEmergencyExitFundingStatus | null,
  scope: BarkEmergencyExitScope | null,
): BarkEmergencyExitFundingStatus | null {
  if (status == null || scope == null) return null
  if (status.walletId !== scope.walletId || status.networkMode !== scope.networkMode) return null
  return status
}

/** Shortfall parents for this wallet. Empty when the stored list belongs to another scope. */
const NO_UNFUNDED_PARENT_TXIDS: readonly string[] = []

export function barkEmergencyExitUnfundedParentTxidsFor(
  stored: BarkEmergencyExitUnfundedParents | null,
  scope: BarkEmergencyExitScope | null,
): readonly string[] {
  if (stored == null || scope == null) return NO_UNFUNDED_PARENT_TXIDS
  if (stored.walletId !== scope.walletId || stored.networkMode !== scope.networkMode) {
    return NO_UNFUNDED_PARENT_TXIDS
  }
  return stored.txids
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
