import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LegalNoticeCard } from '@/components/LegalNoticeCard'
import {
  LEGAL_LOCALE_STORAGE_KEY,
  DISCLAIMER_BODY_DE,
  DISCLAIMER_BODY_EN,
} from '@/lib/legal-locale'

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

  it('renders German legal hub when stored legal locale is de', () => {
    localStorage.setItem(LEGAL_LOCALE_STORAGE_KEY, 'de')
    render(<LegalNoticeCard />)
    expect(screen.getByText('Rechtliche Hinweise')).toBeInTheDocument()
    expect(screen.getByText('Impressum')).toBeInTheDocument()
    expect(screen.getByText(/Inhalte gemäß §5 DDG/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Datenschutzerklärung/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
    expect(screen.getByText(DISCLAIMER_BODY_DE)).toBeInTheDocument()
  })

  it('renders English legal hub when stored legal locale is en', () => {
    localStorage.setItem(LEGAL_LOCALE_STORAGE_KEY, 'en')
    render(<LegalNoticeCard />)
    expect(screen.getByText('Legal')).toBeInTheDocument()
    expect(screen.getByText('Legal Notice')).toBeInTheDocument()
    expect(
      screen.getByText(/Information pursuant to Section 5 of the German Digital Services Act \(DDG\)/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Privacy Policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
    expect(screen.getByText(DISCLAIMER_BODY_EN)).toBeInTheDocument()
  })

  it('shows switcher and toggles body when both languages are set', async () => {
    const user = userEvent.setup()
    render(<LegalNoticeCard />)

    expect(
      screen.getByRole('group', { name: /legal notice language/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /English/i }))
    expect(screen.getByText('Legal')).toBeInTheDocument()
    expect(screen.getByText('Legal Notice')).toBeInTheDocument()
    expect(
      screen.getByText(/Information pursuant to Section 5 of the German Digital Services Act \(DDG\)/),
    ).toBeInTheDocument()
    expect(screen.getByText(DISCLAIMER_BODY_EN)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Deutsch/i }))
    expect(screen.getByText('Rechtliche Hinweise')).toBeInTheDocument()
    expect(screen.getByText('Impressum')).toBeInTheDocument()
    expect(screen.getByText(/Inhalte gemäß §5 DDG/)).toBeInTheDocument()
    expect(screen.getByText(DISCLAIMER_BODY_DE)).toBeInTheDocument()
  })
})
