import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { LabMakeTransactionCard } from '@/components/lab/MakeTransaction'
import { LAB_MAX_RANDOM_ENTITY_TRANSACTIONS } from '@/lib/lab-random-limits'

function buildProps(overrides?: Partial<ComponentProps<typeof LabMakeTransactionCard>>) {
  return {
    showTxForm: false,
    setShowTxForm: vi.fn(),
    fromAddress: '',
    setFromAddress: vi.fn(),
    toAddress: '',
    setToAddress: vi.fn(),
    amountSats: '',
    setAmountSats: vi.fn(),
    feeRate: '1',
    setFeeRate: vi.fn(),
    onSend: vi.fn(),
    sending: false,
    controlledAddressesCount: 1,
    randomTransactionCount: '1',
    setRandomTransactionCount: vi.fn(),
    onCreateRandomTransactions: vi.fn(),
    creatingRandomTransactions: false,
    randomBatchProgress: null,
    labEntitiesCount: 1,
    ...overrides,
  }
}

describe('LabMakeTransactionCard', () => {
  it('shows mining hint and disables random button when no entities exist', () => {
    renderWithProviders(<LabMakeTransactionCard {...buildProps({ labEntitiesCount: 0 })} />)

    expect(
      screen.getByText('Mining a block to a name enables random transactions.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make random transaction' })).toBeDisabled()
  })

  it('calls random transaction handler from button', async () => {
    const user = userEvent.setup()
    const onCreateRandomTransactions = vi.fn()
    renderWithProviders(
      <LabMakeTransactionCard {...buildProps({ onCreateRandomTransactions })} />,
    )

    await user.click(screen.getByRole('button', { name: 'Make random transaction' }))
    expect(onCreateRandomTransactions).toHaveBeenCalledTimes(1)
  })

  it('caps random transaction count input at LAB_MAX_RANDOM_ENTITY_TRANSACTIONS', () => {
    renderWithProviders(<LabMakeTransactionCard {...buildProps()} />)
    const input = screen.getByLabelText('Number of random transactions')
    expect(input).toHaveAttribute('max', String(LAB_MAX_RANDOM_ENTITY_TRANSACTIONS))
  })

  it('shows rolling message and progress while creating random transactions', () => {
    renderWithProviders(
      <LabMakeTransactionCard
        {...buildProps({
          creatingRandomTransactions: true,
          randomBatchProgress: { created: 2, total: 5 },
        })}
      />,
    )
    expect(
      screen.getByText('Rolling random transaction data and signing lab transactions'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Created 2 of 5 random transactions/)).toBeInTheDocument()
  })
})
