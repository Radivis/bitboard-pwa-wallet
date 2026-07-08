import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompleteUnilateralExitDialog } from '@/components/wallet/arkade-exit/CompleteUnilateralExitDialog'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { useArkadeExitFlow } from '@/hooks/useArkadeExitFlow'

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
    selectedInProgressTxids: [],
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

describe('CompleteUnilateralExitDialog', () => {
  it('shows operator timelock duration for waiting rows', () => {
    renderWithProviders(
      <CompleteUnilateralExitDialog
        exitFlow={buildExitFlow({
          selectedInProgressTxids: ['aa'.repeat(32)],
          selectedInProgressRows: [
            {
              id: 'vtxo-1',
              txid: 'aa'.repeat(32),
              vout: 0,
              amountSats: 100_000,
              canComplete: false,
              virtualStatusState: 'unrolled',
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
                id: 'ready',
                txid: readyTxid,
                vout: 0,
                amountSats: 50_000,
                canComplete: true,
                virtualStatusState: 'unrolled',
              },
              {
                id: 'waiting',
                txid: waitingTxid,
                vout: 0,
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
    renderWithProviders(
      <CompleteUnilateralExitDialog
        exitFlow={buildExitFlow({
          selectedInProgressTxids: ['aa'.repeat(32)],
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
          selectedInProgressTxids: [virtualTxid],
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

  it('shows indexer-catching-up state instead of destructive error', () => {
    renderWithProviders(
      <CompleteUnilateralExitDialog
        exitFlow={buildExitFlow({
          completeExitMutation: {
            mutate: vi.fn(),
            isPending: false,
            isError: true,
            error: new Error(
              JSON.stringify({
                code: 'operator_indexer_catching_up',
                message: 'Operator indexer is still catching up after unilateral unroll.',
              }),
            ),
          },
        })}
      />,
    )

    expect(screen.getByTestId('arkade-complete-indexer-catching-up')).toBeInTheDocument()
    expect(screen.queryByTestId('arkade-complete-error')).not.toBeInTheDocument()
  })
})
