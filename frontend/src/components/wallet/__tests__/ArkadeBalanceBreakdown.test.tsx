import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { ArkadeBalanceBreakdown } from '@/components/wallet/ArkadeBalanceBreakdown'
import { renderWithProviders } from '@/test-utils/test-providers'

describe('ArkadeBalanceBreakdown', () => {
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
})
