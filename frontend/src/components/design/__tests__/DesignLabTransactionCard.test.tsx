import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { DesignLabTransactionCard } from '@/components/design/DesignLabTransactionCard'
import { labEntityLabOwner, walletLabOwner } from '@/lib/lab/lab-owner'
import { formatAmountInBitcoinDisplayUnit } from '@/lib/wallet/bitcoin-display-unit'
import { renderWithProviders } from '@/test-utils/test-providers'
import { useBitcoinDisplayUnitStore } from '@/stores/bitcoinDisplayUnitStore'

const fixtureLabEntities = [
  { labEntityId: 1, entityName: 'Alice', addressType: 'segwit' as const },
] as const
const fixtureLabWallets = [
  { walletId: 1, name: 'W1', createdAt: new Date().toISOString() },
]

const designTokensPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../design-tokens.css')
const designTokens = readFileSync(designTokensPath, 'utf8')

describe('DesignLabTransactionCard', () => {
  beforeEach(() => {
    useBitcoinDisplayUnitStore.setState({ defaultBitcoinUnit: 'BTC' })
  })

  it('shows the parties, amount, and fee without a transaction id', () => {
    renderWithProviders(
      <DesignLabTransactionCard
        sender={labEntityLabOwner(1)}
        receiver={walletLabOwner(1)}
        amountSats={5_000}
        feeSats={200}
        wallets={fixtureLabWallets}
        entities={fixtureLabEntities}
        variant="transfer"
      />,
    )

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('W1')).toBeInTheDocument()
    expect(screen.getByText(formatAmountInBitcoinDisplayUnit(5_000, 'BTC'))).toBeInTheDocument()
    expect(screen.getByText(formatAmountInBitcoinDisplayUnit(200, 'BTC'))).toBeInTheDocument()
    expect(screen.queryByText('Transaction id')).not.toBeInTheDocument()

    const parties = screen.getByText('Alice').closest('[data-lab-transaction-parties]')
    expect(parties?.className).toContain('flex-col')
    expect(parties?.className).toContain('md:flex-row')
    expect(screen.getByText('W1').closest('[data-lab-transaction-recipient]')?.className).toContain(
      'ml-auto',
    )
  })

  it('shows a coinbase tag, the recipient, and a zero fee', () => {
    renderWithProviders(
      <DesignLabTransactionCard
        sender={null}
        receiver={labEntityLabOwner(1)}
        amountSats={312_500_000}
        feeSats={0}
        wallets={fixtureLabWallets}
        entities={fixtureLabEntities}
        variant="coinbase"
      />,
    )

    expect(screen.getByText('Coinbase').closest('[data-slot="design-tag"]')?.className).toContain(
      'self-start',
    )
    expect(screen.getByText('Coinbase').closest('[data-slot="design-tag"]')?.className).toContain(
      'w-fit',
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText(formatAmountInBitcoinDisplayUnit(312_500_000, 'BTC'))).toBeInTheDocument()
    expect(screen.getByText(formatAmountInBitcoinDisplayUnit(0, 'BTC'))).toBeInTheDocument()
    expect(screen.queryByText('Transaction id')).not.toBeInTheDocument()
  })

  it('uses the relative elevation 1 and 2 shadow stacks', () => {
    const cardRulesStart = designTokens.indexOf('[data-slot="design-lab-transaction-card"]')
    const cardRules = designTokens.slice(cardRulesStart, designTokens.indexOf('[data-slot="design-modal"]'))
    expect(cardRules).toContain('--design-elevation-2')
    expect(cardRules).toContain('--design-elevation-3')
    expect(cardRules).toContain('0 1px 3px 1px rgb(0 0 0 / 0.15)')
    expect(cardRules).toContain('0 3px 8px 0 rgb(0 0 0 / 0.25)')
    expect(cardRules).toContain('inset 0 4px 7px 0 rgb(245 244 246 / 0.08)')
    expect(cardRules).toContain('0 2px 6px 2px rgb(0 0 0 / 0.15)')
    expect(cardRules).toContain('0 4px 10px 0 rgb(0 0 0 / 0.25)')
    expect(cardRules).toContain('inset 0 4px 9px 0 rgb(236 235 239 / 0.08)')
    expect(cardRules).not.toContain('0 5px 12px 0 rgb(0 0 0 / 0.25)')
  })
})