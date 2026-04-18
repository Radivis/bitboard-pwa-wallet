import { useCallback, useState } from 'react'

/** Shared with future privacy policy and other legal copy. */
export const LEGAL_LOCALE_STORAGE_KEY = 'bitboard.legalLocale' as const

export const LEGAL_SECTION_TITLE_DE = 'Impressum'
export const LEGAL_SECTION_TITLE_EN = 'Legal notice'

export const LEGAL_NOTICE_FLAG_DE = '\u{1F1E9}\u{1F1EA}'
export const LEGAL_NOTICE_FLAG_EN = '\u{1F1EC}\u{1F1E7}'

export type LegalLocale = 'de' | 'en'

export function getNavigatorLegalLocale(): LegalLocale {
  if (typeof navigator === 'undefined') return 'en'
  const lang = navigator.language?.toLowerCase() ?? ''
  return lang.startsWith('de') ? 'de' : 'en'
}

export function readStoredLegalLocale(): LegalLocale | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(LEGAL_LOCALE_STORAGE_KEY)
  if (raw === 'de' || raw === 'en') return raw
  return null
}

export function writeStoredLegalLocale(locale: LegalLocale): void {
  localStorage.setItem(LEGAL_LOCALE_STORAGE_KEY, locale)
}

function getInitialLegalLocale(): LegalLocale {
  if (typeof window === 'undefined') return 'en'
  return readStoredLegalLocale() ?? getNavigatorLegalLocale()
}

/**
 * Persists explicit de/en choice for legal sections (imprint, future privacy policy).
 * Initial value: localStorage if valid, else `navigator.language` (de vs rest → en).
 */
export function useLegalLocale(): {
  locale: LegalLocale
  setLocale: (locale: LegalLocale) => void
} {
  const [locale, setLocaleState] = useState<LegalLocale>(getInitialLegalLocale)
  const setLocale = useCallback((next: LegalLocale) => {
    setLocaleState(next)
    writeStoredLegalLocale(next)
  }, [])
  return { locale, setLocale }
}
