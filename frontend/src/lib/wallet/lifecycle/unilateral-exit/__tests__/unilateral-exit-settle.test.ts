import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { createInitialUnilateralExitContext } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import { UNILATERAL_EXIT_MACHINE_STATE } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import {
  settleOutcomeFromSnapshot,
  settleResultFromMachineState,
  toastUnilateralExitSettleResult,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-settle'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

describe('unilateral-exit-settle', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  it('settleResultFromMachineState maps complete/terminated/waitingConfirm/paused/error', () => {
    expect(settleResultFromMachineState(UNILATERAL_EXIT_MACHINE_STATE.complete)).toBe(
      'branchComplete',
    )
    expect(settleResultFromMachineState(UNILATERAL_EXIT_MACHINE_STATE.terminated)).toBe(
      'terminated',
    )
    expect(settleResultFromMachineState(UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm)).toBe(
      'waitingConfirm',
    )
    expect(settleResultFromMachineState(UNILATERAL_EXIT_MACHINE_STATE.paused)).toBe('paused')
    expect(settleResultFromMachineState(UNILATERAL_EXIT_MACHINE_STATE.error)).toBe('error')
    expect(settleResultFromMachineState(UNILATERAL_EXIT_MACHINE_STATE.idle)).toBeNull()
  })

  it('settleOutcomeFromSnapshot prefers sticky lastSettleResult after idle', () => {
    const snapshot = {
      status: 'active' as const,
      value: UNILATERAL_EXIT_MACHINE_STATE.idle,
      context: {
        ...createInitialUnilateralExitContext(),
        lastSettleResult: 'branchComplete' as const,
      },
    }
    expect(settleOutcomeFromSnapshot(snapshot).result).toBe('branchComplete')
  })

  it('toastUnilateralExitSettleResult toasts error and waitingConfirm only', () => {
    toastUnilateralExitSettleResult(
      { result: 'error', lastErrorMessage: 'boom' },
      'Unroll step submitted.',
    )
    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(toast.success).not.toHaveBeenCalled()

    vi.mocked(toast.error).mockClear()
    toastUnilateralExitSettleResult(
      { result: 'waitingConfirm', lastErrorMessage: null },
      'Unroll step submitted.',
    )
    expect(toast.success).toHaveBeenCalledWith('Unroll step submitted.')

    vi.mocked(toast.success).mockClear()
    toastUnilateralExitSettleResult(
      { result: 'branchComplete', lastErrorMessage: null },
      'Unroll step submitted.',
    )
    toastUnilateralExitSettleResult(
      { result: 'terminated', lastErrorMessage: 'seized' },
      'Unroll step submitted.',
    )
    toastUnilateralExitSettleResult(
      { result: 'paused', lastErrorMessage: null },
      'Automatic unilateral exit started.',
    )
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
