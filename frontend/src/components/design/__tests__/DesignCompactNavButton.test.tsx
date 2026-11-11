import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DesignCompactNavButton } from '@/components/design/DesignCompactNavButton'

describe('DesignCompactNavButton', () => {
  it('marks the selected route and can wrap a link', () => {
    render(
      <DesignCompactNavButton status="selected" asChild>
        <a href="/wallet">Dashboard</a>
      </DesignCompactNavButton>,
    )
    const link = screen.getByRole('link', { name: 'Dashboard' })
    expect(link).toHaveAttribute('data-slot', 'design-compact-nav-button')
    expect(link).toHaveAttribute('data-status', 'selected')
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link.className).toContain('flex-col')
    expect(link.className).toContain('gap-0')
    expect(link.className).toContain('design-type-compact-nav')
    expect(link.className).toContain('--design-nav-background-selected')
  })

  it('leaves an unselected compact nav button without the current-page marker', () => {
    render(<DesignCompactNavButton>Send</DesignCompactNavButton>)
    const button = screen.getByRole('button', { name: 'Send' })
    expect(button).toHaveAttribute('data-status', 'default')
    expect(button).not.toHaveAttribute('aria-current')
    expect(button.className).toContain('--design-nav-background)')
  })
})
