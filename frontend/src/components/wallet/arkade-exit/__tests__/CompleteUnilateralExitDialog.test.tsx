import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompleteUnilateralExitDialog } from '@/components/wallet/arkade-exit/CompleteUnilateralExitDialog'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { useArkadeExitFlow } from '@/hooks/useArkadeExitFlow'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'

vi.mock('@/hooks/useUnilateralExitLifecycleSnapshot', () => ({
  useVtxoExitSnapshots: () => ({}),
}))

type ExitFlow = ReturnType<typeof useArkadeExitFlow>

function buildExitFlow(overrides: Partial<ExitFlow>): ExitFlow {
  return {
    completeUnilateralOpen: true,
    setCompleteUnilateralOpen: vi.fn(),
    inProgressQuery: { isLoading: false, data: [] },
    bumperInfoQuery: {
      data: {
        address: 'tb1qh6gfz5tdgdcx6jlwy99kj6a3k0mmzssgx4dleh',
        balanceSats: 50_000,
        unilateralExitTimelockBlocks: 144,
      },
    },
    completionFeeQuery: { isLoading: false, data: undefined },
    completionFeeRateUi: {
      feePresetSelection: 'Medium' as const,
      presetSatPerVbByLabel: { Low: 0.5, Medium: 2, High: 10 },
      feeEstimatesRefreshing: false,
      handleSelectFeePreset: vi.fn(),
      handleSelectCustomMode: vi.fn(),
      customFeeRate: '',
      setCustomFeeRate: vi.fn(),
      useCustomFee: false,
    },
    completeExitMutation: { mutate: vi.fn(), isPending: false, isError: false },
    selectedInProgressOutpoints: [],
    selectedInProgressRows: [],
    selectedInProgressTotalSats: 0,
    allSelectedCanComplete: false,
    completeDestination: '',
    setCompleteDestination: vi.fn(),
    toggleInProgressSelection: vi.fn(),
    selectAllReadyInProgress: vi.fn(),
    handleCompleteExit: vi.fn(),
    ...overrides,
  } as unknown as ExitFlow
}

function outpoint(txid: string, vout = 0): ArkadeVtxoOutpoint {
  return { txid, vout }
}

describe('CompleteUnilateralExitDialog', () => {
  it('shows operator timelock duration for waiting rows', () => {
    const waitingTxid = 'aa'.repeat(32)
    renderWithProviders(
      <CompleteUnilateralExitDialog
        exitFlow={buildExitFlow({
          selectedInProgressOutpoints: [outpoint(waitingTxid)],
          selectedInProgressRows: [
            {
              id: `${waitingTxid}:0`,
              txid: waitingTxid,
              vout: 0,
              amountSats: 100_000,
              canComplete: false,
              virtualStatusState: 'unrolled',
              phase: 'unrolled',
            },
          ],
        })}
      />,
    )

    expect(screen.getByTestId('arkade-unilateral-complete-waiting')).toHaveTextContent(
      /144 block confirmations/i,
    )
  })

  it('select all ready checks every ready row', async () => {
    const user = userEvent.setup()
    const selectAllReadyInProgress = vi.fn()
    const readyTxid = 'bb'.repeat(32)
    const waitingTxid = 'cc'.repeat(32)

    renderWithProviders(
      <CompleteUnilateralExitDialog
        exitFlow={buildExitFlow({
          inProgressQuery: {
            isLoading: false,
            data: [
              {
                id: `${readyTxid}:0`,
                txid: readyTxid,
                vout: 0,
                amountSats: 50_000,
                canComplete: true,
                virtualStatusState: 'unrolled',
              },
              {
                id: `${waitingTxid}:1`,
                txid: waitingTxid,
                vout: 1,
                amountSats: 75_000,
                canComplete: false,
                virtualStatusState: 'unrolled',
              },
            ],
          },
          selectAllReadyInProgress,
        })}
      />,
    )

    await user.click(screen.getByTestId('arkade-unilateral-select-all-ready'))
    expect(selectAllReadyInProgress).toHaveBeenCalled()
  })

  it('shows completion fee preview when selection and estimate are available', () => {
    const virtualTxid = 'aa'.repeat(32)
    renderWithProviders(
      <CompleteUnilateralExitDialog
        exitFlow={buildExitFlow({
          selectedInProgressOutpoints: [outpoint(virtualTxid, 2)],
          completionFeeQuery: {
            isLoading: false,
            data: {
              selectedTotalSats: 200_000,
              estimatedFeeSats: 1_500,
              estimatedReceiveSats: 198_500,
              feeRateSatPerVb: 2,
            },
          },
        })}
      />,
    )

    const feePanel = screen.getByTestId('arkade-unilateral-completion-fee')
    expect(feePanel).toHaveTextContent(/2(\.00)? sat\/vB/)
    expect(feePanel).toHaveTextContent(/0\.00001500/)
    expect(feePanel).toHaveTextContent(/0\.00198500/)
  })

  it('shows blocktime warning list when estimate includes missingBlocktimeInputs', () => {
    const virtualTxid = 'dd'.repeat(32)
    renderWithProviders(
      <CompleteUnilateralExitDialog
        exitFlow={buildExitFlow({
          selectedInProgressOutpoints: [outpoint(virtualTxid, 0)],
          completionFeeQuery: {
            isLoading: false,
            data: {
              selectedTotalSats: 200_000,
              estimatedFeeSats: 1_500,
              estimatedReceiveSats: 198_500,
              feeRateSatPerVb: 2,
              missingBlocktimeInputs: [
                {
                  virtualTxid,
                  onChainTxid: virtualTxid,
                  onChainVout: 0,
                  amountSats: 200_000,
                },
              ],
            },
          },
        })}
      />,
    )

    const warning = screen.getByTestId('arkade-complete-blocktime-warning')
    expect(warning).toHaveTextContent(/Esplora did not report a confirmation time/)
    expect(warning).toHaveTextContent(virtualTxid.slice(0, 12))
  })

  it('complete_dialog_aborted_host_confirmed_shows_confirmations_copy', () => {
    const waitingTxid = 'aa'.repeat(32)
    const row = {
      id: `${waitingTxid}:0`,
      txid: waitingTxid,
      vout: 0,
      amountSats: 100_000,
      canComplete: false,
      virtualStatusState: 'unrolled',
      phase: 'host_confirmed' as const,
    }
    renderWithProviders(
      <CompleteUnilateralExitDialog
        exitFlow={buildExitFlow({
          inProgressQuery: { isLoading: false, data: [row] },
          selectedInProgressOutpoints: [outpoint(waitingTxid)],
          selectedInProgressRows: [row],
          allSelectedCanComplete: false,
        })}
      />,
    )

    expect(screen.getByTestId('arkade-unilateral-complete-row-phase')).toHaveTextContent(
      /waiting for 6 confirmations/i,
    )
    expect(screen.getByTestId('arkade-unilateral-complete-row-phase')).not.toHaveTextContent(
      /waiting for first confirmation/i,
    )
    expect(screen.getByTestId('arkade-unilateral-complete-row-phase')).not.toHaveTextContent(
      /waiting for timelock/i,
    )
    expect(screen.getByTestId('arkade-unilateral-complete-waiting')).toHaveTextContent(
      /6 on-chain confirmations/i,
    )
    expect(screen.getByRole('button', { name: 'Complete exit' })).toBeDisabled()
  })

  it('complete_dialog_host_relayed_shows_first_confirmation_copy', () => {
    const waitingTxid = 'aa'.repeat(32)
    const row = {
      id: `${waitingTxid}:0`,
      txid: waitingTxid,
      vout: 0,
      amountSats: 100_000,
      canComplete: false,
      virtualStatusState: 'unrolled',
      phase: 'host_relayed' as const,
    }
    renderWithProviders(
      <CompleteUnilateralExitDialog
        exitFlow={buildExitFlow({
          inProgressQuery: { isLoading: false, data: [row] },
          selectedInProgressOutpoints: [outpoint(waitingTxid)],
          selectedInProgressRows: [row],
          allSelectedCanComplete: false,
        })}
      />,
    )

    expect(screen.getByTestId('arkade-unilateral-complete-row-phase')).toHaveTextContent(
      /waiting for first confirmation/i,
    )
    expect(screen.getByTestId('arkade-unilateral-complete-row-phase')).not.toHaveTextContent(
      /waiting for host transaction broadcast/i,
    )
    expect(screen.getByTestId('arkade-unilateral-complete-row-phase')).not.toHaveTextContent(
      /waiting for 6 confirmations/i,
    )
    expect(screen.getByTestId('arkade-unilateral-complete-waiting')).toHaveTextContent(
      /first on-chain confirmation/i,
    )
    expect(screen.getByRole('button', { name: 'Complete exit' })).toBeDisabled()
  })

  it('complete_dialog_host_broadcast_attempted_shows_host_broadcast_copy', () => {
    const waitingTxid = 'aa'.repeat(32)
    const row = {
      id: `${waitingTxid}:0`,
      txid: waitingTxid,
      vout: 0,
      amountSats: 100_000,
      canComplete: false,
      virtualStatusState: 'unrolled',
      phase: 'host_broadcast_attempted' as const,
    }
    renderWithProviders(
      <CompleteUnilateralExitDialog
        exitFlow={buildExitFlow({
          inProgressQuery: { isLoading: false, data: [row] },
          selectedInProgressOutpoints: [outpoint(waitingTxid)],
          selectedInProgressRows: [row],
          allSelectedCanComplete: false,
        })}
      />,
    )

    expect(screen.getByTestId('arkade-unilateral-complete-row-phase')).toHaveTextContent(
      /waiting for host transaction broadcast/i,
    )
    expect(screen.getByTestId('arkade-unilateral-complete-row-phase')).not.toHaveTextContent(
      /waiting for first confirmation/i,
    )
    expect(screen.getByTestId('arkade-unilateral-complete-waiting')).toHaveTextContent(
      /host transaction to broadcast/i,
    )
    expect(screen.getByRole('button', { name: 'Complete exit' })).toBeDisabled()
  })

  it('complete_dialog_unrolled_shows_timelock_copy', () => {
    const waitingTxid = 'aa'.repeat(32)
    const row = {
      id: `${waitingTxid}:0`,
      txid: waitingTxid,
      vout: 0,
      amountSats: 100_000,
      canComplete: false,
      virtualStatusState: 'unrolled',
      phase: 'unrolled' as const,
    }
    renderWithProviders(
      <CompleteUnilateralExitDialog
        exitFlow={buildExitFlow({
          inProgressQuery: { isLoading: false, data: [row] },
          selectedInProgressOutpoints: [outpoint(waitingTxid)],
          selectedInProgressRows: [row],
        })}
      />,
    )

    expect(screen.getByTestId('arkade-unilateral-complete-row-phase')).toHaveTextContent(
      /waiting for timelock/i,
    )
  })

  it('complete_dialog_complete_ready_shows_ready', () => {
    const readyTxid = 'bb'.repeat(32)
    const row = {
      id: `${readyTxid}:0`,
      txid: readyTxid,
      vout: 0,
      amountSats: 50_000,
      canComplete: true,
      virtualStatusState: 'unrolled',
      phase: 'complete_ready' as const,
    }
    renderWithProviders(
      <CompleteUnilateralExitDialog
        exitFlow={buildExitFlow({
          inProgressQuery: { isLoading: false, data: [row] },
          selectedInProgressOutpoints: [outpoint(readyTxid)],
          selectedInProgressRows: [row],
          allSelectedCanComplete: true,
          completeDestination: 'bcrt1qready',
        })}
      />,
    )

    expect(screen.getByTestId('arkade-unilateral-complete-row-phase')).toHaveTextContent(
      /ready to complete/i,
    )
    expect(screen.queryByTestId('arkade-unilateral-complete-waiting')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete exit' })).toBeEnabled()
  })

  it('lists rows when the job snapshot is empty', () => {
    const leftoverTxid = 'cc'.repeat(32)
    renderWithProviders(
      <CompleteUnilateralExitDialog
        exitFlow={buildExitFlow({
          inProgressQuery: {
            isLoading: false,
            data: [
              {
                id: `${leftoverTxid}:0`,
                txid: leftoverTxid,
                vout: 0,
                amountSats: 75_000,
                canComplete: false,
                virtualStatusState: 'unrolled',
                phase: 'unrolled',
              },
            ],
          },
        })}
      />,
    )

    expect(screen.queryByTestId('arkade-unilateral-complete-empty')).not.toBeInTheDocument()
    expect(screen.getByTestId('arkade-unilateral-complete-row-phase')).toHaveTextContent(
      /waiting for timelock/i,
    )
  })
})
