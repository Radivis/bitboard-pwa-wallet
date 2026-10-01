import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { BarkVtxoCard } from '@/components/bark/BarkVtxoCard'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { BarkVtxoRow } from '@/workers/bark-api'

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}))

function sampleRow(overrides: Partial<BarkVtxoRow> = {}): BarkVtxoRow {
  return {
    id: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789:0',
    amountSats: 42_000,
    expiryHeight: 250_000,
    state: 'spendable',
    lockHolder: null,
    registered: false,
    ...overrides,
  }
}

describe('BarkVtxoCard', () => {
  it('BARK-VTX-03 shows amount, state, and expiry height', () => {
    const row = sampleRow()
    renderWithProviders(<BarkVtxoCard row={row} />)

    expect(screen.getByTestId(`bark-vtxo-card-${row.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`bark-vtxo-amount-${row.id}`)).toBeInTheDocument()
    expect(screen.getByText('Spendable')).toBeInTheDocument()
    expect(screen.getByText('Expiry height: 250000')).toBeInTheDocument()
    expect(screen.queryByTestId(`bark-vtxo-lock-holder-${row.id}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`bark-vtxo-registered-${row.id}`)).not.toBeInTheDocument()
  })

  it('BARK-VTX-03 shows the lock-holder line only when locked, and Registered only when true', () => {
    const locked = sampleRow({
      id: 'locked:1',
      state: 'locked',
      lockHolder: { kind: 'action', id: 'pay-1' },
      registered: true,
    })
    renderWithProviders(<BarkVtxoCard row={locked} />)

    expect(screen.getByTestId('bark-vtxo-lock-holder-locked:1')).toHaveTextContent(
      'Locked by action pay-1',
    )
    expect(screen.getByTestId('bark-vtxo-registered-locked:1')).toHaveTextContent('Registered')
  })
})
