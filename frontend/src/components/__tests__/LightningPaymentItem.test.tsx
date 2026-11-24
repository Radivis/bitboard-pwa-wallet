import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'

import { LightningPaymentItem } from '@/components/LightningPaymentItem'
import type { LightningPaymentWithWallet } from '@/lib/lightning/lightning-dashboard-sync'
import { renderWithProviders } from '@/test-utils/test-providers'
import { useBitcoinDisplayUnitStore } from '@/stores/bitcoinDisplayUnitStore'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const paymentHash = 'cc'.repeat(32)

const payment: LightningPaymentWithWallet = {
  connectionId: 'nwc-1',
  walletLabel: 'Alby',
  paymentHash,
  isPending: false,
  amountSats: 1_000,
  memo: 'Coffee',
  timestamp: 1_700_000_000,
  bolt11: 'lnbc1',
  direction: 'outgoing',
  feesPaidSats: 2,
}

describe('LightningPaymentItem', () => {
  beforeEach(() => {
    useBitcoinDisplayUnitStore.setState({ defaultBitcoinUnit: 'sat' })
    vi.mocked(toast.success).mockReset()
  })

  it('shows the wallet, payment hash, and memo, and not a status row', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LightningPaymentItem payment={payment} />)

    await user.click(screen.getByTestId(`ln-payment-nwc-1-${paymentHash}`))

    expect(screen.getByText('Lightning wallet')).toBeInTheDocument()
    expect(screen.getByText('Alby')).toBeInTheDocument()
    expect(screen.getByText('Payment hash')).toBeInTheDocument()
    expect(screen.getByText('Memo')).toBeInTheDocument()
    expect(screen.getByText('Coffee')).toBeInTheDocument()
    expect(screen.getByText('Fee')).toBeInTheDocument()
    expect(screen.getByText('Total (incl. fee)')).toBeInTheDocument()
    expect(screen.queryByText('Status')).not.toBeInTheDocument()
    expect(screen.queryByText('Settled')).not.toBeInTheDocument()
  })

  it('copies the payment hash without collapsing the card', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LightningPaymentItem payment={payment} />)

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    })

    await user.click(screen.getByTestId(`ln-payment-nwc-1-${paymentHash}`))
    await user.click(screen.getByRole('button', { name: 'Copy payment hash' }))

    expect(writeText).toHaveBeenCalledWith(paymentHash)
    expect(toast.success).toHaveBeenCalledWith('Payment hash copied to clipboard')
    expect(screen.getByText('Payment hash')).toBeInTheDocument()
  })
})
