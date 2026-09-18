import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}))

const ensureMigrated = vi.hoisted(() => vi.fn())
const getDatabase = vi.hoisted(() => vi.fn())
vi.mock('@/db', () => ({
  ensureMigrated: (...args: unknown[]) => ensureMigrated(...args),
  getDatabase: (...args: unknown[]) => getDatabase(...args),
}))

const abandonFirstRunAppPasswordChoiceIfNoWallets = vi.hoisted(() => vi.fn())
vi.mock('@/lib/wallet/abandon-first-run-app-password-choice', () => ({
  abandonFirstRunAppPasswordChoiceIfNoWallets: (...args: unknown[]) =>
    abandonFirstRunAppPasswordChoiceIfNoWallets(...args),
}))

import { SetupBackToWelcomeButton } from '@/components/SetupBackToWelcomeButton'

describe('SetupBackToWelcomeButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockResolvedValue(undefined)
    ensureMigrated.mockResolvedValue(undefined)
    getDatabase.mockReturnValue({})
    abandonFirstRunAppPasswordChoiceIfNoWallets.mockResolvedValue(undefined)
  })

  it('toasts and stays on the page when abandon fails', async () => {
    const user = userEvent.setup()
    abandonFirstRunAppPasswordChoiceIfNoWallets.mockRejectedValueOnce(
      new Error('Could not revert first-run password choice'),
    )
    renderWithProviders(<SetupBackToWelcomeButton />)

    await user.click(screen.getByRole('button', { name: 'Back to setup' }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Could not revert first-run password choice')
    })
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Back to setup' })).toBeEnabled()
  })

  it('toasts and re-enables when navigate rejects', async () => {
    const user = userEvent.setup()
    mockNavigate.mockRejectedValueOnce(new Error('Navigation failed'))
    renderWithProviders(<SetupBackToWelcomeButton />)

    await user.click(screen.getByRole('button', { name: 'Back to setup' }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Navigation failed')
    })
    expect(screen.getByRole('button', { name: 'Back to setup' })).toBeEnabled()
  })
})
