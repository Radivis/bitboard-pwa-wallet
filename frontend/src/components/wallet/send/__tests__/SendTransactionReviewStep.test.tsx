import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SendTransactionReviewStep } from '@/components/wallet/send/SendTransactionReviewStep'
import { renderWithProviders } from '@/test-utils/test-providers'

const reviewInputUtxos = [
  {
    address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    amountSats: 150_000,
    txid: 'abc123',
    vout: 0,
  },
]

const utxoSelectionDefaultProps = {
  isUtxoSelectionEnabled: false,
  onLoadAllWalletUtxos: async () => reviewInputUtxos,
  onRebuildWithSelectedUtxos: async () => {},
  onRevertToAutoSelection: async () => {},
  onManualSelectionStateChange: () => {},
}

const defaultProps = {
  networkMode: 'signet' as const,
  recipient: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
  amountSats: 100_000,
  effectiveFeeRate: 2,
  reviewFeeSats: 1_500,
  reviewChangeSats: 48_500,
  reviewInputUtxos,
  spendableBalanceSats: 500_000,
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
  ...utxoSelectionDefaultProps,
  mainnetFiatMode: false,
  defaultFiatCurrency: 'USD' as const,
  btcPriceInFiat: null,
  fiatRatesLoading: false,
}

describe('SendTransactionReviewStep', () => {
  it('renders Fee, Total deducted, Balance remaining, Change, and Immediately spendable balance remaining', () => {
    renderWithProviders(<SendTransactionReviewStep {...defaultProps} />)

    expect(screen.getByText('Fee')).toBeInTheDocument()
    expect(screen.getByText('Total deducted')).toBeInTheDocument()
    expect(screen.getByText('Balance remaining')).toBeInTheDocument()
    expect(screen.getByText('Change')).toBeInTheDocument()
    expect(
      screen.getByText('Immediately spendable balance remaining'),
    ).toBeInTheDocument()
    expect(screen.getByText('0.00100000')).toBeInTheDocument()
    expect(screen.getByText('0.00048500')).toBeInTheDocument()
    expect(screen.getByText('0.00350000')).toBeInTheDocument()
  })

  it('registers infomode targets for review amount labels', () => {
    const { container } = renderWithProviders(
      <SendTransactionReviewStep {...defaultProps} />,
    )

    expect(
      container.querySelector('[data-infomode-id="send-review-amount-to-send"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-infomode-id="send-review-fee-rate"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-infomode-id="send-review-fee"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-infomode-id="send-review-total-deducted"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector(
        '[data-infomode-id="send-review-balance-remaining"]',
      ),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-infomode-id="send-review-change"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector(
        '[data-infomode-id="send-review-immediately-spendable-remaining"]',
      ),
    ).toBeInTheDocument()
    expect(
      container.querySelector(
        '[data-infomode-id="send-review-input-utxos-toggle"]',
      ),
    ).toBeInTheDocument()
  })

  it('shows zero Change when reviewChangeSats is 0', () => {
    renderWithProviders(
      <SendTransactionReviewStep {...defaultProps} reviewChangeSats={0} />,
    )

    expect(screen.getByText('Change')).toBeInTheDocument()
    expect(screen.getAllByText('0.00000000').length).toBeGreaterThanOrEqual(1)
  })

  it('toggles the input UTXO list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SendTransactionReviewStep {...defaultProps} />)

    expect(
      screen.getByRole('button', { name: 'Show UTXOs to be used' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('0.00150000')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show UTXOs to be used' }))

    expect(
      screen.getByRole('button', { name: 'Hide UTXOs to be used' }),
    ).toBeInTheDocument()
    expect(screen.getByText('0.00150000')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide UTXOs to be used' }))

    expect(
      screen.getByRole('button', { name: 'Show UTXOs to be used' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('0.00150000')).not.toBeInTheDocument()
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

    expect(screen.getAllByText(/\$/).length).toBeGreaterThanOrEqual(5)
    expect(screen.getAllByText('0.00100000').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('0.00048500').length).toBeGreaterThanOrEqual(1)
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

  it('does not show manual UTXO selection when feature is off', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SendTransactionReviewStep {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'Show UTXOs to be used' }))

    expect(screen.queryByLabelText('Manual UTXO selection')).not.toBeInTheDocument()
  })

  it('shows manual UTXO selection controls when feature is on', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <SendTransactionReviewStep
        {...defaultProps}
        isUtxoSelectionEnabled
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Show UTXOs to be used' }))

    expect(screen.getByLabelText('Manual UTXO selection')).toBeInTheDocument()
  })

  it('disables confirm when manual selection is insufficient', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <SendTransactionReviewStep
        {...defaultProps}
        isUtxoSelectionEnabled
        onLoadAllWalletUtxos={async () => [
          ...reviewInputUtxos,
          {
            address: 'tb1other',
            amountSats: 5_000,
            txid: 'def456',
            vout: 1,
          },
        ]}
        onManualSelectionStateChange={(state) => {
          if (state.confirmBlocked) {
            // noop — state lifted in component
          }
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Show UTXOs to be used' }))
    await user.click(screen.getByLabelText('Manual UTXO selection'))

    const confirmButton = screen.getByRole('button', { name: /Confirm and Send/i })
    await user.click(
      screen.getByRole('button', {
        name: 'Remove UTXO abc123:0 from selected inputs',
      }),
    )

    expect(confirmButton).toBeDisabled()
  })
})
