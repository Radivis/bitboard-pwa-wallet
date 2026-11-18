import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { UniversalAmountInput } from '@/components/UniversalAmountInput'
import { fiatAmountInputPlaceholder } from '@/lib/fiat/format-fiat-display'
import { renderWithProviders } from '@/test-utils/test-providers'
import { useBitcoinDisplayUnitStore } from '@/stores/bitcoinDisplayUnitStore'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { useWalletStore } from '@/stores/walletStore'

const fiatRatesQueryMock = vi.hoisted(() =>
  vi.fn(() => ({
    data: undefined as { btcPriceInFiat: number } | undefined,
    isPending: false,
  })),
)

vi.mock('@/hooks/useMainnetFiatRatesQuery', () => ({
  useMainnetFiatRatesQuery: () => fiatRatesQueryMock(),
}))

describe('UniversalAmountInput', () => {
  beforeEach(() => {
    useBitcoinDisplayUnitStore.setState({ defaultBitcoinUnit: 'sat' })
    useFiatDenominationStore.setState({ fiatDenominationMode: false, defaultFiatCurrency: 'USD' })
    useWalletStore.setState({ networkMode: 'signet', loadedDescriptorWallet: null })
    fiatRatesQueryMock.mockReturnValue({ data: undefined, isPending: false })
  })

  it('uses the Settings unit when no override is passed', () => {
    useBitcoinDisplayUnitStore.setState({ defaultBitcoinUnit: 'mBTC' })
    renderWithProviders(<UniversalAmountInput value="" onChange={() => undefined} />)

    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', '0.00000')
    expect(screen.getByRole('textbox')).toHaveAttribute('inputMode', 'decimal')
  })

  it('uses a Bitcoin unit override ahead of Settings', () => {
    renderWithProviders(
      <UniversalAmountInput value="" onChange={() => undefined} bitcoinUnit="BTC" />,
    )

    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', '0.00000000')
  })

  it('uses the fiat currency on mainnet when fiat mode is on, including over a unit override', () => {
    useWalletStore.setState({ networkMode: 'mainnet', loadedDescriptorWallet: null })
    useFiatDenominationStore.setState({ fiatDenominationMode: true, defaultFiatCurrency: 'USD' })
    fiatRatesQueryMock.mockReturnValue({ data: { btcPriceInFiat: 100_000 }, isPending: false })
    renderWithProviders(
      <UniversalAmountInput
        value="10"
        onChange={() => undefined}
        bitcoinUnit="BTC"
        previewTestId="amount-btc-preview"
      />,
    )

    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      fiatAmountInputPlaceholder('USD'),
    )
    expect(screen.getByTestId('amount-btc-preview')).toHaveTextContent('10000')
    expect(screen.queryByTestId('amount-price-unavailable')).not.toBeInTheDocument()
  })

  it('shows that the Bitcoin price is unavailable in fiat mode without a spot price', () => {
    useWalletStore.setState({ networkMode: 'mainnet', loadedDescriptorWallet: null })
    useFiatDenominationStore.setState({ fiatDenominationMode: true, defaultFiatCurrency: 'USD' })
    fiatRatesQueryMock.mockReturnValue({ data: undefined, isPending: true })
    renderWithProviders(
      <UniversalAmountInput
        value=""
        onChange={() => undefined}
        priceUnavailableTestId="amount-price-unavailable"
      />,
    )

    expect(screen.getByTestId('amount-price-unavailable')).toHaveTextContent(
      'Bitcoin price is unavailable.',
    )
  })

  it('reports typed text through onChange', () => {
    const onChange = vi.fn()
    renderWithProviders(<UniversalAmountInput value="" onChange={onChange} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '21' } })

    expect(onChange).toHaveBeenCalledWith('21')
  })
})
