import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { LabTxCard } from '@/components/lab/LabTxCard'
import { labEntityLabOwner, walletLabOwner } from '@/lib/lab-owner'
import { formatAmountInBitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import { truncateAddress } from '@/lib/bitcoin-utils'

/** Shared card props: one lab entity "Alice" and one wallet "W1". */
const fixtureLabEntities = [
  { labEntityId: 1, entityName: 'Alice', addressType: 'segwit' as const },
] as const
const fixtureLabWallets: Array<{ wallet_id: number; name: string }> = [
  { wallet_id: 1, name: 'W1' },
]

describe('LabTxCard', () => {
  it('renders transfer rows with txid, parties, and amount/fee', () => {
    const transferTxid = 'abcd1234efgh90'
    const transferAmountSats = 5_000
    const transferFeeSats = 200

    renderWithProviders(
      <LabTxCard
        txid={transferTxid}
        sender={labEntityLabOwner(1)}
        receiver={walletLabOwner(1)}
        amountSats={transferAmountSats}
        feeSats={transferFeeSats}
        wallets={fixtureLabWallets}
        entities={fixtureLabEntities}
        variant="transfer"
      />,
    )

    expect(screen.getByText(truncateAddress(transferTxid))).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('W1')).toBeInTheDocument()
    expect(
      screen.getByText(
        formatAmountInBitcoinDisplayUnit(transferAmountSats, 'BTC'),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        formatAmountInBitcoinDisplayUnit(transferFeeSats, 'BTC'),
      ),
    ).toBeInTheDocument()
  })

  it('renders coinbase badge, truncated txid, and subsidy amount', () => {
    const coinbaseTxid = 'a'.repeat(64)
    const coinbaseAmountSats = 312_500_000
    const coinbaseFeeSats = 0

    renderWithProviders(
      <LabTxCard
        txid={coinbaseTxid}
        sender={null}
        receiver={labEntityLabOwner(1)}
        amountSats={coinbaseAmountSats}
        feeSats={coinbaseFeeSats}
        wallets={fixtureLabWallets}
        entities={fixtureLabEntities}
        variant="coinbase"
      />,
    )

    expect(screen.getByText('Coinbase')).toBeInTheDocument()
    expect(screen.getByText(truncateAddress(coinbaseTxid))).toBeInTheDocument()
    expect(
      screen.getByText(
        formatAmountInBitcoinDisplayUnit(coinbaseAmountSats, 'BTC'),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        formatAmountInBitcoinDisplayUnit(coinbaseFeeSats, 'BTC'),
      ),
    ).toBeInTheDocument()
  })
})
