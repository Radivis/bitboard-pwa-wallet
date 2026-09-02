import type { ArkadeBalanceInfo } from '@/workers/arkade-api'

/** Net offchain VTXO spendable (excludes bumper/boarding; collaborative exits in progress deducted). */
export function arkadeOffchainSpendableSats(balance: ArkadeBalanceInfo): number {
  if (balance.offchainSpendableSats != null) {
    return balance.offchainSpendableSats
  }
  // Legacy WASM: confirmedSats mixed bumper with offchain — prefer net when pending recovery is split out.
  const pendingRecoveryDueToExpiredSignerSats = balance.pendingRecoveryDueToExpiredSignerSats ?? 0
  return Math.max(0, balance.confirmedSats - pendingRecoveryDueToExpiredSignerSats)
}

/** On-chain bumper wallet balance (P2A fees for unilateral exit; not Ark spendable balance). */
export function arkadeOnchainBumperSats(balance: ArkadeBalanceInfo): number {
  if (balance.onchainBumperSats != null) {
    return balance.onchainBumperSats
  }
  return Math.max(0, balance.confirmedSats - arkadeOffchainSpendableSats(balance))
}

/** Dashboard headline: offchain VTXOs plus boarding ready to settle (excludes bumper). */
export function arkadeDashboardSpendableSats(balance: ArkadeBalanceInfo): number {
  return arkadeOffchainSpendableSats(balance) + (balance.boardingSpendableSats ?? 0)
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

export function arkadePendingRecoveryDueToExpiredSignerSats(balance: ArkadeBalanceInfo): number {
  return balance.pendingRecoveryDueToExpiredSignerSats ?? 0
}

export function arkadeRecoverableSettleableSats(balance: ArkadeBalanceInfo): number {
  return balance.recoverableSettleableSats ?? 0
}

export function arkadeRecoverableSettleableVtxoCount(balance: ArkadeBalanceInfo): number {
  return balance.recoverableSettleableVtxoCount ?? 0
}

export function arkadeRecoverablePendingOperatorSweepSats(balance: ArkadeBalanceInfo): number {
  return balance.recoverablePendingOperatorSweepSats ?? 0
}

export function arkadeRecoverablePendingOperatorSweepVtxoCount(
  balance: ArkadeBalanceInfo,
): number {
  return balance.recoverablePendingOperatorSweepVtxoCount ?? 0
}
