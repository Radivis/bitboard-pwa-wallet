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

export function formatBarkEmergencyExitFundingBanner(
  status: BarkEmergencyExitFundingStatus,
): string {
  return `Broadcasting ${status.providedChildren} of ${status.requestedChildren} transactions. The rest are waiting for confirmed funds.`
}
