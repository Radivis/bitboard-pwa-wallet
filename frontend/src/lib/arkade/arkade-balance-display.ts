import type { ArkadeBalanceInfo } from '@/workers/arkade-api'

/** Spendable VTXOs (and Ark on-chain bumper); excludes on-chain boarding UTXOs. */
export function arkadeOffchainSpendableSats(balance: ArkadeBalanceInfo): number {
  return balance.confirmedSats
}

/** Dashboard total: offchain spendable plus boarding UTXOs ready to settle. */
export function arkadeDashboardSpendableSats(balance: ArkadeBalanceInfo): number {
  return balance.confirmedSats + (balance.boardingSpendableSats ?? 0)
}

export function arkadeHasBoardingBalance(balance: ArkadeBalanceInfo): boolean {
  return (balance.boardingSpendableSats ?? 0) > 0 || (balance.boardingPendingSats ?? 0) > 0
}
