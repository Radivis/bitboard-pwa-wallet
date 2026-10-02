import { format } from 'date-fns'
import { describe, expect, it, vi } from 'vitest'
import { BITCOIN_MAINNET_AVERAGE_BLOCK_SECONDS } from '@/lib/bark/bark-vtxo-expiry'
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
  const now = new Date('2026-10-02T06:00:00.000Z')
  const tipHeight = 240_000

  it('BARK-VTX-03 shows amount, state, and blocks until expiry', () => {
    const row = sampleRow()
    renderWithProviders(
      <BarkVtxoCard row={row} tipHeight={tipHeight} networkMode="mainnet" now={now} />,
    )

    const blocksRemaining = row.expiryHeight - tipHeight
    const approximateExpiry = new Date(
      now.getTime() + blocksRemaining * BITCOIN_MAINNET_AVERAGE_BLOCK_SECONDS * 1000,
    )
    const expiry = screen.getByTestId(`bark-vtxo-expiry-${row.id}`)

    expect(screen.getByTestId(`bark-vtxo-card-${row.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`bark-vtxo-amount-${row.id}`)).toBeInTheDocument()
    expect(screen.getByText('Spendable')).toBeInTheDocument()
    expect(expiry).toHaveTextContent(`Expires in ${blocksRemaining} blocks`)
    expect(expiry).toHaveTextContent(`About ${format(approximateExpiry, 'yyyy-MM-dd HH:mm')}`)
    expect(expiry).not.toHaveTextContent('Expiry height')
    expect(expiry).not.toHaveTextContent(String(row.expiryHeight))
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
    renderWithProviders(
      <BarkVtxoCard row={locked} tipHeight={tipHeight} networkMode="signet" now={now} />,
    )

    expect(screen.getByTestId('bark-vtxo-lock-holder-locked:1')).toHaveTextContent(
      'Locked by action pay-1',
    )
    expect(screen.getByTestId('bark-vtxo-registered-locked:1')).toHaveTextContent('Registered')
  })
})
