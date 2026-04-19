import { useMemo } from 'react'
import { legalI18n, getLegalLocalesWithBody } from '../i18n/legal-i18n'
import { useLegalLocale, type LegalLocale } from './legal-locale'

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
 * Resolves which legal notice body and title to show from `locales/{locale}/legal.json` and user locale.
 * Hides entirely when both languages have empty body. Omits switcher when only one language has content.
 */
export function useLegalNoticeDisplay(): LegalNoticeDisplay {
  const { hasDe, hasEn } = getLegalLocalesWithBody()
  const { locale, setLocale } = useLegalLocale()

  let activeLocale: LegalLocale
  if (!hasDe) {
    activeLocale = 'en'
  } else if (!hasEn) {
    activeLocale = 'de'
  } else {
    activeLocale = locale
  }

  const t = useMemo(
    () => legalI18n.getFixedT(activeLocale, 'legal'),
    [activeLocale],
  )

  if (!hasDe && !hasEn) {
    return { visible: false }
  }

  const showSwitcher = hasDe && hasEn
  const title = t('sectionTitle')
  const body = t('body')

  return {
    visible: true,
    title,
    body,
    showSwitcher,
    activeLocale,
    setLocale,
  }
}
