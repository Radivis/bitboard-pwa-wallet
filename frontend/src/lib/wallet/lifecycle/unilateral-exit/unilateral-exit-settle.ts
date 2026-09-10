import { toast } from 'sonner'
import { userFacingErrorMessage } from '@/lib/shared/utils'
import {
  UNILATERAL_EXIT_MACHINE_STATE,
  type UnilateralExitActorSnapshot,
  type UnilateralExitMachineStateId,
  type UnilateralExitSettleResult,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'

export type { UnilateralExitSettleResult }

export type UnilateralExitSettleOutcome = {
  result: UnilateralExitSettleResult | null
  lastErrorMessage: string | null
}

const SETTLE_RESULT_BY_STATE: Partial<
  Record<UnilateralExitMachineStateId, UnilateralExitSettleResult>
> = {
  [UNILATERAL_EXIT_MACHINE_STATE.complete]: 'branchComplete',
  [UNILATERAL_EXIT_MACHINE_STATE.terminated]: 'terminated',
  [UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm]: 'waitingConfirm',
  [UNILATERAL_EXIT_MACHINE_STATE.paused]: 'paused',
  [UNILATERAL_EXIT_MACHINE_STATE.error]: 'error',
}

export function settleResultFromMachineState(
  stateId: UnilateralExitMachineStateId,
): UnilateralExitSettleResult | null {
  return SETTLE_RESULT_BY_STATE[stateId] ?? null
}

export function settleOutcomeFromSnapshot(
  snapshot: UnilateralExitActorSnapshot,
): UnilateralExitSettleOutcome {
  return {
    result:
      snapshot.context.lastSettleResult ?? settleResultFromMachineState(snapshot.value),
    lastErrorMessage: snapshot.context.lastErrorMessage,
  }
}

/**
 * Toast for a settled job. `branchComplete` and `terminated` are toasted from machine
 * entry actions. Pause is toasted from the runtime subscription — do not re-toast here.
 */
export function toastUnilateralExitSettleResult(
  outcome: UnilateralExitSettleOutcome,
  successMessage: string,
): void {
  if (outcome.result === 'error') {
    toast.error(
      userFacingErrorMessage(outcome.lastErrorMessage ?? 'Unroll step failed.'),
    )
    return
  }
  if (outcome.result === 'waitingConfirm') {
    toast.success(successMessage)
  }
}
