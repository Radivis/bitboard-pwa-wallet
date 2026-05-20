import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { renderWithProviders } from '@/test-utils/test-providers'
import { useWalletStore } from '@/stores/walletStore'

vi.mock('@/hooks/useBitcoinUnit', () => ({
  useBitcoinUnit: () => ({ data: 'BTC' }),
}))

describe('BitcoinAmountDisplay', () => {
  beforeEach(() => {
    useWalletStore.setState({
      networkMode: 'mainnet',
      loadedSubWallet: null,
    })
  })

  it('renders formatted amount and tappable unit on mainnet', () => {
    renderWithProviders(<BitcoinAmountDisplay amountSats={100_000_000} size="lg" />)
    expect(screen.getByText('1.00000000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'BTC' })).toBeInTheDocument()
    expect(screen.queryByText('t')).not.toBeInTheDocument()
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

  it('applies size sm typography', () => {
    const { container } = renderWithProviders(
      <BitcoinAmountDisplay amountSats={1000} size="sm" />,
    )
    expect(container.querySelector('.text-sm')).toBeInTheDocument()
  })
})
