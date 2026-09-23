import { beforeEach, describe, expect, it, vi } from 'vitest'

const proceedUnilateralExitStep = vi.fn(async () => ({
  stepIndex: 0,
  totalSteps: 1,
  phase: 'waiting',
  currentStepTxRelayed: true,
  nodeStatuses: [],
  leafStatuses: [],
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({ proceedUnilateralExitStep }),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  awaitArkadeLoadQuiescence: vi.fn(async () => {}),
}))

const persistBumperSidecarBestEffort = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/lib/wallet/persist-bumper-sidecar-after-sync', () => ({
  persistBumperSidecarBestEffort: (...args: unknown[]) =>
    persistBumperSidecarBestEffort(...args),
}))

import { proceedUnilateralExitStepWithGuards } from '@/lib/arkade/proceed-unilateral-exit-step'

const walletScope = {
  walletId: 1,
  networkMode: 'regtest' as const,
  arkadeAccountId: 'conn-1',
}

const leaf = { txid: 'aa'.repeat(32), vout: 0 }

describe('proceedUnilateralExitStepWithGuards', () => {
  beforeEach(() => {
    proceedUnilateralExitStep.mockClear()
    persistBumperSidecarBestEffort.mockClear()
    proceedUnilateralExitStep.mockResolvedValue({
      stepIndex: 0,
      totalSteps: 1,
      phase: 'waiting',
      currentStepTxRelayed: true,
      nodeStatuses: [],
      leafStatuses: [],
    })
  })

  it('passes walletScope to proceedUnilateralExitStep', async () => {
    await proceedUnilateralExitStepWithGuards({
      walletScope,
      vtxoOutpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    expect(proceedUnilateralExitStep).toHaveBeenCalledWith({
      walletScope,
      vtxoOutpoints: [leaf],
      feeRateSatPerVb: 2,
    })
  })

  it('persists sidecar only after success', async () => {
    await proceedUnilateralExitStepWithGuards({
      walletScope,
      vtxoOutpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    expect(persistBumperSidecarBestEffort).toHaveBeenCalledWith(
      {
        walletId: walletScope.walletId,
        networkMode: walletScope.networkMode,
      },
      'after proceed',
    )
  })

  it('does not persist sidecar when proceed fails', async () => {
    proceedUnilateralExitStep.mockRejectedValueOnce(new Error('relay failed'))

    await expect(
      proceedUnilateralExitStepWithGuards({
        walletScope,
        vtxoOutpoints: [leaf],
        feeRateSatPerVb: 2,
      }),
    ).rejects.toThrow('relay failed')

    expect(persistBumperSidecarBestEffort).not.toHaveBeenCalled()
  })
})
