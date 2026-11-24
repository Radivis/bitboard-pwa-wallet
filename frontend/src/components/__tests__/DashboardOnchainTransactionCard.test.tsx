import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'

import { DashboardOnchainTransactionCard } from '@/components/DashboardOnchainTransactionCard'
import { ONCHAIN_ARKADE_BOARDING_ACTIVITY_LABEL } from '@/lib/lightning/lightning-dashboard-sync'
import { renderWithProviders } from '@/test-utils/test-providers'
import { useBitcoinDisplayUnitStore } from '@/stores/bitcoinDisplayUnitStore'
import type { TransactionDetails } from '@/workers/crypto-types'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const txid = 'bb'.repeat(32)

function transaction(overrides?: Partial<TransactionDetails>): TransactionDetails {
  return {
    txid,
    sentSats: 10_696,
    receivedSats: 0,
    feeSats: 696,
    confirmationBlockHeight: 100,
    confirmationTime: 1_700_000_000,
    isConfirmed: true,
    isLabTx: false,
    ...overrides,
  }
}

describe('DashboardOnchainTransactionCard', () => {
  beforeEach(() => {
    useBitcoinDisplayUnitStore.setState({ defaultBitcoinUnit: 'sat' })
    vi.mocked(toast.success).mockReset()
  })

  it('shows a pending receive as zero confirmations and no block height', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <DashboardOnchainTransactionCard
        transaction={transaction({
          sentSats: 0,
          receivedSats: 5_000,
          feeSats: null,
          isConfirmed: false,
          confirmationBlockHeight: null,
          confirmationTime: null,
        })}
        localTipHeight={200}
      />,
    )

    await user.click(screen.getByText('5000'))

    expect(screen.getByText('Confirmations')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('Block height')).not.toBeInTheDocument()
    expect(screen.queryByText('Status')).not.toBeInTheDocument()
    expect(screen.queryByText('Total (incl. fee)')).not.toBeInTheDocument()
  })

  it('shows confirmations from the local tip and the block height when confirmed', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <DashboardOnchainTransactionCard transaction={transaction()} localTipHeight={150} />,
    )

    await user.click(screen.getByText('10000'))

    expect(screen.getByText('51')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('Total (incl. fee)')).toBeInTheDocument()
  })

  it('omits confirmations until the tip is known', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <DashboardOnchainTransactionCard transaction={transaction()} localTipHeight={null} />,
    )

    await user.click(screen.getByText('10000'))

    expect(screen.queryByText('Confirmations')).not.toBeInTheDocument()
    expect(screen.getByText('Block height')).toBeInTheDocument()
  })

  it('shows the CPFP tag and a boarding label', () => {
    renderWithProviders(
      <DashboardOnchainTransactionCard
        transaction={transaction({ isCpfpFeeBump: true })}
        activityLabel={ONCHAIN_ARKADE_BOARDING_ACTIVITY_LABEL}
        localTipHeight={150}
      />,
    )

    expect(screen.getByText('CPFP fee bump')).toBeInTheDocument()
    expect(screen.getByText(ONCHAIN_ARKADE_BOARDING_ACTIVITY_LABEL)).toBeInTheDocument()
  })

  it('keeps the card open when the time or the copy control is used', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <DashboardOnchainTransactionCard transaction={transaction()} localTipHeight={150} />,
    )

    await user.click(screen.getByRole('button', { name: /ago$/ }))
    expect(screen.queryByText('TXID')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2023-11-14/ })).toBeInTheDocument()

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    })

    await user.click(screen.getByText('10000'))
    await user.click(screen.getByRole('button', { name: 'Copy transaction id' }))

    expect(writeText).toHaveBeenCalledWith(txid)
    expect(toast.success).toHaveBeenCalledWith('Transaction id copied to clipboard')
    expect(screen.getByText('TXID')).toBeInTheDocument()
  })
})
