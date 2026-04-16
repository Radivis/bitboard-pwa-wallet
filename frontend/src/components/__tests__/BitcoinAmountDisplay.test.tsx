import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { renderWithProviders } from '@/test-utils/test-providers'

vi.mock('@/hooks/useBitcoinUnit', () => ({
  useBitcoinUnit: () => ({ data: 'BTC' }),
}))

describe('BitcoinAmountDisplay', () => {
  it('renders formatted amount and tappable unit', () => {
    renderWithProviders(<BitcoinAmountDisplay amountSats={100_000_000} size="lg" />)
    expect(screen.getByText('1.00000000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'BTC' })).toBeInTheDocument()
  })

  it('applies size sm typography', () => {
    const { container } = renderWithProviders(
      <BitcoinAmountDisplay amountSats={1000} size="sm" />,
    )
    expect(container.querySelector('.text-sm')).toBeInTheDocument()
  })
})
