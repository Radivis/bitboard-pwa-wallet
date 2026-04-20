import { useCallback, useState } from 'react'

/**
 * Legal copy uses locale-specific TS/TSX modules plus small constants here (not i18next).
 * Adopting i18next where it helps (e.g. shared UI chrome, pluralization) is planned for the
 * future; long-form legal text will likely stay in dedicated locale documents per language.
 */

/** Shared with future privacy policy and other legal copy. */
export const LEGAL_LOCALE_STORAGE_KEY = 'bitboard.legalLocale' as const

export const PRIVACY_PAGE_TITLE_DE = 'Datenschutzerklärung'
export const PRIVACY_PAGE_TITLE_EN = 'Privacy Policy'

/** Umbrella heading for imprint + privacy + disclaimer (settings card, marketing footer). */
export const LEGAL_HUB_TITLE_DE = 'Rechtliche Hinweise'
export const LEGAL_HUB_TITLE_EN = 'Legal'

export const LEGAL_NOTICE_TITLE_DE = 'Impressum'
export const LEGAL_NOTICE_TITLE_EN = 'Legal Notice'

export const LEGAL_SUBSECTION_DISCLAIMER_DE = 'Haftungsausschluss'
export const LEGAL_SUBSECTION_DISCLAIMER_EN = 'Disclaimer'

/** Non-custodial disclaimer (app + landing). */
export const DISCLAIMER_BODY_DE =
  'Bitboard Wallet ist eine nicht verwahrende (Non-Custodial-)Wallet: Sie verwalten Ihre Schlüssel und Guthaben selbst. Der Betreiber verwahrt keine Vermögenswerte und hat keinen Zugriff auf Ihre Wiederherstellungsphrase oder private Schlüssel. Sie sind für die Sicherung Ihrer Zugangsdaten und für Ihre Transaktionen selbst verantwortlich. Soweit gesetzlich zulässig, haftet der Betreiber nicht für Verluste, Schäden oder entgangenen Gewinn aus der Nutzung der App.'

export const DISCLAIMER_BODY_EN =
  'Bitboard Wallet is a non-custodial wallet: you hold your keys and funds. The operator does not custody assets and has no access to your recovery phrase or private keys. You are solely responsible for securing your credentials and for your transactions. To the extent permitted by law, the operator accepts no liability for any losses, damages, or missed profits arising from use of the app.'

/** Landing footer / dark background — contrast-safe (avoid theme primary white-on-white). */
export function legalLocaleSwitcherLandingButtonClass(active: boolean): string {
  return [
    'gap-1.5 border shadow-none',
    active
      ? 'border-white/50 bg-white/15 text-white hover:bg-white/20 hover:text-white'
      : 'border-white/25 bg-transparent text-gray-300 hover:border-white/40 hover:bg-white/10 hover:text-white',
  ].join(' ')
}

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
