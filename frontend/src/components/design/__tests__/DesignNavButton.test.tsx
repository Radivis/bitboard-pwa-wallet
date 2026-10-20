import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DesignNavButton } from '@/components/design/DesignNavButton'

describe('DesignNavButton', () => {
  it('marks the selected route and can wrap a link', () => {
    render(
      <DesignNavButton status="selected" asChild>
        <a href="/wallet">Wallet</a>
      </DesignNavButton>,
    )
    const link = screen.getByRole('link', { name: 'Wallet' })
    expect(link).toHaveAttribute('data-status', 'selected')
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link.className).toContain('--design-nav-background-selected')
    expect(link.className).not.toContain('--design-accent-primary')
  })

  it('leaves an unselected nav button without the current-page marker', () => {
    render(<DesignNavButton>Settings</DesignNavButton>)
    const button = screen.getByRole('button', { name: 'Settings' })
    expect(button).toHaveAttribute('data-status', 'default')
    expect(button).not.toHaveAttribute('aria-current')
  })
})
