import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ArkadeRecoverableVtxoBanner } from '@/components/wallet/ArkadeRecoverableVtxoBanner'

const balanceQueryMock = vi.hoisted(() => vi.fn())
const feeQueryMock = vi.hoisted(() => vi.fn())
const recoverMutateMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => balanceQueryMock(),
  useArkadeRecoverableVtxoFeeQuery: () => feeQueryMock(),
  useArkadeRecoverRecoverableVtxosMutation: () => ({
    mutate: recoverMutateMock,
    isPending: false,
  }),
}))

describe('ArkadeRecoverableVtxoBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    balanceQueryMock.mockReturnValue({
      data: {
        recoverableVtxoCount: 2,
        recoverableSats: 50_000,
      },
    })
    feeQueryMock.mockReturnValue({
      isLoading: false,
      data: {
        recoverableVtxoCount: 2,
        recoverableTotalSats: 50_000,
        txFeeRate: '2',
        intentFeeConfigured: {
          offchainInput: true,
          onchainInput: false,
          offchainOutput: false,
          onchainOutput: true,
        },
        estimatedTotalFeeSats: 1_000,
        estimatedReceiveSats: 49_000,
      },
    })
  })

  it('ARK-REC-01 shows banner with count and amounts when recoverable VTXOs exist', () => {
    renderWithProviders(<ArkadeRecoverableVtxoBanner />)
    expect(screen.getByTestId('arkade-recoverable-vtxo-banner')).toBeInTheDocument()
    expect(screen.getByText(/2 VTXOs totaling/)).toBeInTheDocument()
    expect(screen.getByText(/Estimated operator fee/)).toBeInTheDocument()
  })

  it('ARK-REC-02 hides banner when recoverable count is zero', () => {
    balanceQueryMock.mockReturnValue({
      data: { recoverableVtxoCount: 0, recoverableSats: 0 },
    })
    renderWithProviders(<ArkadeRecoverableVtxoBanner />)
    expect(screen.queryByTestId('arkade-recoverable-vtxo-banner')).not.toBeInTheDocument()
  })

  it('ARK-REC-03 recover now calls mutation', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ArkadeRecoverableVtxoBanner />)
    await user.click(screen.getByRole('button', { name: 'Recover now' }))
    expect(recoverMutateMock).toHaveBeenCalledTimes(1)
  })

  it('ARK-REC-04 allows recover now when fee estimate fails', () => {
    feeQueryMock.mockReturnValue({
      isLoading: false,
      data: {
        recoverableVtxoCount: 2,
        recoverableTotalSats: 50_000,
        txFeeRate: '2',
        intentFeeConfigured: {
          offchainInput: true,
          onchainInput: false,
          offchainOutput: false,
          onchainOutput: true,
        },
        estimatedTotalFeeSats: null,
        estimatedReceiveSats: null,
        estimateError: 'operator unreachable',
      },
    })
    renderWithProviders(<ArkadeRecoverableVtxoBanner />)
    expect(screen.getByText(/Could not estimate the operator fee/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recover now' })).toBeEnabled()
  })
})
