import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ArkadeUnilateralExitInProgressDto } from '@/workers/arkade-api'
import { useWalletStore } from '@/stores/walletStore'

const mutateAsync = vi.hoisted(() => vi.fn(async () => 'ab'.repeat(32)))
const completionFeeQueryState = vi.hoisted(() => ({
  data: undefined as
    | {
        selectedTotalSats: number
        estimatedFeeSats: number
        estimatedReceiveSats: number
        feeRateSatPerVb: number
        estimateError?: string
      }
    | undefined,
}))
const scheduleBackgroundBumperWalletSync = vi.hoisted(() => vi.fn())
const clearUnilateralExitJob = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
const inProgressRows = vi.hoisted(
  () => ({ current: [] as ArkadeUnilateralExitInProgressDto[] }),
)
const readyRow = vi.hoisted((): ArkadeUnilateralExitInProgressDto => {
  const readyTxid = 'bb'.repeat(32)
  return {
    id: `${readyTxid}:0`,
    txid: readyTxid,
    vout: 0,
    amountSats: 50_000,
    canComplete: true,
    virtualStatusState: 'unrolled',
    phase: 'complete_ready',
  }
})

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime', () => ({
  clearUnilateralExitJob,
}))

vi.mock('@/hooks/useOnchainFeeRateSelection', () => ({
  useOnchainFeeRateSelection: () => ({
    effectiveFeeRate: 2,
    resetFeeSelection: vi.fn(),
    feePresetSelection: 'Medium',
    presetSatPerVbByLabel: { Low: 0.5, Medium: 2, High: 10 },
    feeEstimatesRefreshing: false,
    handleSelectFeePreset: vi.fn(),
    handleSelectCustomMode: vi.fn(),
    customFeeRate: '',
    setCustomFeeRate: vi.fn(),
    useCustomFee: false,
  }),
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({ getAddress: vi.fn() }),
}))

vi.mock('@/lib/arkade/background-bumper-wallet-sync', () => ({
  scheduleBackgroundBumperWalletSync,
}))

const completionFeeQueryParams = vi.hoisted(() => ({
  current: undefined as { readinessRevision?: string } | undefined,
}))

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeUnilateralExitTimelockQuery: () => ({
    data: { unilateralExitTimelockBlocks: 144 },
  }),
  useArkadeCompleteUnilateralExitMutation: () => ({
    mutateAsync,
    isPending: false,
    isError: false,
  }),
  useArkadeUnilateralExitCompletionFeeQuery: (params: {
    readinessRevision?: string
  }) => {
    completionFeeQueryParams.current = params
    return {
      isLoading: false,
      data: completionFeeQueryState.data,
      refetch: vi.fn(),
    }
  },
  useArkadeUnilateralExitsInProgressQuery: () => ({
    isLoading: false,
    data: inProgressRows.current,
    refetch: vi.fn(),
  }),
}))

import { useCompleteUnilateralExitFlow } from '@/hooks/useCompleteUnilateralExitFlow'

describe('useCompleteUnilateralExitFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mutateAsync.mockResolvedValue('ab'.repeat(32))
    completionFeeQueryState.data = undefined
    inProgressRows.current = [readyRow]
    useWalletStore.setState({
      networkMode: 'regtest',
      activeWalletId: 7,
      currentAddress: 'bcrt1qtest',
      arkadeSignerMigrationHint: null,
    })
  })

  it('complete_spend_does_not_dispatch_clear_job', async () => {
    const { result } = renderHook(() => useCompleteUnilateralExitFlow())

    act(() => {
      result.current.toggleInProgressSelection(readyRow)
    })

    await act(async () => {
      result.current.handleCompleteExit()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mutateAsync).toHaveBeenCalled()
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        vtxoOutpoints: [{ txid: readyRow.txid, vout: readyRow.vout }],
        destinationAddress: 'bcrt1qtest',
        feeRateSatPerVb: 2,
      }),
    )
    expect(clearUnilateralExitJob).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({
      to: '/wallet/management',
      search: { completedExitTxid: 'ab'.repeat(32) },
    })
  })

  it('keeps complete disabled when the fee estimate covers a row that is not claimable', () => {
    const waitingTxid = 'cc'.repeat(32)
    const waitingRow: ArkadeUnilateralExitInProgressDto = {
      id: `${waitingTxid}:0`,
      txid: waitingTxid,
      vout: 0,
      amountSats: 10_000,
      canComplete: false,
      virtualStatusState: 'unrolled',
      phase: 'unrolled',
    }
    inProgressRows.current = [readyRow, waitingRow]
    completionFeeQueryState.data = {
      selectedTotalSats: 60_000,
      estimatedFeeSats: 238,
      estimatedReceiveSats: 59_762,
      feeRateSatPerVb: 1.07,
    }

    const { result } = renderHook(() => useCompleteUnilateralExitFlow())
    act(() => {
      result.current.toggleInProgressSelection(readyRow)
      result.current.toggleInProgressSelection(waitingRow)
    })

    expect(result.current.allSelectedCanComplete).toBe(false)
    expect(completionFeeQueryParams.current?.readinessRevision).toBe(
      `${readyRow.txid}:${readyRow.vout}`,
    )
  })

  it('schedules the bumper scan in the background', () => {
    renderHook(() => useCompleteUnilateralExitFlow())

    expect(scheduleBackgroundBumperWalletSync).toHaveBeenCalledWith({
      walletId: 7,
      networkMode: 'regtest',
    })
  })
})
