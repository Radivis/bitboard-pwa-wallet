import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DesignSwitch } from '@/components/design/DesignSwitch'

const optionBox = {
  Offline: { left: 4, top: 4, width: 72, height: 36 },
  Online: { left: 84, top: 4, width: 68, height: 36 },
} as const

function installOptionBoxes() {
  const originals = {
    offsetLeft: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetLeft'),
    offsetTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop'),
    offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
    offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
    offsetParent: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent'),
  }
  function boxFor(element: Element) {
    if (!(element instanceof HTMLButtonElement)) return null
    if (element.textContent === 'Offline') return optionBox.Offline
    if (element.textContent === 'Online') return optionBox.Online
    return null
  }
  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get() {
      return boxFor(this)?.left ?? 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get() {
      return boxFor(this)?.top ?? 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      return boxFor(this)?.width ?? 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return boxFor(this)?.height ?? 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return this.parentElement
    },
  })
  return () => {
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, name, descriptor)
      }
    }
  }
}

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
    const group = screen.getByRole('group', { name: 'Network type' })
    const selectedSurface = group.querySelector('[data-slot="design-switch-indicator"]')
    expect(online).toHaveAttribute('aria-pressed', 'true')
    expect(offline).toHaveAttribute('aria-pressed', 'false')
    expect(selectedSurface?.className).toContain('--design-nav-background-selected')
    expect(selectedSurface?.className).toContain('duration-[0.3s]')
    expect(selectedSurface?.className).toContain('ease-out')
    expect(online.className).not.toContain('--design-nav-background-selected')
    expect(offline.className).not.toContain('--design-nav-background-selected')
    expect(group.className).toContain('--design-nav-background')

    await user.click(offline)
    expect(onValueChange).toHaveBeenCalledWith('offline')
  })

  it('slides the selected surface to the next option', async () => {
    const user = userEvent.setup()
    const restoreBoxes = installOptionBoxes()
    const frames: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        frames.push(callback)
        return frames.length
      })

    function ControlledSwitch() {
      const [value, setValue] = useState<'offline' | 'online'>('offline')
      return (
        <DesignSwitch
          aria-label="Network type"
          value={value}
          onValueChange={setValue}
          options={[
            { value: 'offline', label: 'Offline' },
            { value: 'online', label: 'Online' },
          ]}
        />
      )
    }

    try {
      render(<ControlledSwitch />)
      const surface = document.querySelector('[data-slot="design-switch-indicator"]')
      expect(surface).toHaveStyle({
        transform: 'translate(4px, 4px)',
        width: '72px',
        transition: 'none',
      })

      await user.click(screen.getByRole('button', { name: 'Online' }))
      expect(frames).toHaveLength(1)
      act(() => {
        frames[0](0)
      })

      expect(surface).toHaveStyle({
        transform: 'translate(84px, 4px)',
        width: '68px',
      })
      expect(surface).not.toHaveStyle({ transition: 'none' })
    } finally {
      requestAnimationFrameSpy.mockRestore()
      restoreBoxes()
    }
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

  it('wraps options within the parent width', () => {
    render(
      <DesignSwitch
        aria-label="Fee rate"
        wrap
        value="low"
        onValueChange={vi.fn()}
        options={[
          { value: 'low', label: 'Low (0.50)' },
          { value: 'medium', label: 'Medium (2.00)' },
          { value: 'high', label: 'High (10.00)' },
          { value: 'custom', label: 'Custom' },
        ]}
      />,
    )

    const group = screen.getByRole('group', { name: 'Fee rate' })
    expect(group.className).toContain('flex-wrap')
    expect(group.className).toContain('w-full')
    expect(group.className).not.toContain('w-fit')
    const low = screen.getByRole('button', { name: 'Low (0.50)' })
    expect(low.className).toContain('w-full')
    expect(low.parentElement?.className).toContain('min-w-max')
    expect(low.parentElement?.className).toContain('shrink-0')
    expect(low.parentElement?.className).toContain('grow')
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
