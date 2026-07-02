import type {
  ArkadeBalanceInfo,
  ArkadeCollaborativeExitFeeEstimate,
  ArkadeCollaborativeExitEstimateErrorCode,
  ArkadeSignerMigrationHint,
} from '@/workers/arkade-api'
import { arkadeOffchainSpendableSats } from '@/lib/arkade/arkade-balance-display'

export const ARKADE_COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS =
  'insufficient_cooperative_inputs' satisfies ArkadeCollaborativeExitEstimateErrorCode

/** Cooperative Arkade exit is unavailable after operator signer rotation cutoff. */
export function isSignerRotationCooperativeExitBlocked(
  hint: ArkadeSignerMigrationHint | null | undefined,
): boolean {
  return hint?.deprecatedStatus === 'expired'
}

/** Fee estimator reports zero batch-settleable cooperative inputs. */
export function isCollaborativeExitInsufficientFundsError(
  estimate: Pick<ArkadeCollaborativeExitFeeEstimate, 'estimateErrorCode'>,
): boolean {
  return (
    estimate.estimateErrorCode ===
    ARKADE_COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS
  )
}

export function formatCollaborativeExitEstimateError(
  estimate: Pick<ArkadeCollaborativeExitFeeEstimate, 'estimateError' | 'estimateErrorCode'>,
): string {
  if (isCollaborativeExitInsufficientFundsError(estimate)) {
    return 'No cooperatively spendable Arkade balance is available for this exit. After operator signer rotation cutoff, use unilateral exit for affected VTXOs.'
  }
  return estimate.estimateError ?? ''
}

export function arkadeHasPendingRecoveryBalance(balance: ArkadeBalanceInfo): boolean {
  return (balance.pendingRecoverySats ?? 0) > 0
}

/** Batch-settleable amount available for cooperative exit (aligned with fee estimator when loaded). */
export function arkadeCooperativeExitSpendableSats(
  balance: ArkadeBalanceInfo,
  feeEstimate?: Pick<ArkadeCollaborativeExitFeeEstimate, 'estimateErrorCode'> | null,
): number {
  if (feeEstimate != null && isCollaborativeExitInsufficientFundsError(feeEstimate)) {
    return 0
  }
  return arkadeOffchainSpendableSats(balance)
}
