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
    exitCandidatesQuery: { isLoading: false, data: [] },
    inProgressQuery: { isLoading: false, data: [] },
    bumperInfoQuery: {
      data: { address: 'tb1qh6gfz5tdgdcx6jlwy99kj6a3k0mmzssgx4dleh', balanceSats: 50_000 },
    },
    unilateralFeeQuery: { isLoading: false, isError: false, data: undefined },
    unrollMutation: { mutate: vi.fn(), isPending: false, isError: false },
    bumperBalance: 50_000,
    unilateralFeeEstimate: undefined,
    bumperLow: false,
    unilateralExitInProgressSats: 0,
    handleStartUnroll: vi.fn(),
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

  it('points to complete flow when funds are already exiting', () => {
    renderWithProviders(
      <UnilateralExitDialog
        exitFlow={buildExitFlow({
          unilateralExitInProgressSats: 180_603,
          inProgressQuery: { isLoading: false, data: [{ id: '1', txid: 'aa', vout: 0, amountSats: 180_603, virtualStatusState: 'unrolled', canComplete: false }] },
        })}
      />,
    )

    expect(screen.getByTestId('arkade-unilateral-exit-empty')).toHaveTextContent(
      /Complete unilateral exit/i,
    )
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
                isRecoverable: false,
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
})
