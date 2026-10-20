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
})
