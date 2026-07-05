import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnilateralExitDialog } from '@/components/wallet/arkade-exit/UnilateralExitDialog'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { useArkadeExitFlow } from '@/hooks/useArkadeExitFlow'

type ExitFlow = ReturnType<typeof useArkadeExitFlow>

function buildExitFlow(overrides: Partial<ExitFlow>): ExitFlow {
  return {
    unilateralOpen: true,
    setUnilateralOpen: vi.fn(),
    unilateralStep: 'select',
    setUnilateralStep: vi.fn(),
    selectedCandidate: null,
    unrollProgress: [],
    unrolledVtxoTxid: null,
    completeDestination: '',
    setCompleteDestination: vi.fn(),
    exitCandidatesQuery: { isLoading: false, data: [] },
    bumperInfoQuery: {
      data: { address: 'tb1qh6gfz5tdgdcx6jlwy99kj6a3k0mmzssgx4dleh', balanceSats: 50_000 },
    },
    unilateralFeeQuery: { isLoading: false, isError: false, data: undefined },
    unrollMutation: { mutate: vi.fn(), isPending: false },
    completeExitMutation: { mutate: vi.fn(), isPending: false },
    bumperBalance: 50_000,
    unilateralFeeEstimate: undefined,
    bumperLow: false,
    handleStartUnroll: vi.fn(),
    handleCompleteExit: vi.fn(),
    skipToComplete: vi.fn(),
    selectCandidate: vi.fn(),
    ...overrides,
  } as unknown as ExitFlow
}

describe('UnilateralExitDialog', () => {
  it('explains empty operator VTXO list without recoverable-bucket wording', () => {
    renderWithProviders(<UnilateralExitDialog exitFlow={buildExitFlow({})} />)

    const emptyMessage = screen.getByTestId('arkade-unilateral-exit-empty')
    expect(emptyMessage).toHaveTextContent(/No VTXOs reported by the operator/i)
    expect(emptyMessage).toHaveTextContent(/bumper wallet/i)
    expect(emptyMessage).not.toHaveTextContent(/No recoverable VTXOs found/i)
  })

  it('copies bumper wallet address on click', async () => {
    const user = userEvent.setup()
    const bumperAddress = 'tb1qh6gfz5tdgdcx6jlwy99kj6a3k0mmzssgx4dleh'
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })

    renderWithProviders(
      <UnilateralExitDialog
        exitFlow={buildExitFlow({
          exitCandidatesQuery: {
            isLoading: false,
            data: [
              {
                id: 'vtxo-1',
                txid: 'aa'.repeat(32),
                vout: 0,
                amountSats: 100_000,
                canStartUnroll: true,
                canComplete: false,
                virtualStatusState: 'settled',
                isUnrolled: false,
              },
            ],
          },
          bumperInfoQuery: {
            data: { address: bumperAddress, balanceSats: 50_000 },
          },
        })}
      />,
    )

    await user.click(screen.getByTestId('arkade-bumper-address'))
    expect(writeTextMock).toHaveBeenCalledWith(bumperAddress)
  })

  it('shows operator timelock duration on complete step', () => {
    renderWithProviders(
      <UnilateralExitDialog
        exitFlow={buildExitFlow({
          unilateralStep: 'complete',
          completeDestination: 'bc1pexample',
          selectedCandidate: {
            id: 'vtxo-1',
            txid: 'aa'.repeat(32),
            vout: 0,
            amountSats: 100_000,
            canStartUnroll: false,
            canComplete: false,
            virtualStatusState: 'unrolled',
            isUnrolled: true,
            isRecoverable: false,
          },
          bumperInfoQuery: {
            data: {
              address: 'tb1qh6gfz5tdgdcx6jlwy99kj6a3k0mmzssgx4dleh',
              balanceSats: 50_000,
              unilateralExitTimelockBlocks: 144,
            },
          },
        })}
      />,
    )

    expect(screen.getByTestId('arkade-unilateral-complete-timelock')).toHaveTextContent(
      /144 block confirmations/i,
    )
  })

  it('copies destination address from complete step', async () => {
    const user = userEvent.setup()
    const destination = 'bc1p5pk0cgwwumwarqpdcdqczfjrhjkmnyhgf9ac6m5au4k7u7cqk9q0ss8c8q'
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })

    renderWithProviders(
      <UnilateralExitDialog
        exitFlow={buildExitFlow({
          unilateralStep: 'complete',
          completeDestination: destination,
        })}
      />,
    )

    await user.click(screen.getByTestId('arkade-complete-destination-copy'))
    expect(writeTextMock).toHaveBeenCalledWith(destination)
  })
})
