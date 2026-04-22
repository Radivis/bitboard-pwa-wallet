import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { LabTxCard } from '@/components/lab/LabTxCard'
import { labEntityLabOwner, walletLabOwner } from '@/lib/lab-owner'

const entities = [
  { labEntityId: 1, entityName: 'Alice', addressType: 'segwit' as const },
] as const
const wallets: Array<{ wallet_id: number; name: string }> = [{ wallet_id: 1, name: 'W1' }]

describe('LabTxCard', () => {
  it('renders transfer rows with from line and amount/fee', () => {
    renderWithProviders(
      <LabTxCard
        txid="abcd1234efgh90"
        sender={labEntityLabOwner(1)}
        receiver={walletLabOwner(1)}
        amountSats={5_000}
        feeSats={200}
        wallets={wallets}
        entities={entities}
        variant="transfer"
      />,
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('W1')).toBeInTheDocument()
  })

  it('renders coinbase badge and coinbase line', () => {
    const longTxid = 'a'.repeat(64)
    renderWithProviders(
      <LabTxCard
        txid={longTxid}
        sender={null}
        receiver={labEntityLabOwner(1)}
        amountSats={312_500_000}
        feeSats={0}
        wallets={wallets}
        entities={entities}
        variant="coinbase"
      />,
    )
    expect(screen.getByText('Coinbase')).toBeInTheDocument()
  })
})
