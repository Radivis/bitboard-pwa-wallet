import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { ArkadeBalanceBreakdown } from '@/components/wallet/ArkadeBalanceBreakdown'
import { renderWithProviders } from '@/test-utils/test-providers'

describe('ArkadeBalanceBreakdown', () => {
  it('shows bumper wallet separately from headline balance', () => {
    renderWithProviders(
      <ArkadeBalanceBreakdown
        balance={{
          confirmedSats: 50_000,
          offchainSpendableSats: 0,
          onchainBumperSats: 50_000,
          totalSats: 50_000,
        }}
        amountTestId="arkade-balance-amount"
      />,
    )

    expect(screen.getByTestId('arkade-balance-amount')).toHaveTextContent('0.00000000')
    expect(screen.getByTestId('arkade-balance-bumper')).toHaveTextContent('Bumper wallet (exit fees)')
    expect(screen.queryByText('Total (incl. recoverable):')).not.toBeInTheDocument()
  })

  it('shows negative exit in progress lines', () => {
    renderWithProviders(
      <ArkadeBalanceBreakdown
        balance={{
          confirmedSats: 19_397,
          totalSats: 19_397,
          unilateralExitInProgressSats: 180_603,
          collaborativeExitInProgressSats: 50_000,
        }}
      />,
    )

    expect(screen.getByTestId('arkade-balance-unilateral-exit')).toHaveTextContent(
      /Unilateral exit in progress/,
    )
    expect(screen.getByTestId('arkade-balance-collaborative-exit')).toHaveTextContent(
      /Collaborative exit in progress/,
    )
  })

  it('shows pending operator sweep line when recoverable VTXOs await operator sweep', () => {
    renderWithProviders(
      <ArkadeBalanceBreakdown
        balance={{
          confirmedSats: 10_000,
          totalSats: 35_000,
          recoverablePendingOperatorSweepSats: 25_000,
          recoverablePendingOperatorSweepVtxoCount: 2,
        }}
      />,
    )

    expect(screen.getByTestId('arkade-balance-recoverable-pending-operator-sweep')).toHaveTextContent(
      /Expired — waiting for operator sweep \(2 VTXOs\)/,
    )
  })
})
