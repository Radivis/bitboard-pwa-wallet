import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardFooter,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'

describe('DesignCard', () => {
  it('renders a title, description, body, and footer without a border', () => {
    render(
      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle>Balance</DesignCardTitle>
          <DesignCardDescription>Spendable</DesignCardDescription>
        </DesignCardHeader>
        <DesignCardContent>1.25 BTC</DesignCardContent>
        <DesignCardFooter>Send</DesignCardFooter>
      </DesignCard>,
    )
    expect(screen.getByText('Balance')).toBeInTheDocument()
    expect(screen.getByText('Spendable')).toBeInTheDocument()
    expect(screen.getByText('1.25 BTC')).toBeInTheDocument()
    expect(screen.getByText('Send')).toBeInTheDocument()
    const card = document.querySelector('[data-slot="design-card"]')
    expect(card?.className).toContain('--design-surface-card')
    expect(card?.getAttribute('data-elevation')).toBe('1')
    expect(card?.className).toContain('shadow-[var(--design-card-shadow)]')
    expect(card?.className).not.toContain('border')
    const header = document.querySelector('[data-slot="design-card-header"]')
    expect(header?.className).toContain('gap-1.5')
    expect(header?.className).toContain('px-6')
    expect(header?.className).toContain('pt-6')
    const content = document.querySelector('[data-slot="design-card-content"]')
    expect(content?.className).toContain('px-6')
    expect(content?.className).toContain('pt-4')
    expect(content?.className).toContain('pb-6')
  })

  it('marks a nested card as elevation 2', () => {
    render(<DesignCard elevation={2}>Nested</DesignCard>)
    expect(document.querySelector('[data-slot="design-card"]')?.getAttribute('data-elevation')).toBe('2')
  })
})
