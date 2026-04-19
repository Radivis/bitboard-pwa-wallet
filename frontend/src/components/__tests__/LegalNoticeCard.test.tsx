import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LegalNoticeCard } from '@/components/LegalNoticeCard'
import { LEGAL_LOCALE_STORAGE_KEY } from '@/lib/legal-locale'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  }
})

describe('LegalNoticeCard', () => {
  afterEach(() => {
    localStorage.clear()
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it('renders German imprint when stored legal locale is de', () => {
    localStorage.setItem(LEGAL_LOCALE_STORAGE_KEY, 'de')
    render(<LegalNoticeCard />)
    expect(screen.getByText('Impressum')).toBeInTheDocument()
    expect(screen.getByText(/Inhalte gemäß §5 DDG/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Datenschutzerklärung/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  it('renders English imprint when stored legal locale is en', () => {
    localStorage.setItem(LEGAL_LOCALE_STORAGE_KEY, 'en')
    render(<LegalNoticeCard />)
    expect(screen.getByText('Legal notice')).toBeInTheDocument()
    expect(
      screen.getByText(/Information pursuant to Section 5 of the German Digital Services Act \(DDG\)/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  it('shows switcher and toggles body when both languages are set', async () => {
    const user = userEvent.setup()
    render(<LegalNoticeCard />)

    expect(
      screen.getByRole('group', { name: /legal notice language/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /English/i }))
    expect(screen.getByText('Legal notice')).toBeInTheDocument()
    expect(
      screen.getByText(/Information pursuant to Section 5 of the German Digital Services Act \(DDG\)/),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Deutsch/i }))
    expect(screen.getByText('Impressum')).toBeInTheDocument()
    expect(screen.getByText(/Inhalte gemäß §5 DDG/)).toBeInTheDocument()
  })
})
