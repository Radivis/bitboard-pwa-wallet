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
    expect(card?.className).not.toContain('border')
  })
})
