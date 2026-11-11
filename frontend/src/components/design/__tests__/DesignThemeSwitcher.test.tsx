import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DesignThemeSwitcher } from '@/components/design/DesignThemeSwitcher'
import { useThemeStore } from '@/stores/themeStore'

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}))

describe('DesignThemeSwitcher', () => {
  beforeEach(() => {
    useThemeStore.setState({ themeMode: 'light' })
  })

  it('presses the active theme and calls setThemeMode', async () => {
    const user = userEvent.setup()
    render(<DesignThemeSwitcher />)

    expect(screen.getByRole('button', { name: 'Light mode' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'System preference' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Light mode' }).className).toContain(
      '--design-nav-background-selected',
    )

    await user.click(screen.getByRole('button', { name: 'Dark mode' }))

    expect(useThemeStore.getState().themeMode).toBe('dark')
  })
})
