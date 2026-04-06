import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  }
})

import { SetAppPasswordModal } from '@/components/SetAppPasswordModal'

const mockSetPassword = vi.fn()
vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector: (s: { setPassword: typeof mockSetPassword }) => unknown) =>
    selector({ setPassword: mockSetPassword }),
}))

vi.mock('@/components/PasswordStrengthIndicator', () => ({
  PasswordStrengthIndicator: () => <div data-testid="password-strength" />,
}))

vi.mock('@/components/infomode/InfomodeToggle', () => ({
  InfomodeToggle: () => <button type="button" aria-label="Turn on infomode" />,
}))

describe('SetAppPasswordModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it('shows funds loss warning about password recovery and mnemonic backup', () => {
    renderWithProviders(<SetAppPasswordModal open />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Bitboard cannot recover your app password/i)).toBeInTheDocument()
    expect(screen.getByText(/permanently lose access to your funds/i)).toBeInTheDocument()
  })

  it('shows mismatch when confirm differs', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SetAppPasswordModal open />)

    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText('Confirm password'), 'different')

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
  })

  it('Continue disabled when password too short', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SetAppPasswordModal open />)

    await user.type(screen.getByLabelText('Password'), 'short')
    await user.type(screen.getByLabelText('Confirm password'), 'short')

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('close button navigates back to setup', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SetAppPasswordModal open />)

    await user.click(screen.getByRole('button', { name: 'Back to setup' }))

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/setup' })
  })

  it('submits matching passwords of at least 8 chars and sets session password', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SetAppPasswordModal open />)

    await user.type(screen.getByLabelText('Password'), 'validpassword123')
    await user.type(screen.getByLabelText('Confirm password'), 'validpassword123')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(mockSetPassword).toHaveBeenCalledWith('validpassword123')
  })
})
