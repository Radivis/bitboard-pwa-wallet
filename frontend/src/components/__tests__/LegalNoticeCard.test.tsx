import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
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

const shouldShowLegalNoticeMock = vi.hoisted(() => vi.fn(() => true))

vi.mock('@common/legal/legal-notice-availability', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@common/legal/legal-notice-availability')
  >()
  return {
    ...actual,
    shouldShowLegalNotice: () => shouldShowLegalNoticeMock(),
  }
})

describe('LegalNoticeCard', () => {
  afterEach(() => {
    vi.clearAllMocks()
    shouldShowLegalNoticeMock.mockReturnValue(true)
    localStorage.clear()
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it('renders nothing when legal notice is hidden', () => {
    shouldShowLegalNoticeMock.mockReturnValue(false)
    const { container } = render(<LegalNoticeCard />)
    expect(container.firstChild).toBeNull()
  })

  it('renders German imprint when stored legal locale is de', () => {
    shouldShowLegalNoticeMock.mockReturnValue(true)
    localStorage.setItem(LEGAL_LOCALE_STORAGE_KEY, 'de')
    render(<LegalNoticeCard />)
    expect(screen.getByText('Impressum')).toBeInTheDocument()
    expect(screen.getByText(/Anbieter/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  it('renders English imprint when stored legal locale is en', () => {
    shouldShowLegalNoticeMock.mockReturnValue(true)
    localStorage.setItem(LEGAL_LOCALE_STORAGE_KEY, 'en')
    render(<LegalNoticeCard />)
    expect(screen.getByText('Legal notice')).toBeInTheDocument()
    expect(screen.getByText(/Provider/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  it('shows switcher and toggles body when both languages are set', async () => {
    shouldShowLegalNoticeMock.mockReturnValue(true)
    const user = userEvent.setup()
    render(<LegalNoticeCard />)

    expect(
      screen.getByRole('group', { name: /legal notice language/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /English/i }))
    expect(screen.getByText('Legal notice')).toBeInTheDocument()
    expect(screen.getByText(/Provider/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Deutsch/i }))
    expect(screen.getByText('Impressum')).toBeInTheDocument()
    expect(screen.getByText(/Anbieter/)).toBeInTheDocument()
  })
})
