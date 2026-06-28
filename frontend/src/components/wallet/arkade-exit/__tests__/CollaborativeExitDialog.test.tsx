import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { CollaborativeExitDialog } from '@/components/wallet/arkade-exit/CollaborativeExitDialog'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { useArkadeExitFlow } from '@/hooks/useArkadeExitFlow'

type ExitFlow = ReturnType<typeof useArkadeExitFlow>

function buildExitFlow(overrides: Partial<ExitFlow>): ExitFlow {
  return {
    networkMode: 'signet',
    currentAddress: 'tb1qexample',
    balanceQuery: { data: { confirmedSats: 280_603, totalSats: 280_603 } },
    collaborativeOpen: true,
    setCollaborativeOpen: vi.fn(),
    collabDestination: 'tb1pa5gq79tt8mnhe9hqus3rhnw3cr4gt4spy86cv0x92ck',
    setCollabDestination: vi.fn(),
    collabAmountSats: '',
    setCollabAmountSats: vi.fn(),
    collabAmount: undefined,
    collaborativeFeeQuery: {
      isLoading: false,
      isError: false,
      data: {
        txFeeRate: '0',
        intentFeeConfigured: {
          offchainInput: false,
          onchainInput: false,
          offchainOutput: false,
          onchainOutput: false,
        },
        estimatedTotalFeeSats: 0,
        estimatedReceiveSats: 280_603,
      },
    },
    collaborativeExitMutation: { mutate: vi.fn(), isPending: false },
    canCollaborativeExit: true,
    handleCollaborativeExit: vi.fn(),
    ...overrides,
  } as unknown as ExitFlow
}

describe('CollaborativeExitDialog', () => {
  it('renders Infomode toggle in the modal header', () => {
    renderWithProviders(<CollaborativeExitDialog exitFlow={buildExitFlow({})} />)
    expect(screen.getByRole('button', { name: 'Turn on infomode' })).toBeInTheDocument()
  })

  it('enables Confirm exit when fee estimate returns non-funds estimateError', () => {
    const exitFlow = buildExitFlow({
      collaborativeFeeQuery: {
        isLoading: false,
        isError: false,
        data: {
          txFeeRate: '0',
          intentFeeConfigured: {
            offchainInput: false,
            onchainInput: false,
            offchainOutput: false,
            onchainOutput: false,
          },
          estimateError: 'failed to convert between types: missing fee',
        },
      },
    })

    renderWithProviders(<CollaborativeExitDialog exitFlow={exitFlow} />)

    expect(screen.getByRole('button', { name: 'Confirm exit' })).toBeEnabled()
  })

  it('disables Confirm exit when fee estimate reports zero cooperative balance', () => {
    const exitFlow = buildExitFlow({
      collaborativeFeeQuery: {
        isLoading: false,
        isError: false,
        data: {
          txFeeRate: '0',
          intentFeeConfigured: {
            offchainInput: false,
            onchainInput: false,
            offchainOutput: false,
            onchainOutput: false,
          },
          estimateError: 'cannot afford to send 0.00050000 BTC, only have 0 BTC',
          estimateErrorCode: 'insufficient_cooperative_inputs',
        },
      },
      canCollaborativeExit: false,
      collaborativeExitBlockedByFunds: true,
    })

    renderWithProviders(<CollaborativeExitDialog exitFlow={exitFlow} />)

    expect(screen.getByRole('button', { name: 'Confirm exit' })).toBeDisabled()
    expect(screen.getByText(/unilateral exit/i)).toBeInTheDocument()
  })

  it('shows rotation cutoff warning and pending recovery balance', () => {
    const exitFlow = buildExitFlow({
      collaborativeExitBlockedByRotation: true,
      balanceQuery: {
        data: {
          confirmedSats: 0,
          totalSats: 50_000,
          pendingRecoverySats: 50_000,
        },
      },
      canCollaborativeExit: false,
    })

    renderWithProviders(<CollaborativeExitDialog exitFlow={exitFlow} />)

    expect(screen.getByTestId('arkade-collab-exit-rotation-blocked')).toBeInTheDocument()
    expect(screen.getByTestId('arkade-collab-exit-pending-recovery')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm exit' })).toBeDisabled()
  })

  it('disables Confirm exit when amount input is invalid', () => {
    const exitFlow = buildExitFlow({
      collabAmountSats: '0.0006',
      collabAmountError: 'Enter a whole number of satoshis, or leave empty for full balance.',
      canCollaborativeExit: false,
    })

    renderWithProviders(<CollaborativeExitDialog exitFlow={exitFlow} />)

    expect(screen.getByRole('button', { name: 'Confirm exit' })).toBeDisabled()
    expect(
      screen.getByText('Enter a whole number of satoshis, or leave empty for full balance.'),
    ).toBeInTheDocument()
  })
})
