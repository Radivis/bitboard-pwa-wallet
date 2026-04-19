import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'
import { PrivacyPage } from '../privacy'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    createFileRoute: (_path: string) => (options: Record<string, unknown>) => ({
      options,
    }),
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a data-testid="router-link" href={to}>
        {children}
      </a>
    ),
  }
})

describe('PrivacyPage', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('renders privacy content and toggles locale', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PrivacyPage />)
    expect(
      await screen.findByText(/This privacy policy covers both/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Deutsch/i }))
    expect(
      await screen.findByText(
        /Diese Datenschutzerklärung gilt für die Marketing-Website/i,
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /English/i }))
    expect(
      screen.getByText(/This privacy policy covers both/i),
    ).toBeInTheDocument()
  })
})
