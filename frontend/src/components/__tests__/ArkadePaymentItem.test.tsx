import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'

import { ArkadePaymentItem } from '@/components/ArkadePaymentItem'
import { renderWithProviders } from '@/test-utils/test-providers'
import { useBitcoinDisplayUnitStore } from '@/stores/bitcoinDisplayUnitStore'
import type { ArkadePaymentRow } from '@/workers/arkade-api'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const txid = 'dd'.repeat(32)

const payment: ArkadePaymentRow = {
  direction: 'incoming',
  amountSats: 2_000,
  timestamp: 1_700_000_000,
  txid,
  memo: 'Round',
}

describe('ArkadePaymentItem', () => {
  beforeEach(() => {
    useBitcoinDisplayUnitStore.setState({ defaultBitcoinUnit: 'sat' })
    vi.mocked(toast.success).mockReset()
  })

  it('shows the txid, the current kind, and the memo', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ArkadePaymentItem payment={payment} activityLabel="Arkade boarding" />)

    await user.click(screen.getByTestId(`arkade-payment-${txid}`))

    expect(screen.getByText('TXID')).toBeInTheDocument()
    expect(screen.getByText('Kind')).toBeInTheDocument()
    expect(screen.getAllByText('Arkade boarding').length).toBeGreaterThan(0)
    expect(screen.getByText('Memo')).toBeInTheDocument()
    expect(screen.getByText('Round')).toBeInTheDocument()
  })

  it('copies the txid without collapsing the card', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ArkadePaymentItem payment={payment} />)

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    })

    await user.click(screen.getByTestId(`arkade-payment-${txid}`))
    await user.click(screen.getByRole('button', { name: 'Copy transaction id' }))

    expect(writeText).toHaveBeenCalledWith(txid)
    expect(toast.success).toHaveBeenCalledWith('Transaction id copied to clipboard')
    expect(screen.getByText('TXID')).toBeInTheDocument()
  })
})