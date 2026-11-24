import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BarkMovementItem } from '@/components/BarkMovementItem'
import { renderWithProviders } from '@/test-utils/test-providers'
import { useBitcoinDisplayUnitStore } from '@/stores/bitcoinDisplayUnitStore'
import type { BarkMovementRow } from '@/workers/bark-api'

const failedBoard: BarkMovementRow = {
  id: 7,
  status: 'failed',
  subsystemName: 'bark.board',
  subsystemKind: 'board',
  effectiveBalanceSats: -50_000,
  offchainFeeSats: 100,
  createdAtUnixSeconds: 1_700_000_000,
}

describe('BarkMovementItem', () => {
  beforeEach(() => {
    useBitcoinDisplayUnitStore.setState({ defaultBitcoinUnit: 'BTC' })
  })

  it('BARK-HIST-04 shows status and the signed effective amount for a failed movement', () => {
    renderWithProviders(<BarkMovementItem movement={failedBoard} />)
    const row = screen.getByTestId('bark-movement-7')
    const failedIcon = screen.getByLabelText('Failed')
    expect(failedIcon).toHaveClass('lucide-banknote-x')
    expect(failedIcon).toHaveClass('text-[var(--design-status-error-foreground)]')
    expect(row).not.toHaveTextContent('Failed')
    expect(row).toHaveTextContent('Bark boarding')
    const badge = screen.getByText('Bark boarding').closest('span')
    expect(badge?.querySelector('span[aria-hidden="true"]')).toBeInTheDocument()
    expect(screen.getByTestId('bark-movement-amount-7')).toHaveTextContent('-')
    expect(screen.getByTestId('bark-movement-amount-7')).toHaveTextContent('0.00050000')
  })

  it('BARK-EXIT-09 shows a bark.offboard movement as Bark exit', () => {
    renderWithProviders(
      <BarkMovementItem
        movement={{
          ...failedBoard,
          id: 8,
          subsystemName: 'bark.offboard',
          subsystemKind: 'send_onchain',
        }}
      />,
    )
    expect(screen.getByTestId('bark-movement-8')).toHaveTextContent('Bark exit')
  })

  it('BARK-HIST-05 shows a failed bark.round refresh as Bark refresh', () => {
    renderWithProviders(
      <BarkMovementItem
        movement={{
          ...failedBoard,
          id: 9,
          subsystemName: 'bark.round',
          subsystemKind: 'refresh',
        }}
      />,
    )
    const row = screen.getByTestId('bark-movement-9')
    expect(screen.getByLabelText('Failed')).toHaveClass('lucide-banknote-x')
    expect(row).not.toHaveTextContent('Failed')
    expect(row).toHaveTextContent('Bark refresh')
  })

  it('does not print Pending, Successful, or Canceled beside the activity tag', () => {
    const { rerender } = renderWithProviders(
      <BarkMovementItem movement={{ ...failedBoard, id: 10, status: 'pending' }} />,
    )
    expect(screen.getByTestId('bark-movement-10')).not.toHaveTextContent('Pending')
    expect(screen.getByTestId('bark-movement-10')).toHaveTextContent('Bark boarding')

    rerender(<BarkMovementItem movement={{ ...failedBoard, id: 11, status: 'successful' }} />)
    expect(screen.getByTestId('bark-movement-11')).not.toHaveTextContent('Successful')
    expect(screen.getByTestId('bark-movement-11')).toHaveTextContent('Bark boarding')

    rerender(<BarkMovementItem movement={{ ...failedBoard, id: 12, status: 'canceled' }} />)
    const canceledIcon = screen.getByLabelText('Canceled')
    expect(canceledIcon).toHaveClass('lucide-circle-x')
    expect(canceledIcon).toHaveClass('text-[var(--design-status-info-foreground)]')
    expect(screen.getByTestId('bark-movement-12')).not.toHaveTextContent('Canceled')
  })

  it('shows the movement kind and off-chain fee when expanded', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BarkMovementItem movement={failedBoard} />)

    await user.click(screen.getByText('0.00050000'))

    expect(screen.getByText('Kind')).toBeInTheDocument()
    expect(screen.getByText('board')).toBeInTheDocument()
    expect(screen.getByText('Off-chain fee')).toBeInTheDocument()
    expect(screen.queryByText('TXID')).not.toBeInTheDocument()
  })
})
