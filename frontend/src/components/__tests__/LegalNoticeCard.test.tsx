import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LegalNoticeCard } from '@/components/LegalNoticeCard'

describe('LegalNoticeCard', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it('renders nothing when both legal notice env vars are empty', () => {
    vi.stubEnv('VITE_LEGAL_NOTICE_DE', '')
    vi.stubEnv('VITE_LEGAL_NOTICE_EN', '')
    const { container } = render(<LegalNoticeCard />)
    expect(container.firstChild).toBeNull()
  })

  it('renders German Impressum when only DE is set', () => {
    vi.stubEnv('VITE_LEGAL_NOTICE_DE', 'Nur DE')
    vi.stubEnv('VITE_LEGAL_NOTICE_EN', '')
    render(<LegalNoticeCard />)
    expect(screen.getByText('Impressum')).toBeInTheDocument()
    expect(screen.getByText('Nur DE')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /legal notice language/i })).not.toBeInTheDocument()
  })

  it('renders English Legal notice when only EN is set', () => {
    vi.stubEnv('VITE_LEGAL_NOTICE_DE', '')
    vi.stubEnv('VITE_LEGAL_NOTICE_EN', 'EN only body')
    render(<LegalNoticeCard />)
    expect(screen.getByText('Legal notice')).toBeInTheDocument()
    expect(screen.getByText('EN only body')).toBeInTheDocument()
  })

  it('shows switcher and toggles body when both languages are set', async () => {
    vi.stubEnv('VITE_LEGAL_NOTICE_DE', 'Text DE')
    vi.stubEnv('VITE_LEGAL_NOTICE_EN', 'Text EN')
    const user = userEvent.setup()
    render(<LegalNoticeCard />)

    expect(
      screen.getByRole('group', { name: /legal notice language/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /English/i }))
    expect(screen.getByText('Legal notice')).toBeInTheDocument()
    expect(screen.getByText('Text EN')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Deutsch/i }))
    expect(screen.getByText('Impressum')).toBeInTheDocument()
    expect(screen.getByText('Text DE')).toBeInTheDocument()
  })
})
