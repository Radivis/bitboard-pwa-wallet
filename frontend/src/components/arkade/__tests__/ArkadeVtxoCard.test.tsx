import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { ArkadeVtxoCard } from '@/components/arkade/ArkadeVtxoCard'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { ArkadeVtxoRowBase } from '@/workers/arkade-api'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}))

const sampleRow: ArkadeVtxoRowBase = {
  id: 'abcd1234efgh5678:0',
  amountSats: 42_000,
  createdAt: 1_700_000_000,
  expiresAt: 1_800_000_000,
  classification: 'confirmed',
  isPreconfirmed: false,
  isRecoverable: true,
  isUnrolled: false,
  isSwept: false,
  isSpent: false,
}

describe('ArkadeVtxoCard', () => {
  it('ArkadeVtxoCard_renders_three_lines', () => {
    renderWithProviders(<ArkadeVtxoCard row={sampleRow} />)

    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.getByText(/Created:/)).toBeInTheDocument()
    expect(screen.getByText(/Expires:/)).toBeInTheDocument()
    expect(screen.getByTestId('arkade-vtxo-amount-abcd1234efgh5678:0')).toBeInTheDocument()
  })

  it('ArkadeVtxoCard_true_flags_only_as_chips', () => {
    renderWithProviders(<ArkadeVtxoCard row={sampleRow} />)

    expect(screen.getByText('recoverable')).toBeInTheDocument()
    expect(screen.queryByText('preconfirmed')).not.toBeInTheDocument()
    expect(screen.queryByText('unrolled')).not.toBeInTheDocument()
    expect(screen.queryByText('swept')).not.toBeInTheDocument()
    expect(screen.queryByText('spent')).not.toBeInTheDocument()
  })

  it('copies vtxo id on tap', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText },
    })

    renderWithProviders(<ArkadeVtxoCard row={sampleRow} />)
    fireEvent.click(screen.getByRole('button', { name: /copy vtxo id/i }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(sampleRow.id)
    })
  })
})
