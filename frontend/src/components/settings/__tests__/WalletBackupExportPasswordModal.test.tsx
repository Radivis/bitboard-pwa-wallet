import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'
import { WalletBackupExportPasswordModal } from '@/components/settings/WalletBackupExportPasswordModal'

vi.mock('@/components/infomode/InfomodeToggle', () => ({
  InfomodeToggle: () => <button type="button" aria-label="Turn on infomode" />,
}))

describe('WalletBackupExportPasswordModal', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    isBusy: false,
    checkSigningPasswordMatchesAppPassword: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows green status when signing password matches app password', async () => {
    const user = userEvent.setup()
    defaultProps.checkSigningPasswordMatchesAppPassword = vi
      .fn()
      .mockResolvedValue({ match: true, skipped: false })

    renderWithProviders(<WalletBackupExportPasswordModal {...defaultProps} />)

    await user.type(screen.getByLabelText('Password for signing'), 'same-app-password')
    await user.type(screen.getByLabelText('Confirm password'), 'same-app-password')

    await waitFor(() => {
      expect(screen.getByText(/Same as your Bitboard app password/i)).toBeInTheDocument()
    })
    expect(defaultProps.checkSigningPasswordMatchesAppPassword).toHaveBeenCalledWith(
      'same-app-password',
    )
  })

  it('shows warning when signing password does not match app password', async () => {
    const user = userEvent.setup()
    defaultProps.checkSigningPasswordMatchesAppPassword = vi
      .fn()
      .mockResolvedValue({ match: false, skipped: false })

    renderWithProviders(<WalletBackupExportPasswordModal {...defaultProps} />)

    await user.type(screen.getByLabelText('Password for signing'), 'other-password')
    await user.type(screen.getByLabelText('Confirm password'), 'other-password')

    await waitFor(() => {
      expect(
        screen.getByText(/does not match your Bitboard app password/i),
      ).toBeInTheDocument()
    })
  })

  it('shows neutral message when comparison is skipped', async () => {
    const user = userEvent.setup()
    defaultProps.checkSigningPasswordMatchesAppPassword = vi
      .fn()
      .mockResolvedValue({ match: false, skipped: true })

    renderWithProviders(<WalletBackupExportPasswordModal {...defaultProps} />)

    await user.type(
      screen.getByLabelText('Password for signing'),
      'long-enough-password',
    )
    await user.type(
      screen.getByLabelText('Confirm password'),
      'long-enough-password',
    )

    await waitFor(() => {
      expect(screen.getByText(/Could not compare to the app password/i)).toBeInTheDocument()
    })
  })

  it('requires at least 12 characters and does not run app-password check until then', async () => {
    const user = userEvent.setup()
    const check = vi.fn().mockResolvedValue({ match: true, skipped: false })

    renderWithProviders(
      <WalletBackupExportPasswordModal {...defaultProps} checkSigningPasswordMatchesAppPassword={check} />,
    )

    await user.type(screen.getByLabelText('Password for signing'), 'short')
    await user.type(screen.getByLabelText('Confirm password'), 'short')

    expect(
      screen.getByText(/Bitboard’s minimum app password length/i),
    ).toBeInTheDocument()
    expect(check).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Sign and export' })).toBeDisabled()
  })
})
