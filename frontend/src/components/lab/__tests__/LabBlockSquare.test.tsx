import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { LabBlockSquare } from '@/components/lab/LabBlockSquare'
import { labEntityLabOwner } from '@/lib/lab-owner'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({
      children,
      className,
    }: {
      children: React.ReactNode
      className?: string
    }) => (
      <div data-testid="mock-block-link" className={className}>
        {children}
      </div>
    ),
  }
})

const baseProps = {
  height: 3,
  txCount: 2,
  totalFeesSats: 500,
  minedOnUnix: 1_700_000_000,
  minedBy: labEntityLabOwner(1),
  wallets: [] as Array<{ wallet_id: number; name: string }>,
  entities: [
    {
      labEntityId: 1,
      entityName: 'Alice',
      addressType: 'segwit',
    },
  ] as const,
}

describe('LabBlockSquare', () => {
  it('renders weight fill when limit and used weight are persisted', () => {
    renderWithProviders(
      <LabBlockSquare
        {...baseProps}
        blockWeightLimitWu={4000}
        nonCoinbaseWeightUsedWu={2000}
      />,
    )
    const fill = screen.getByTestId('lab-block-square-fill')
    expect(fill).toHaveStyle({ height: '50%' })
  })

  it('does not render fill layer when weight limit is missing (legacy)', () => {
    renderWithProviders(
      <LabBlockSquare
        {...baseProps}
        blockWeightLimitWu={null}
        nonCoinbaseWeightUsedWu={null}
      />,
    )
    expect(screen.queryByTestId('lab-block-square-fill')).not.toBeInTheDocument()
  })
})
