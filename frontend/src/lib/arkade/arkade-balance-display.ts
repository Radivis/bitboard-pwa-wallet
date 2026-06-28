import type { ArkadeBalanceInfo } from '@/workers/arkade-api'

/** Net offchain spendable plus bumper (exits in progress already deducted in confirmedSats). */
export function arkadeOffchainSpendableSats(balance: ArkadeBalanceInfo): number {
  return balance.confirmedSats
}

/** Dashboard total: net confirmed plus boarding UTXOs ready to settle. */
export function arkadeDashboardSpendableSats(balance: ArkadeBalanceInfo): number {
  return balance.confirmedSats + (balance.boardingSpendableSats ?? 0)
}

export function arkadeUnilateralExitInProgressSats(balance: ArkadeBalanceInfo): number {
  return balance.unilateralExitInProgressSats ?? 0
}

export function arkadeCollaborativeExitInProgressSats(balance: ArkadeBalanceInfo): number {
  return balance.collaborativeExitInProgressSats ?? 0
}

export function arkadeHasBoardingBalance(balance: ArkadeBalanceInfo): boolean {
  return (balance.boardingSpendableSats ?? 0) > 0 || (balance.boardingPendingSats ?? 0) > 0
}

export function arkadeHasExitInProgress(balance: ArkadeBalanceInfo): boolean {
  return (
    arkadeUnilateralExitInProgressSats(balance) > 0 ||
    arkadeCollaborativeExitInProgressSats(balance) > 0
  )
}

export function arkadePendingRecoverySats(balance: ArkadeBalanceInfo): number {
  return balance.pendingRecoverySats ?? 0
}
