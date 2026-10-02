import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { BarkMovementItem } from '@/components/BarkMovementItem'
import { renderWithProviders } from '@/test-utils/test-providers'
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
  it('BARK-HIST-04 shows status and the signed effective amount for a failed movement', () => {
    renderWithProviders(<BarkMovementItem movement={failedBoard} />)
    const row = screen.getByTestId('bark-movement-7')
    expect(row).toHaveTextContent('Failed')
    expect(row).toHaveTextContent('Bark boarding')
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
    expect(row).toHaveTextContent('Failed')
    expect(row).toHaveTextContent('Bark refresh')
  })
})
