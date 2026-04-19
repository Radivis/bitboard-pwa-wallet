import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LegalNoticeCard } from '@/components/LegalNoticeCard'

vi.mock('@/legal-entity/legal-entity', () => {
  const empty = { name: '', address: '', email: '' }
  return {
    legalEntity: empty,
    hasLegalEntityData: (e: typeof empty) =>
      [e.name, e.address, e.email].some((s) => s.trim().length > 0),
  }
})
import {
  legalI18n,
  restoreLegalI18nResourceBundles,
  type LegalNamespace,
} from '@/i18n/legal-i18n'

const emptyLegal: LegalNamespace = {
  sectionTitle: '',
  body: '',
  privacySharedLanguageUserNote: '',
}

function setLegalResourceBundles(de: LegalNamespace, en: LegalNamespace): void {
  legalI18n.addResourceBundle('de', 'legal', de, true, true)
  legalI18n.addResourceBundle('en', 'legal', en, true, true)
}

describe('LegalNoticeCard', () => {
  afterEach(() => {
    restoreLegalI18nResourceBundles()
    localStorage.clear()
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it('renders nothing when both legal notice bodies are empty', () => {
    setLegalResourceBundles(emptyLegal, emptyLegal)
    const { container } = render(<LegalNoticeCard />)
    expect(container.firstChild).toBeNull()
  })

  it('renders German Impressum when only DE is set', () => {
    setLegalResourceBundles(
      { ...emptyLegal, sectionTitle: 'Impressum', body: 'Nur DE' },
      emptyLegal,
    )
    render(<LegalNoticeCard />)
    expect(screen.getByText('Impressum')).toBeInTheDocument()
    expect(screen.getByText('Nur DE')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /legal notice language/i })).not.toBeInTheDocument()
  })

  it('renders English Legal notice when only EN is set', () => {
    setLegalResourceBundles(emptyLegal, {
      ...emptyLegal,
      sectionTitle: 'Legal notice',
      body: 'EN only body',
    })
    render(<LegalNoticeCard />)
    expect(screen.getByText('Legal notice')).toBeInTheDocument()
    expect(screen.getByText('EN only body')).toBeInTheDocument()
  })

  it('shows switcher and toggles body when both languages are set', async () => {
    setLegalResourceBundles(
      { ...emptyLegal, sectionTitle: 'Impressum', body: 'Text DE' },
      { ...emptyLegal, sectionTitle: 'Legal notice', body: 'Text EN' },
    )
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
