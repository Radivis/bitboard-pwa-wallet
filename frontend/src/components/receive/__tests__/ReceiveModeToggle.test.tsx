import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReceiveModeToggle } from '@/components/receive/ReceiveModeToggle'

vi.mock('@/components/infomode/InfomodeWrapper', () => ({
  InfomodeWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('ReceiveModeToggle', () => {
  it('shows Arkade segment when showArkade is true', () => {
    render(
      <ReceiveModeToggle
        mode="bitcoin"
        onModeChange={vi.fn()}
        showLightning={false}
        showArkade={true}
        showBark={false}
      />,
    )
    expect(screen.getByRole('button', { name: 'Arkade' })).toBeInTheDocument()
  })

  it('calls onModeChange with arkade', async () => {
    const user = userEvent.setup()
    const onModeChange = vi.fn()
    render(
      <ReceiveModeToggle
        mode="bitcoin"
        onModeChange={onModeChange}
        showLightning={true}
        showArkade={true}
        showBark={false}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Arkade' }))
    expect(onModeChange).toHaveBeenCalledWith('arkade')
  })

  it('hides Bark when showBark is false', () => {
    render(
      <ReceiveModeToggle
        mode="bitcoin"
        onModeChange={vi.fn()}
        showLightning={false}
        showArkade={false}
        showBark={false}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Bark' })).not.toBeInTheDocument()
  })

  it('calls onModeChange with bark', async () => {
    const user = userEvent.setup()
    const onModeChange = vi.fn()
    render(
      <ReceiveModeToggle
        mode="bitcoin"
        onModeChange={onModeChange}
        showLightning={false}
        showArkade={true}
        showBark={true}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Bark' }))
    expect(onModeChange).toHaveBeenCalledWith('bark')
  })
})
