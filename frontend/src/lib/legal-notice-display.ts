import {
  LEGAL_SECTION_TITLE_DE,
  LEGAL_SECTION_TITLE_EN,
  useLegalLocale,
  type LegalLocale,
} from './legal-locale'

function trimLegalNoticeEnv(value: string | undefined): string {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

export type LegalNoticeDisplay =
  | { visible: false }
  | {
      visible: true
      title: string
      body: string
      showSwitcher: boolean
      activeLocale: LegalLocale
      setLocale: (locale: LegalLocale) => void
    }

/**
 * Resolves which legal notice body and title to show from build-time env and user locale.
 * Hides entirely when both languages are empty. Omits switcher when only one language is configured.
 */
export function useLegalNoticeDisplay(): LegalNoticeDisplay {
  const textDe = trimLegalNoticeEnv(import.meta.env.VITE_LEGAL_NOTICE_DE)
  const textEn = trimLegalNoticeEnv(import.meta.env.VITE_LEGAL_NOTICE_EN)
  const hasDe = textDe.length > 0
  const hasEn = textEn.length > 0

  const { locale, setLocale } = useLegalLocale()

  if (!hasDe && !hasEn) {
    return { visible: false }
  }

  const showSwitcher = hasDe && hasEn

  let activeLocale: LegalLocale
  if (!hasDe) {
    activeLocale = 'en'
  } else if (!hasEn) {
    activeLocale = 'de'
  } else {
    activeLocale = locale
  }

  const title =
    activeLocale === 'de' ? LEGAL_SECTION_TITLE_DE : LEGAL_SECTION_TITLE_EN
  const body = activeLocale === 'de' ? textDe : textEn

  return {
    visible: true,
    title,
    body,
    showSwitcher,
    activeLocale,
    setLocale,
  }
}
