import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
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
})
