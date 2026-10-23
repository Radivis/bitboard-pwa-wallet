import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { TransactionItem } from '@/components/TransactionItem'
import { ONCHAIN_ARKADE_BOARDING_ACTIVITY_LABEL } from '@/lib/lightning/lightning-dashboard-sync'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { TransactionDetails } from '@/workers/crypto-types'

const sentTransaction: TransactionDetails = {
  txid: 'aa'.repeat(32),
  sentSats: 10_000,
  receivedSats: 9_304,
  feeSats: 696,
  confirmationBlockHeight: 326_225,
  confirmationTime: 1_700_000_000,
  isConfirmed: true,
  isLabTx: false,
}

describe('TransactionItem', () => {
  it('DASH-BARK-19 shows a CPFP fee bump badge on a Pay-to-Anchor child', () => {
    renderWithProviders(
      <TransactionItem transaction={{ ...sentTransaction, isCpfpFeeBump: true }} />,
    )
    expect(screen.getByText('sent')).toBeInTheDocument()
    expect(screen.getByText('CPFP fee bump')).toBeInTheDocument()
  })

  it('DASH-BARK-19 does not badge a normal send', () => {
    renderWithProviders(<TransactionItem transaction={sentTransaction} />)
    expect(screen.getByText('sent')).toBeInTheDocument()
    expect(screen.queryByText('CPFP fee bump')).not.toBeInTheDocument()
  })

  it('keeps a boarding activity label beside the CPFP fee bump badge', () => {
    renderWithProviders(
      <TransactionItem
        transaction={{ ...sentTransaction, isCpfpFeeBump: true }}
        activityLabel={ONCHAIN_ARKADE_BOARDING_ACTIVITY_LABEL}
      />,
    )
    expect(screen.getByText('CPFP fee bump')).toBeInTheDocument()
    expect(screen.getByText(ONCHAIN_ARKADE_BOARDING_ACTIVITY_LABEL)).toBeInTheDocument()
  })
})
