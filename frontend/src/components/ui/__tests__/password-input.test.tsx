import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordInput } from '@/components/ui/password-input'

describe('PasswordInput', () => {
  it('sets name from passwordKind and optional nameSuffix', () => {
    const { rerender } = render(
      <PasswordInput passwordKind="app" aria-label="Password" />,
    )
    expect(screen.getByLabelText('Password')).toHaveAttribute('name', 'app')

    rerender(<PasswordInput passwordKind="export" nameSuffix="confirm" aria-label="Password" />)
    expect(screen.getByLabelText('Password')).toHaveAttribute('name', 'export-confirm')
  })

  it('uses type password when masked, type text when revealed, autocomplete off, and merges aria-describedby', async () => {
    const user = userEvent.setup()
    render(
      <PasswordInput
        passwordKind="app"
        aria-label="Password"
        aria-describedby="extra-help"
      />,
    )
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'off')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toContain('extra-help')
    expect(describedBy?.split(/\s+/).length).toBeGreaterThanOrEqual(2)

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
  })

  it('toggles visibility control', async () => {
    const user = userEvent.setup()
    render(<PasswordInput passwordKind="app" defaultValue="secret" aria-label="Password" />)

    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })
})
