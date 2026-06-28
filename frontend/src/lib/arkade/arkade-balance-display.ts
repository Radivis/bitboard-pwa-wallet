import type { ArkadeBalanceInfo } from '@/workers/arkade-api'

/** Net offchain VTXO spendable (excludes bumper/boarding; exits in progress deducted). */
export function arkadeOffchainSpendableSats(balance: ArkadeBalanceInfo): number {
  if (balance.offchainSpendableSats != null) {
    return balance.offchainSpendableSats
  }
  // Legacy WASM: confirmedSats mixed bumper with offchain — prefer net when pending recovery is split out.
  const pendingRecoverySats = balance.pendingRecoverySats ?? 0
  return Math.max(0, balance.confirmedSats - pendingRecoverySats)
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
