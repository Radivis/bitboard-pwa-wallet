import { maxSatsInTextFromFormattedBitcoinAmountDisplays } from '@/lib/wallet/bitcoin-amount-text-parse'

const DASHBOARD_SPENDABLE_LABEL = 'Spendable (settled)'
const DASHBOARD_BREAKDOWN_LABEL =
  /\n(?:Pending change|Pending incoming|Immature)\b/

function spendableSegmentAfterDashboardLabel(text: string, label: string): string {
  const afterLabel = text.split(label)[1] ?? ''
  return afterLabel.split(DASHBOARD_BREAKDOWN_LABEL)[0] ?? ''
}

/**
 * On-chain send uses confirmed sats, not pending incoming.
 * When the dashboard shows a breakdown, the headline total can include unconfirmed funds
 * while spendable is still zero — ignore pending-only totals.
 */
export function onChainSpendableSatsFromDashboardBalanceCardText(text: string): number {
  if (text.includes(DASHBOARD_SPENDABLE_LABEL)) {
    return maxSatsInTextFromFormattedBitcoinAmountDisplays(
      spendableSegmentAfterDashboardLabel(text, DASHBOARD_SPENDABLE_LABEL),
    )
  }

  const hasPendingBreakdown =
    text.includes('Pending change') ||
    text.includes('Pending incoming') ||
    text.includes('Immature')

  if (hasPendingBreakdown) {
    return 0
  }

  return maxSatsInTextFromFormattedBitcoinAmountDisplays(text)
}

/** Send page shows `Available:` with the same confirmed balance as `canBuildOnChainSend`. */
export function onChainSpendableSatsFromSendPageAvailableText(text: string): number {
  return maxSatsInTextFromFormattedBitcoinAmountDisplays(text)
}
