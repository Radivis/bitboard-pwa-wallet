import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { renderWithProviders } from '@/test-utils/test-providers'
import { useWalletStore } from '@/stores/walletStore'
import type { BitcoinDisplayUnit } from '@/lib/wallet/bitcoin-display-unit'

const bitcoinUnitState = vi.hoisted(() => ({ data: 'BTC' as BitcoinDisplayUnit }))

vi.mock('@/hooks/useBitcoinUnit', () => ({
  useBitcoinUnit: () => bitcoinUnitState,
}))

describe('BitcoinAmountDisplay', () => {
  beforeEach(() => {
    bitcoinUnitState.data = 'BTC'
    useWalletStore.setState({
      networkMode: 'mainnet',
      loadedDescriptorWallet: null,
    })
  })

  it('renders formatted amount and tappable unit on mainnet', () => {
    const { container } = renderWithProviders(
      <BitcoinAmountDisplay amountSats={100_000_000} size="lg" />,
    )
    expect(screen.getByText('1.00000000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'BTC' })).toBeInTheDocument()
    expect(screen.queryByText('t')).not.toBeInTheDocument()
    expect(container.querySelector('.design-type-large-balances')).toHaveTextContent('1.00000000')
  })

  it('shows grey t prefix and tBTC accessible name on testnet', () => {
    useWalletStore.setState({ networkMode: 'testnet' })
    renderWithProviders(<BitcoinAmountDisplay amountSats={100_000_000} size="lg" />)
    expect(screen.getByText('t')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'tBTC' })).toBeInTheDocument()
  })

  it('shows flask icon and Lab BTC accessible name in lab mode', () => {
    useWalletStore.setState({ networkMode: 'lab' })
    const { container } = renderWithProviders(
      <BitcoinAmountDisplay amountSats={100_000_000} size="lg" />,
    )
    expect(container.querySelector('svg.lucide-flask-conical')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lab BTC' })).toBeInTheDocument()
  })

  it('shows the satoshi mark for sat amounts and keeps the word for parsing', () => {
    bitcoinUnitState.data = 'sat'
    const { container } = renderWithProviders(<BitcoinAmountDisplay amountSats={1000} />)
    expect(screen.getByRole('button', { name: 'sat' })).toBeInTheDocument()
    expect(container.querySelector('[data-testid="satoshi-mark"]')).toBeInTheDocument()
    expect(screen.getByTestId('bitcoin-sat-unit').textContent).toBe('sat')
  })

  it('shows k plus the satoshi mark for ksat amounts', () => {
    bitcoinUnitState.data = 'ksat'
    renderWithProviders(<BitcoinAmountDisplay amountSats={1000} />)
    const unitButton = screen.getByRole('button', { name: 'ksat' })
    expect(unitButton.querySelector('[data-testid="satoshi-mark"]')).toBeInTheDocument()
    expect(unitButton).toHaveTextContent('k')
    expect(screen.getByTestId('bitcoin-sat-unit').textContent).toBe('ksat')
  })

  it('keeps tksat as one word in text when the network prefix is t', () => {
    bitcoinUnitState.data = 'ksat'
    useWalletStore.setState({ networkMode: 'testnet' })
    renderWithProviders(<BitcoinAmountDisplay amountSats={1000} />)
    expect(screen.getByRole('button', { name: 'tksat' })).toBeInTheDocument()
    expect(screen.getByTestId('bitcoin-sat-unit').textContent).toBe('tksat')
  })

  it('applies size sm typography', () => {
    const { container } = renderWithProviders(
      <BitcoinAmountDisplay amountSats={1000} size="sm" />,
    )
    expect(container.querySelector('.design-type-small-balances')).toBeInTheDocument()
  })
})
