import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ArkadeVtxoExpiryIndicator } from '@/components/wallet/ArkadeVtxoExpiryIndicator'

const vtxoExpiryQueryMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeVtxoExpiryQuery: () => vtxoExpiryQueryMock(),
}))

describe('ArkadeVtxoExpiryIndicator', () => {
  it('shows earliest expiry and renewal-soon count', () => {
    const inTwoDays = Math.floor(Date.now() / 1000) + 60 * 60 * 48
    vtxoExpiryQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { earliestExpiresAt: inTwoDays, expiringSoonCount: 1 },
    })

    renderWithProviders(<ArkadeVtxoExpiryIndicator />)

    expect(screen.getByTestId('arkade-vtxo-expiry-indicator')).toBeInTheDocument()
    expect(screen.getByText(/Earliest VTXO expiry/i)).toBeInTheDocument()
    expect(screen.getByText(/1 need renewal soon/i)).toBeInTheDocument()
  })

  it('hides when expiry data is unavailable', () => {
    vtxoExpiryQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { earliestExpiresAt: null, expiringSoonCount: 0 },
    })

    const { container } = renderWithProviders(<ArkadeVtxoExpiryIndicator />)
    expect(container).toBeEmptyDOMElement()
  })
})
