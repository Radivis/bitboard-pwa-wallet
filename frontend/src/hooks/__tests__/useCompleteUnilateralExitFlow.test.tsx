import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ArkadeUnilateralExitInProgressDto } from '@/workers/arkade-api'
import { useWalletStore } from '@/stores/walletStore'

const mutateAsync = vi.hoisted(() => vi.fn(async () => 'txid'))
const scheduleBackgroundBumperWalletSync = vi.hoisted(() => vi.fn())
const clearUnilateralExitJob = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
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

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeUnilateralExitTimelockQuery: () => ({
    data: { unilateralExitTimelockBlocks: 144 },
  }),
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
}))

import { useCompleteUnilateralExitFlow } from '@/hooks/useCompleteUnilateralExitFlow'

describe('useCompleteUnilateralExitFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mutateAsync.mockResolvedValue('txid')
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
    expect(navigate).toHaveBeenCalledWith({ to: '/wallet/management' })
  })

  it('schedules the bumper scan in the background', () => {
    renderHook(() => useCompleteUnilateralExitFlow())

    expect(scheduleBackgroundBumperWalletSync).toHaveBeenCalledWith({
      walletId: 7,
      networkMode: 'regtest',
    })
  })
})
