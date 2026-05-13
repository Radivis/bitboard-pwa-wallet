import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { FiatAmountDisplay } from '@/components/FiatAmountDisplay'
import { renderWithProviders } from '@/test-utils/test-providers'

describe('FiatAmountDisplay', () => {
  it('shows em dash when price missing', () => {
    renderWithProviders(
      <FiatAmountDisplay amountSats={100_000} btcPriceInFiat={null} currency="USD" />,
    )
    expect(screen.getByText(/—/)).toBeInTheDocument()
  })

  it('shows ellipsis when rateLoading', () => {
    renderWithProviders(
      <FiatAmountDisplay
        amountSats={100_000}
        btcPriceInFiat={undefined}
        currency="EUR"
        rateLoading
        data-testid="fiat"
      />,
    )
    expect(screen.getByTestId('fiat')).toHaveTextContent('…')
  })

  it('renders formatted fiat when price present', () => {
    renderWithProviders(
      <FiatAmountDisplay
        amountSats={100_000_000}
        btcPriceInFiat={100_000}
        currency="USD"
        data-testid="fiat"
      />,
    )
    const el = screen.getByTestId('fiat')
    expect(el.textContent).toMatch(/100[,.]?\d*/)
  })
})
