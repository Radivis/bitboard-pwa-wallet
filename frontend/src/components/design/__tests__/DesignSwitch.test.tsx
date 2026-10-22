import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DesignSwitch } from '@/components/design/DesignSwitch'

describe('DesignSwitch', () => {
  it('marks the selected label and reports the next value', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <DesignSwitch
        aria-label="Network type"
        value="online"
        onValueChange={onValueChange}
        options={[
          { value: 'offline', label: 'Offline' },
          { value: 'online', label: 'Online' },
        ]}
      />,
    )

    const online = screen.getByRole('button', { name: 'Online' })
    const offline = screen.getByRole('button', { name: 'Offline' })
    expect(online).toHaveAttribute('aria-pressed', 'true')
    expect(online.className).toContain('--design-nav-background-selected')
    expect(offline).toHaveAttribute('aria-pressed', 'false')
    expect(offline.className).not.toContain('--design-nav-background-selected')
    expect(screen.getByRole('group', { name: 'Network type' }).className).toContain(
      '--design-nav-background',
    )

    await user.click(offline)
    expect(onValueChange).toHaveBeenCalledWith('offline')
  })

  it('uses the label as the accessible name of an icon option', () => {
    render(
      <DesignSwitch
        aria-label="Theme"
        value="dark"
        onValueChange={vi.fn()}
        options={[
          { value: 'light', label: 'Light mode', icon: <svg data-testid="sun" /> },
          { value: 'dark', label: 'Dark mode', icon: <svg data-testid="moon" /> },
        ]}
      />,
    )

    const dark = screen.getByRole('button', { name: 'Dark mode' })
    expect(dark).toHaveAttribute('aria-pressed', 'true')
    expect(dark.className).toContain('--design-input-content')
    expect(screen.getByTestId('moon')).toBeInTheDocument()
    expect(screen.queryByText('Dark mode')).not.toBeInTheDocument()
  })

  it('disables every option', () => {
    render(
      <DesignSwitch
        aria-label="Network type"
        value="offline"
        disabled
        onValueChange={vi.fn()}
        options={[
          { value: 'offline', label: 'Offline' },
          { value: 'online', label: 'Online' },
        ]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Offline' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Online' })).toBeDisabled()
  })
})
