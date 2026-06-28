import type {
  ArkadeBalanceInfo,
  ArkadeCollaborativeExitFeeEstimate,
  ArkadeCollaborativeExitEstimateErrorCode,
  ArkadeSignerMigrationHint,
} from '@/workers/arkade-api'

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
