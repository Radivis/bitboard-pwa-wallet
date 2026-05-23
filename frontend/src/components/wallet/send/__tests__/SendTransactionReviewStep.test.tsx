import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SendTransactionReviewStep } from '@/components/wallet/send/SendTransactionReviewStep'
import { renderWithProviders } from '@/test-utils/test-providers'

const defaultProps = {
  networkMode: 'signet' as const,
  recipient: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
  amountSats: 100_000,
  effectiveFeeRate: 2,
  reviewFeeSats: 1_500,
  totalBalanceSats: 500_000,
  onchainDustWarning: null,
  amountUnit: 'BTC' as const,
  isLightningSendMode: false,
  isPending: false,
  deadLabRecipientInfo: null,
  deadLabRecipientModalOpen: false,
  onDeadLabRecipientModalOpenChange: () => {},
  onDeadLabRecipientCancel: () => {},
  onConfirmDeadLabRecipientSend: () => {},
  labSendPendingForDeadLabModal: false,
  onBack: () => {},
  onConfirmSend: () => {},
  labConfirmSendDisabled: false,
  mainnetFiatMode: false,
  defaultFiatCurrency: 'USD' as const,
  btcPriceInFiat: null,
  fiatRatesLoading: false,
}

describe('SendTransactionReviewStep', () => {
  it('renders Fee, Total deducted, and Amount remaining with BTC amounts', () => {
    renderWithProviders(<SendTransactionReviewStep {...defaultProps} />)

    expect(screen.getByText('Fee')).toBeInTheDocument()
    expect(screen.getByText('Total deducted')).toBeInTheDocument()
    expect(screen.getByText('Amount remaining')).toBeInTheDocument()
    expect(screen.getByText('0.00100000')).toBeInTheDocument()
    expect(screen.getByText('0.00001500')).toBeInTheDocument()
    expect(screen.getByText('0.00101500')).toBeInTheDocument()
    expect(screen.getByText('0.00398500')).toBeInTheDocument()
  })

  it('renders fiat primary and muted BTC secondary in mainnet fiat mode', () => {
    renderWithProviders(
      <SendTransactionReviewStep
        {...defaultProps}
        networkMode="mainnet"
        mainnetFiatMode
        btcPriceInFiat={100_000}
      />,
    )

    expect(screen.getAllByText(/\$/).length).toBeGreaterThanOrEqual(3)
    expect(screen.getAllByText('0.00100000').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('0.00001500').length).toBeGreaterThanOrEqual(1)
  })

  it('calls onBack when Back is clicked', async () => {
    const user = userEvent.setup()
    let backClicked = false
    renderWithProviders(
      <SendTransactionReviewStep
        {...defaultProps}
        onBack={() => {
          backClicked = true
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Back/i }))
    expect(backClicked).toBe(true)
  })
})
