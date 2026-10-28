import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DesignButton } from '@/components/design/DesignButton'

describe('DesignButton', () => {
  it('keeps the native button type and renders an optional icon', () => {
    render(
      <DesignButton appearance="primary" type="submit" icon={<span data-testid="icon" />}>
        Save
      </DesignButton>,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toHaveAttribute('data-type', 'primary')
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('renders as a link when asChild is set', () => {
    render(
      <DesignButton appearance="secondary" asChild>
        <a href="/wallet">Open</a>
      </DesignButton>,
    )
    const link = screen.getByRole('link', { name: 'Open' })
    expect(link).toHaveAttribute('href', '/wallet')
    expect(link).toHaveAttribute('data-type', 'secondary')
  })

  it('selects only a secondary button', () => {
    const { rerender } = render(
      <DesignButton appearance="secondary" selected>
        Keep
      </DesignButton>,
    )
    const secondary = screen.getByRole('button', { name: 'Keep' })
    expect(secondary).toHaveAttribute('data-selected', 'true')
    expect(secondary.className).toContain('border-2')

    rerender(
      <DesignButton appearance="primary" selected>
        Keep
      </DesignButton>,
    )
    expect(screen.getByRole('button', { name: 'Keep' })).not.toHaveAttribute('data-selected')
  })

  it('can be disabled', () => {
    render(
      <DesignButton appearance="tertiary" disabled>
        Later
      </DesignButton>,
    )
    expect(screen.getByRole('button', { name: 'Later' })).toBeDisabled()
  })

  it('caps width at 600px unless a caller sets a smaller max width', () => {
    const { rerender } = render(<DesignButton>Save</DesignButton>)
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('max-w-[600px]')

    rerender(<DesignButton className="max-w-[18.625rem]">Save</DesignButton>)
    const narrowed = screen.getByRole('button', { name: 'Save' })
    expect(narrowed.className).toContain('max-w-[18.625rem]')
    expect(narrowed.className).not.toContain('max-w-[600px]')
  })
})
