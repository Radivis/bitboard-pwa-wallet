/**
 * Legal-only i18next instance (`createInstance`). When general UI i18n is added, introduce a
 * separate `app-i18n` instance (and optionally `react-i18next`) so legal and UI locales never mix.
 */
import i18next, { type Resource } from 'i18next'
import legalDe from '../locales/de/legal.json'
import legalEn from '../locales/en/legal.json'

/** Keys bundled under the `legal` namespace (one file per locale: `locales/{locale}/legal.json`). */
export type LegalNamespace = {
  sectionTitle: string
  body: string
}

const emptyLegalNs: LegalNamespace = {
  sectionTitle: '',
  body: '',
}

const legalDeTyped = legalDe as LegalNamespace
const legalEnTyped = legalEn as LegalNamespace

/** Dedicated i18next instance for legal copy only — keep separate from future app UI i18n. */
export const legalI18n = i18next.createInstance()

void legalI18n.init({
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'legal',
  ns: ['legal'],
  resources: {
    de: { legal: legalDeTyped },
    en: { legal: legalEnTyped },
  } satisfies Resource,
  interpolation: { escapeValue: false },
})

function trimmedBody(ns: LegalNamespace | undefined): string {
  return (ns?.body ?? '').trim()
}

function getLegalNsFromStore(locale: 'de' | 'en'): LegalNamespace {
  const bundle = legalI18n.getResourceBundle(locale, 'legal') as LegalNamespace | undefined
  return bundle ?? emptyLegalNs
}

/** Which legal locales have non-empty imprint body text (drives visibility and switcher). */
export function getLegalLocalesWithBody(): { hasDe: boolean; hasEn: boolean } {
  return {
    hasDe: trimmedBody(getLegalNsFromStore('de')).length > 0,
    hasEn: trimmedBody(getLegalNsFromStore('en')).length > 0,
  }
}

/** Restore bundled JSON into the legal instance (e.g. Vitest afterEach). */
export function restoreLegalI18nResourceBundles(): void {
  legalI18n.addResourceBundle('de', 'legal', legalDeTyped, true, true)
  legalI18n.addResourceBundle('en', 'legal', legalEnTyped, true, true)
}
