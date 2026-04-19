import { useMemo } from 'react'
import { legalI18n, getLegalLocalesWithBody } from '../i18n/legal-i18n'
import {
  legalEntity,
  hasLegalEntityData,
  type LegalEntity,
} from '../legal-entity/legal-entity'
import { useLegalLocale, type LegalLocale } from './legal-locale'

export type LegalNoticeDisplay =
  | { visible: false }
  | {
      visible: true
      title: string
      body: string
      entity: LegalEntity
      showSwitcher: boolean
      activeLocale: LegalLocale
      setLocale: (locale: LegalLocale) => void
    }

/**
 * Resolves legal notice from `locales/{locale}/legal.json`, `legal-entity/entity.json`, and user locale.
 * Hides when there is no body in either language and no entity data. Omits switcher when only one language has body.
 */
export function useLegalNoticeDisplay(): LegalNoticeDisplay {
  const { hasDe, hasEn } = getLegalLocalesWithBody()
  const { locale, setLocale } = useLegalLocale()
  const hasEntity = hasLegalEntityData(legalEntity)

  let activeLocale: LegalLocale
  if (!hasDe && !hasEn) {
    activeLocale = locale
  } else if (!hasDe) {
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

  if (!hasDe && !hasEn && !hasEntity) {
    return { visible: false }
  }

  const showSwitcher = hasDe && hasEn
  const title = t('sectionTitle')
  const body = t('body')

  return {
    visible: true,
    title,
    body,
    entity: legalEntity,
    showSwitcher,
    activeLocale,
    setLocale,
  }
}
