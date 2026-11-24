import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'

import { DesignTransactionCard } from '@/components/design/DesignTransactionCard'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const designTokensPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../design-tokens.css')
const designTokens = readFileSync(designTokensPath, 'utf8')

const fullTxid = 'aa'.repeat(32)

describe('DesignTransactionCard', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockReset()
  })

  it('hides detail rows until the card is opened', async () => {
    const user = userEvent.setup()
    render(
      <DesignTransactionCard
        direction="received"
        settlement="pending"
        amount="+123 456 789"
        time={<button type="button">5 minutes ago</button>}
        details={[
          {
            label: 'TXID',
            value: 'aaaaa...aaaaa',
            copyText: fullTxid,
            copyAriaLabel: 'Copy transaction id',
            copiedMessage: 'Transaction id copied to clipboard',
          },
          { label: 'Confirmations', value: '0' },
        ]}
      />,
    )

    expect(screen.queryByText('TXID')).not.toBeInTheDocument()
    expect(screen.queryByText('Confirmations')).not.toBeInTheDocument()
    expect(screen.queryByText('Status')).not.toBeInTheDocument()

    await user.click(screen.getByText('+123 456 789'))

    expect(screen.getByText('Confirmations')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('Block height')).not.toBeInTheDocument()
    expect(screen.queryByText('Status')).not.toBeInTheDocument()
  })

  it('shows total and block height for a confirmed send', async () => {
    const user = userEvent.setup()
    render(
      <DesignTransactionCard
        direction="sent"
        settlement="confirmed"
        amount="-10 000"
        details={[
          { label: 'TXID', value: 'aaaaa...aaaaa', copyText: fullTxid },
          { label: 'Fee', value: '532' },
          { label: 'Total (incl. fee)', value: '10532' },
          { label: 'Confirmations', value: '51' },
          { label: 'Block height', value: '329 089' },
        ]}
      />,
    )

    await user.click(screen.getByText('-10 000'))

    expect(screen.getByText('Total (incl. fee)')).toBeInTheDocument()
    expect(screen.getByText('329 089')).toBeInTheDocument()
    expect(screen.getByText('51')).toBeInTheDocument()
  })

  it('copies the transaction id without collapsing the card', async () => {
    const user = userEvent.setup()
    render(
      <DesignTransactionCard
        direction="received"
        settlement="confirmed"
        amount="+1"
        details={[
          {
            label: 'TXID',
            value: 'aaaaa...aaaaa',
            copyText: fullTxid,
            copyAriaLabel: 'Copy transaction id',
            copiedMessage: 'Transaction id copied to clipboard',
          },
        ]}
      />,
    )

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    })

    await user.click(screen.getByText('+1'))
    await user.click(screen.getByRole('button', { name: 'Copy transaction id' }))

    expect(writeText).toHaveBeenCalledWith(fullTxid)
    expect(toast.success).toHaveBeenCalledWith('Transaction id copied to clipboard')
    expect(screen.getByText('TXID')).toBeInTheDocument()
  })

  it('does not toggle when a nested time or amount control is used', async () => {
    const user = userEvent.setup()
    render(
      <DesignTransactionCard
        direction="received"
        settlement="pending"
        amount={
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            Change unit
          </button>
        }
        time={
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            5 minutes ago
          </button>
        }
        details={[{ label: 'TXID', value: 'aaaaa...aaaaa' }]}
      />,
    )

    await user.click(screen.getByRole('button', { name: '5 minutes ago' }))
    expect(screen.queryByText('TXID')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change unit' }))
    expect(screen.queryByText('TXID')).not.toBeInTheDocument()
  })

  it('uses the transaction-card slot and the elevation 2 and 3 shadow stacks', () => {
    render(
      <DesignTransactionCard direction="received" settlement="pending" amount="+1" />,
    )
    expect(screen.getByText('+1').closest('[data-slot="design-transaction-card"]')).not.toBeNull()

    const cardRules = designTokens.slice(designTokens.indexOf('[data-slot="design-transaction-card"]'))
    expect(cardRules).toContain('--design-elevation-2')
    expect(cardRules).toContain('--design-elevation-3')
    expect(cardRules).toContain('0 2px 6px 2px rgb(0 0 0 / 0.15)')
    expect(cardRules).toContain('0 4px 10px 0 rgb(0 0 0 / 0.25)')
    expect(cardRules).toContain('inset 0 4px 9px 0 rgb(236 235 239 / 0.08)')
    expect(cardRules).toContain('0 5px 12px 0 rgb(0 0 0 / 0.25)')
    expect(cardRules).toContain('0 4px 8px 3px rgb(0 0 0 / 0.15)')
    expect(cardRules).toContain('inset 0 4px 11px 0 rgb(229 227 232 / 0.08)')
  })
})
