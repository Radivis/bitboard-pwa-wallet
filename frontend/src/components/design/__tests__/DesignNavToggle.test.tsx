import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DesignNavToggle } from '@/components/design/DesignNavToggle'

function chevron(button: HTMLElement) {
  const icon = button.querySelector('svg')
  expect(icon).not.toBeNull()
  return icon as SVGElement
}

describe('DesignNavToggle', () => {
  it('points down while the navigation bar is visible', () => {
    render(<DesignNavToggle expanded aria-controls="section-sub-nav" />)
    const button = screen.getByRole('button', { name: 'Hide navigation' })
    expect(button).toHaveAttribute('data-slot', 'design-nav-toggle')
    expect(button).toHaveAttribute('data-direction', 'down')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAttribute('aria-controls', 'section-sub-nav')
    expect(button.className).toContain('h-12')
    expect(button.className).toContain('w-12')
    expect(button.className).toContain('rounded-[20px]')
    expect(button.className).toContain('--design-nav-background)')
    const icon = chevron(button)
    expect(icon).not.toHaveClass('rotate-180')
    expect(icon).toHaveClass('motion-safe:duration-400')
    expect(icon).toHaveClass('motion-safe:ease-out')
  })

  it('rotates to the up variant when the navigation bar is hidden', () => {
    render(<DesignNavToggle expanded={false} />)
    const button = screen.getByRole('button', { name: 'Show navigation' })
    expect(button).toHaveAttribute('data-direction', 'up')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(chevron(button)).toHaveClass('rotate-180')
  })
})
