import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ArkadeUnilateralExitInProgressDto } from '@/workers/arkade-api'

const mutateAsync = vi.hoisted(() => vi.fn(async () => 'txid'))
const clearUnilateralExitJob = vi.hoisted(() => vi.fn())
const readyTxid = 'bb'.repeat(32)
const readyRow: ArkadeUnilateralExitInProgressDto = {
  id: `${readyTxid}:0`,
  txid: readyTxid,
  vout: 0,
  amountSats: 50_000,
  canComplete: true,
  virtualStatusState: 'unrolled',
  phase: 'complete_ready',
}

vi.mock('@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime', () => ({
  clearUnilateralExitJob,
}))

vi.mock('@/stores/walletStore', () => {
  const walletState = {
    networkMode: 'regtest',
    currentAddress: 'bcrt1qtest',
    arkadeSignerMigrationHint: null,
  }
  return {
    useWalletStore: (selector: (state: typeof walletState) => unknown) => selector(walletState),
  }
})

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

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => ({ data: { unilateralExitInProgressSats: 0 } }),
  useArkadeBumperInfoQuery: () => ({ data: undefined }),
  useArkadeCollaborativeExitFeeQuery: () => ({ data: undefined }),
  useArkadeCollaborativeExitMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeCompleteUnilateralExitMutation: () => ({
    mutateAsync,
    isPending: false,
    isError: false,
  }),
  useArkadeUnilateralExitCompletionFeeQuery: () => ({ isLoading: false, data: undefined }),
  useArkadeUnilateralExitsInProgressQuery: () => ({
    isLoading: false,
    data: [readyRow],
  }),
  useHasPendingBatchIntent: () => false,
  useHasPendingBatchIntentKind: () => false,
  usePendingBatchIntents: () => [],
}))

import { useArkadeExitFlow } from '@/hooks/useArkadeExitFlow'

describe('useArkadeExitFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mutateAsync.mockResolvedValue('txid')
  })

  it('complete_spend_does_not_dispatch_clear_job', async () => {
    const { result } = renderHook(() => useArkadeExitFlow())

    act(() => {
      result.current.setCompleteUnilateralOpen(true)
    })
    act(() => {
      result.current.toggleInProgressSelection(readyRow)
    })

    await act(async () => {
      result.current.handleCompleteExit()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mutateAsync).toHaveBeenCalled()
    expect(clearUnilateralExitJob).not.toHaveBeenCalled()
  })
})
