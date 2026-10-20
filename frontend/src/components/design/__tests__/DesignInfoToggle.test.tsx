import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DesignInfoToggle } from '@/components/design/DesignInfoToggle'

describe('DesignInfoToggle', () => {
  it('exposes the pressed state and an icon class hook', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <DesignInfoToggle
        pressed
        aria-label="Turn off infomode"
        iconClassName="infomode-jitter"
        onClick={onClick}
      />,
    )
    const toggle = screen.getByRole('button', { name: 'Turn off infomode' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveAttribute('data-status', 'active')
    expect(toggle.querySelector('.infomode-jitter')).toBeTruthy()
    await user.click(toggle)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('reports inactive when not pressed', () => {
    render(<DesignInfoToggle pressed={false} aria-label="Turn on infomode" />)
    const toggle = screen.getByRole('button', { name: 'Turn on infomode' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveAttribute('data-status', 'inactive')
  })

  it('fills the question-mark plate when pressed', () => {
    render(<DesignInfoToggle pressed aria-label="Turn off infomode" />)
    const plate = screen.getByRole('button', { name: 'Turn off infomode' }).querySelector(
      '[data-slot="design-info-toggle-plate"]',
    )
    expect(plate).toHaveClass(
      'motion-safe:duration-200',
      'motion-safe:ease-in-out',
      'bg-[color-mix(in_srgb,var(--design-text-regular)_50%,transparent)]',
    )
  })

  it('leaves the plate clear when inactive', () => {
    render(<DesignInfoToggle pressed={false} aria-label="Turn on infomode" />)
    const plate = screen.getByRole('button', { name: 'Turn on infomode' }).querySelector(
      '[data-slot="design-info-toggle-plate"]',
    )
    expect(plate).toHaveClass('motion-safe:duration-200', 'motion-safe:ease-in-out', 'bg-transparent')
    expect(plate?.className).not.toContain('color-mix')
  })
})
