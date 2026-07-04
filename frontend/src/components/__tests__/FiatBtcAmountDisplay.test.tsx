import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { FiatBtcAmountDisplay } from '@/components/FiatBtcAmountDisplay'
import { renderWithProviders } from '@/test-utils/test-providers'

describe('FiatBtcAmountDisplay', () => {
  it('renders BTC-only when showFiatLayout is false', () => {
    renderWithProviders(
      <FiatBtcAmountDisplay
        amountSats={100_000}
        showFiatLayout={false}
        btcPriceInFiat={100_000}
        currency="USD"
        data-testid="amount"
      />,
    )

    expect(screen.getByTestId('amount')).toHaveTextContent('0.00100000')
    expect(screen.queryByTestId('amount-btc-segment')).not.toBeInTheDocument()
  })

  it('renders inline fiat and BTC when showFiatLayout is true and rate is available', () => {
    renderWithProviders(
      <FiatBtcAmountDisplay
        amountSats={100_000}
        showFiatLayout
        btcPriceInFiat={100_000}
        currency="USD"
        data-testid="amount"
      />,
    )

    expect(screen.getByTestId('amount')).toHaveTextContent(/\$100/)
    expect(screen.getByTestId('amount-btc-segment')).toHaveTextContent('0.00100000')
    expect(screen.getByTestId('amount-btc-segment')).toHaveClass('whitespace-nowrap')
    expect(screen.getByTestId('amount-wrapper')).toHaveClass('items-center')
  })

  it('uses sm sizing for both parts when isDetail is false', () => {
    const { container } = renderWithProviders(
      <FiatBtcAmountDisplay
        amountSats={100_000}
        showFiatLayout
        btcPriceInFiat={100_000}
        currency="USD"
        isDetail={false}
        data-testid="detail-amount"
      />,
    )

    const smSizedElements = container.querySelectorAll('.text-sm')
    expect(smSizedElements.length).toBeGreaterThanOrEqual(2)
  })

  it('shows em dash fiat and BTC inline when rate is missing', () => {
    renderWithProviders(
      <FiatBtcAmountDisplay
        amountSats={50_000}
        showFiatLayout
        btcPriceInFiat={null}
        currency="USD"
        data-testid="amount"
      />,
    )

    expect(screen.getByTestId('amount')).toHaveTextContent(/—/)
    expect(screen.getByTestId('amount-btc-segment')).toHaveTextContent('0.00050000')
  })

  it('inherits row color from className instead of forcing muted BTC', () => {
    renderWithProviders(
      <FiatBtcAmountDisplay
        amountSats={100_000}
        showFiatLayout
        btcPriceInFiat={100_000}
        currency="USD"
        isDetail={false}
        className="text-yellow-600"
        data-testid="pending-amount"
      />,
    )

    const wrapper = screen.getByTestId('pending-amount-wrapper')
    const btcSegment = screen.getByTestId('pending-amount-btc-segment')
    expect(wrapper).toHaveClass('text-yellow-600')
    expect(btcSegment).not.toHaveClass('text-muted-foreground')
  })
})
