import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { CollaborativeExitContent } from '@/pages/wallet/CollaborativeExitPage'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { useCollaborativeExitFlow } from '@/hooks/useCollaborativeExitFlow'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  }
})

type ExitFlow = ReturnType<typeof useCollaborativeExitFlow>

function buildExitFlow(overrides: Partial<ExitFlow>): ExitFlow {
  return {
    networkMode: 'signet',
    currentAddress: 'tb1qexample',
    balanceQuery: { data: { confirmedSats: 280_603, totalSats: 280_603 } },
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

describe('CollaborativeExitPage', () => {
  it('renders infomode targets and operator fee estimate', () => {
    const { container } = renderWithProviders(<CollaborativeExitContent exitFlow={buildExitFlow({})} />)
    expect(
      container.querySelector(`[data-infomode-id="${ARKADE_INFOMODE_IDS.collaborativeExit}"]`),
    ).not.toBeNull()
    expect(
      container.querySelector(`[data-infomode-id="${ARKADE_INFOMODE_IDS.exitOperatorFees}"]`),
    ).not.toBeNull()
    expect(screen.getByText('Operator fees (estimate)')).toBeInTheDocument()
    expect(screen.getByText(/Estimated operator fee/i)).toBeInTheDocument()
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

    renderWithProviders(<CollaborativeExitContent exitFlow={exitFlow} />)

    expect(screen.getByRole('button', { name: 'Confirm exit' })).toBeEnabled()
  })

  it('disables Confirm exit when fee estimate reports zero cooperative balance', () => {
    const exitFlow = buildExitFlow({
      balanceQuery: {
        data: {
          confirmedSats: 50_000,
          offchainSpendableSats: 0,
          totalSats: 50_000,
        },
      },
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

    renderWithProviders(<CollaborativeExitContent exitFlow={exitFlow} />)

    expect(screen.getByRole('button', { name: 'Confirm exit' })).toBeDisabled()
    expect(
      screen.getByText(/No cooperatively spendable Arkade balance is available/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Cooperatively exit spendable:/i)).toBeInTheDocument()
    expect(screen.queryByText('0.00050000')).not.toBeInTheDocument()
  })

  it('shows rotation cutoff warning and pending recovery balance', () => {
    const exitFlow = buildExitFlow({
      collaborativeExitBlockedByRotation: true,
      balanceQuery: {
        data: {
          confirmedSats: 0,
          totalSats: 50_000,
          pendingRecoveryDueToExpiredSignerSats: 50_000,
        },
      },
      canCollaborativeExit: false,
    })

    renderWithProviders(<CollaborativeExitContent exitFlow={exitFlow} />)

    expect(screen.getByTestId('arkade-collab-exit-rotation-blocked')).toBeInTheDocument()
    expect(screen.getByTestId('arkade-collab-exit-pending-recovery-due-to-expired-signer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm exit' })).toBeDisabled()
  })

  it('disables Confirm exit when amount input is invalid', () => {
    const exitFlow = buildExitFlow({
      collabAmountSats: '0.0006',
      collabAmountError: 'Enter a whole number of satoshis, or leave empty for full balance.',
      canCollaborativeExit: false,
    })

    renderWithProviders(<CollaborativeExitContent exitFlow={exitFlow} />)

    expect(screen.getByRole('button', { name: 'Confirm exit' })).toBeDisabled()
    expect(
      screen.getByText('Enter a whole number of satoshis, or leave empty for full balance.'),
    ).toBeInTheDocument()
  })

  it('shows submit-phase spinner on Confirm exit', () => {
    renderWithProviders(
      <CollaborativeExitContent
        exitFlow={buildExitFlow({
          collaborativeExitSubmitPhase: true,
          collaborativeExitMutation: { mutate: vi.fn(), isPending: true },
        })}
      />,
    )
    expect(screen.getByRole('button', { name: 'Exiting…' })).toBeInTheDocument()
  })
})
