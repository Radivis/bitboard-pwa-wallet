import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DesignDestructiveButton } from '@/components/design/DesignDestructiveButton'

describe('DesignDestructiveButton', () => {
  it('keeps the native button type and renders an optional icon', () => {
    render(
      <DesignDestructiveButton type="submit" icon={<span data-testid="icon" />}>
        Delete wallet
      </DesignDestructiveButton>,
    )
    const button = screen.getByRole('button', { name: 'Delete wallet' })
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toHaveAttribute('data-slot', 'design-destructive-button')
    expect(button.className).toContain('rounded-tl-[20px]')
    expect(button.className).toContain('rounded-tr-none')
    expect(button.className).toContain('rounded-br-[20px]')
    expect(button.className).toContain('rounded-bl-none')
    expect(button.className).not.toContain('rounded-[20px]')
    expect(button.className).toContain('bg-[var(--design-special-destructive-background)]')
    expect(button.className).toContain('hover:bg-[var(--design-special-destructive-background-hover)]')
    expect(button.className).toContain('active:bg-[var(--design-special-destructive-background-active)]')
    expect(button.className).toContain('text-[var(--design-text-regular-bright)]')
    expect(button.className).toContain('border-[var(--design-special-destructive)]')
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('renders a label without an icon', () => {
    render(<DesignDestructiveButton>Reset lab</DesignDestructiveButton>)
    const button = screen.getByRole('button', { name: 'Reset lab' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button.querySelector('svg')).not.toBeInTheDocument()
  })

  it('can be disabled', () => {
    render(<DesignDestructiveButton disabled>Continue</DesignDestructiveButton>)
    const button = screen.getByRole('button', { name: 'Continue' })
    expect(button).toBeDisabled()
    expect(button.className).toContain('disabled:opacity-50')
  })
})
