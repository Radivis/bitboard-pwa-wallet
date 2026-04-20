import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import userEvent from '@testing-library/user-event'
import { fireEvent, screen } from '@testing-library/react'
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
    hasMinedBlocks: true,
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

  it('when no blocks mined yet, shows warning and disables both transaction buttons', () => {
    renderWithProviders(
      <LabMakeTransactionCard {...buildProps({ hasMinedBlocks: false, labEntitiesCount: 2 })} />,
    )

    expect(
      screen.getByText(/No coins exist yet\. Please mine some blocks on the/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Blocks page' })).toHaveAttribute('href', '/lab/blocks')
    expect(screen.getByRole('button', { name: 'Make transaction' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Make random transaction' })).toBeDisabled()
    expect(screen.getByLabelText('Number of random transactions')).toBeDisabled()
    expect(
      screen.queryByText('Mining a block to a name enables random transactions.'),
    ).not.toBeInTheDocument()
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

  it('clamps random count on change when value exceeds max', () => {
    const setRandomTransactionCount = vi.fn()
    renderWithProviders(
      <LabMakeTransactionCard {...buildProps({ setRandomTransactionCount })} />,
    )
    const input = screen.getByLabelText('Number of random transactions')
    fireEvent.change(input, { target: { value: '150' } })
    expect(setRandomTransactionCount).toHaveBeenCalledWith('100')
  })

  it('clamps random count on change when value is below min', () => {
    const setRandomTransactionCount = vi.fn()
    renderWithProviders(
      <LabMakeTransactionCard {...buildProps({ setRandomTransactionCount })} />,
    )
    const input = screen.getByLabelText('Number of random transactions')
    fireEvent.change(input, { target: { value: '0' } })
    expect(setRandomTransactionCount).toHaveBeenCalledWith('1')
  })

  it('shows conflict warning when random count exceeds lab entities', () => {
    renderWithProviders(
      <LabMakeTransactionCard
        {...buildProps({ randomTransactionCount: '5', labEntitiesCount: 2 })}
      />,
    )
    expect(
      screen.getByText(/You chose more random transactions than there are lab entities/i),
    ).toBeInTheDocument()
  })

  it('does not show conflict warning when random count is at most lab entities', () => {
    renderWithProviders(
      <LabMakeTransactionCard
        {...buildProps({ randomTransactionCount: '2', labEntitiesCount: 2 })}
      />,
    )
    expect(
      screen.queryByText(/You chose more random transactions than there are lab entities/i),
    ).not.toBeInTheDocument()
  })

  it('does not show conflict warning when there are no lab entities', () => {
    renderWithProviders(
      <LabMakeTransactionCard
        {...buildProps({ randomTransactionCount: '10', labEntitiesCount: 0 })}
      />,
    )
    expect(
      screen.queryByText(/You chose more random transactions than there are lab entities/i),
    ).not.toBeInTheDocument()
  })

  it('disables Send when sendDisabledFromDeadEntity is true', () => {
    const onSend = vi.fn()
    renderWithProviders(
      <LabMakeTransactionCard
        {...buildProps({
          showTxForm: true,
          onSend,
          sendDisabledFromDeadEntity: true,
          deadFromEntityDisplayName: 'Corpse',
        })}
      />,
    )

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(
      screen.getByText(/This address belongs to DEAD lab entity Corpse/i),
    ).toBeInTheDocument()
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
