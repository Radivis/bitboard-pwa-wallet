import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InfomodeToggle } from '@/components/infomode/InfomodeToggle'
import { useInfomodeStore } from '@/stores/infomodeStore'

vi.mock('sonner', () => ({
  toast: { message: vi.fn() },
}))

describe('InfomodeToggle', () => {
  beforeEach(() => {
    useInfomodeStore.setState({ isActive: false, lightbulbSuppressionCue: 0 })
  })

  it('follows the infomode store and toggles', async () => {
    const user = userEvent.setup()
    useInfomodeStore.setState({ isActive: true, lightbulbSuppressionCue: 2 })
    const { rerender } = render(<InfomodeToggle />)

    const activeToggle = screen.getByRole('button', { name: 'Turn off infomode' })
    expect(activeToggle).toHaveAttribute('data-status', 'active')
    expect(activeToggle.querySelector('.infomode-lightbulb-jitter--active')).toBeTruthy()

    useInfomodeStore.setState({ isActive: false, lightbulbSuppressionCue: 0 })
    rerender(<InfomodeToggle />)

    const inactiveToggle = screen.getByRole('button', { name: 'Turn on infomode' })
    expect(inactiveToggle).toHaveAttribute('data-status', 'inactive')

    await user.click(inactiveToggle)
    expect(useInfomodeStore.getState().isActive).toBe(true)
    expect(inactiveToggle).toHaveAttribute('data-status', 'active')
  })
})